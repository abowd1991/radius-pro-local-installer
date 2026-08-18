import { router, superAdminProcedure, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import mysql from "mysql2/promise";

// Backup directory
const BACKUP_DIR = "/home/ubuntu/backups";
const MAX_BACKUPS = 10; // Retention policy

/**
 * Generate SQL dump using mysql2 directly (no mysqldump binary needed)
 */
async function createBackupSQL(): Promise<{ filename: string; content: string; size: number }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `radius-backup-${timestamp}.sql`;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DATABASE_URL not configured" });
  }

  // Parse connection string using URL parser (handles special chars like @ in password)
  let user: string, password: string, host: string, port: string, database: string;
  try {
    const parsedUrl = new URL(dbUrl.replace(/^mysql:\/\//, 'http://'));
    user = decodeURIComponent(parsedUrl.username);
    password = decodeURIComponent(parsedUrl.password);
    host = parsedUrl.hostname;
    port = parsedUrl.port || '3306';
    database = parsedUrl.pathname.replace(/^\//, '').split('?')[0];
    if (!user || !host || !database) throw new Error('Missing fields');
  } catch {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Invalid DATABASE_URL format" });
  }

  const conn = await mysql.createConnection({
    host,
    port: parseInt(port),
    user,
    password,
    database,
    ssl: { rejectUnauthorized: false },
    multipleStatements: true,
  });

  try {
    let sql = `-- RadiusPro Database Backup\n`;
    sql += `-- Generated: ${new Date().toISOString()}\n`;
    sql += `-- Database: ${database}\n\n`;
    sql += `SET FOREIGN_KEY_CHECKS=0;\n\n`;

    // Get all tables
    const [tables] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`,
      [database]
    );

    for (const tableRow of tables) {
      const tableName = tableRow['table_name'] || tableRow['TABLE_NAME'];
      if (!tableName) continue;

      // Get CREATE TABLE statement
      try {
        const [createRows] = await conn.query<mysql.RowDataPacket[]>(`SHOW CREATE TABLE \`${tableName}\``);
        if (createRows.length > 0) {
          const createStmt = createRows[0]['Create Table'] || createRows[0]['CREATE TABLE'];
          sql += `-- Table: ${tableName}\n`;
          sql += `DROP TABLE IF EXISTS \`${tableName}\`;\n`;
          sql += `${createStmt};\n\n`;
        }
      } catch (e) {
        sql += `-- Skipped table ${tableName} (view or error)\n\n`;
        continue;
      }

      // Get rows
      const [rows] = await conn.query<mysql.RowDataPacket[]>(`SELECT * FROM \`${tableName}\``);
      if (rows.length > 0) {
        sql += `-- Data for ${tableName}\n`;
        // Get column names
        const cols = Object.keys(rows[0]).map(c => `\`${c}\``).join(', ');
        const chunkSize = 100;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize);
          const values = chunk.map(row =>
            '(' + Object.values(row).map(v => {
              if (v === null) return 'NULL';
              if (typeof v === 'number' || typeof v === 'bigint') return String(v);
              if (v instanceof Date) return `'${v.toISOString().replace('T', ' ').replace('Z', '')}'`;
              if (typeof v === 'boolean') return v ? '1' : '0';
              if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
              return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
            }).join(', ') + ')'
          ).join(',\n');
          sql += `INSERT INTO \`${tableName}\` (${cols}) VALUES\n${values};\n`;
        }
        sql += '\n';
      }
    }

    sql += `SET FOREIGN_KEY_CHECKS=1;\n`;
    sql += `-- End of backup\n`;

    return { filename, content: sql, size: Buffer.byteLength(sql, 'utf-8') };
  } finally {
    await conn.end();
  }
}

/**
 * Save backup to disk
 */
async function saveBackupToDisk(filename: string, content: string): Promise<string> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, filename);
  await writeFile(backupPath, content, 'utf-8');
  return backupPath;
}

/**
 * Apply retention policy - keep only last N backups
 */
async function applyRetentionPolicy(): Promise<void> {
  try {
    if (!existsSync(BACKUP_DIR)) return;
    const { readdir } = await import('fs/promises');
    const files = await readdir(BACKUP_DIR);
    const backups = files
      .filter(f => f.startsWith('radius-backup-') && f.endsWith('.sql'))
      .sort()
      .reverse();

    if (backups.length > MAX_BACKUPS) {
      const toDelete = backups.slice(MAX_BACKUPS);
      for (const f of toDelete) {
        const fp = path.join(BACKUP_DIR, f);
        if (existsSync(fp)) await unlink(fp);
      }
    }
  } catch (error) {
    console.error("Retention policy error:", error);
  }
}

/**
 * Send backup via email
 */
async function getBackupEmailFromDb(): Promise<string> {
  try {
    const { getDb } = await import('../db');
    const { systemSettings } = await import('../../drizzle/schema');
    const { eq } = await import('drizzle-orm');
    const db = await getDb();
    if (!db) return 'abowd1991@gmail.com';
    const [row] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, 'backup_email'))
      .limit(1);
    return row?.value || 'abowd1991@gmail.com';
  } catch {
    return 'abowd1991@gmail.com';
  }
}

async function sendBackupEmail(filename: string, content: string, sizeBytes: number, toEmail?: string): Promise<void> {
  const backupEmail = toEmail || await getBackupEmailFromDb();
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.default.createTransport({
    host: 'mail.privateemail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER || 'noreply@radius-pro.com',
      pass: process.env.SMTP_PASS || '',
    },
  });

  const sizeKB = Math.round(sizeBytes / 1024);
  const dateStr = new Intl.DateTimeFormat('ar-PS', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());

  await transporter.sendMail({
    from: `"RadiusPro Backup" <${process.env.SMTP_USER || 'noreply@radius-pro.com'}>`,
    to: backupEmail,
    subject: `✅ نسخة احتياطية - RadiusPro - ${dateStr}`,
    html: `<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%); padding: 30px; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; text-align: center;">🗄️ RadiusPro Backup</h1>
      </div>
      <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
        <h2 style="color: #1f2937;">النسخة الاحتياطية جاهزة</h2>
        <p style="color: #4b5563; font-size: 16px;">تم إنشاء النسخة الاحتياطية لقاعدة بيانات RadiusPro بنجاح.</p>
        <div style="background: #dbeafe; border: 2px solid #1d4ed8; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="color: #1e40af; margin: 0;"><strong>📅 التاريخ:</strong> ${dateStr}</p>
          <p style="color: #1e40af; margin: 8px 0 0 0;"><strong>📦 حجم الملف:</strong> ${sizeKB} KB</p>
          <p style="color: #1e40af; margin: 8px 0 0 0;"><strong>📄 اسم الملف:</strong> ${filename}</p>
        </div>
        <p style="color: #6b7280; font-size: 14px;">الملف مرفق بهذا البريد. احتفظ به في مكان آمن.</p>
      </div>
    </div>`,
    attachments: [
      {
        filename: filename,
        content: content,
        contentType: 'application/sql',
      },
    ],
  });
}

export const backupRouter = router({
  /**
   * Create a new backup (Owner only)
   */
  create: superAdminProcedure
    .mutation(async () => {
      const backup = await createBackupSQL();
      await saveBackupToDisk(backup.filename, backup.content);
      await applyRetentionPolicy();

      return {
        success: true,
        filename: backup.filename,
        size: backup.size,
      };
    }),

  /**
   * Get backup email setting (Owner only)
   */
  getEmail: superAdminProcedure
    .query(async () => {
      const email = await getBackupEmailFromDb();
      return { email };
    }),

  /**
   * Set backup email setting (Owner only)
   */
  setEmail: superAdminProcedure
    .input(z.object({ email: z.string().email('بريد إلكتروني غير صالح') }))
    .mutation(async ({ input }: { input: { email: string } }) => {
      const { getDb } = await import('../db');
      const { systemSettings } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });

      // Upsert
      const [existing] = await db
        .select({ id: systemSettings.id })
        .from(systemSettings)
        .where(eq(systemSettings.key, 'backup_email'))
        .limit(1);

      if (existing) {
        await db
          .update(systemSettings)
          .set({ value: input.email, updatedAt: new Date() })
          .where(eq(systemSettings.key, 'backup_email'));
      } else {
        await db.insert(systemSettings).values({
          key: 'backup_email',
          value: input.email,
        });
      }

      return { success: true, email: input.email };
    }),

  /**
   * Create backup and send via email in background (Owner only)
   * Returns immediately, sends email asynchronously to avoid timeout
   */
  sendEmail: superAdminProcedure
    .mutation(async () => {
      // Get email before starting background job
      const targetEmail = await getBackupEmailFromDb();

      // Run backup + email in background (don't await)
      setImmediate(async () => {
        try {
          console.log('[Backup] Starting background backup generation...');
          const backup = await createBackupSQL();
          console.log(`[Backup] Generated ${backup.filename} (${Math.round(backup.size / 1024)} KB)`);

          // Save to disk
          try {
            await saveBackupToDisk(backup.filename, backup.content);
            await applyRetentionPolicy();
          } catch (e) {
            console.error('[Backup] Disk save failed:', e);
          }

          // Send email
          await sendBackupEmail(backup.filename, backup.content, backup.size, targetEmail);
          console.log(`[Backup] Email sent successfully to ${targetEmail}`);
        } catch (err) {
          console.error('[Backup] Background backup failed:', err);
        }
      });

      // Return immediately
      return {
        success: true,
        queued: true,
        sentTo: targetEmail,
        message: `جاري إنشاء النسخة الاحتياطية وإرسالها إلى ${targetEmail}. ستصل خلال دقائق.`,
      };
    }),

  /**
   * Download backup file (Owner only)
   */
  download: superAdminProcedure
    .input(z.object({ filename: z.string() }))
    .query(async ({ input }: { input: { filename: string } }) => {
      const backupPath = path.join(BACKUP_DIR, input.filename);

      if (!existsSync(backupPath)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Backup file not found" });
      }

      const content = await readFile(backupPath, 'utf-8');

      return {
        filename: input.filename,
        content,
      };
    }),

  /**
   * Upload and restore backup (Owner only)
   */
  restore: superAdminProcedure
    .input(z.object({
      filename: z.string(),
      content: z.string(),
    }))
    .mutation(async ({ input }: { input: { filename: string; content: string } }) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const tempPath = path.join(BACKUP_DIR, `restore-${timestamp}.sql`);

      try {
        await mkdir(BACKUP_DIR, { recursive: true });
        await writeFile(tempPath, input.content, 'utf-8');

        // Restore using mysql2
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DATABASE_URL not configured" });

        const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
        if (!match) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Invalid DATABASE_URL format" });

        const [, user, password, host, port, databaseWithParams] = match;
        const database = databaseWithParams.split('?')[0];

        const conn = await mysql.createConnection({
          host,
          port: parseInt(port),
          user,
          password,
          database,
          ssl: { rejectUnauthorized: false },
          multipleStatements: true,
        });

        try {
          const sqlContent = await readFile(tempPath, 'utf-8');
          // Execute in chunks to avoid memory issues
          const statements = sqlContent.split(/;\s*\n/).filter(s => s.trim() && !s.trim().startsWith('--'));
          for (const stmt of statements) {
            if (stmt.trim()) {
              try {
                await conn.query(stmt);
              } catch (e: any) {
                // Ignore non-critical errors
                if (!e.message?.includes('already exists')) {
                  console.error('[Restore] Statement error:', e.message);
                }
              }
            }
          }
        } finally {
          await conn.end();
        }

        if (existsSync(tempPath)) await unlink(tempPath);

        return { success: true };
      } catch (error: any) {
        if (existsSync(tempPath)) await unlink(tempPath).catch(() => {});
        throw error;
      }
    }),

  /**
   * List available backups (Owner only)
   */
  list: superAdminProcedure
    .query(async () => {
      try {
        if (!existsSync(BACKUP_DIR)) return [];
        const { readdir, stat } = await import('fs/promises');
        const files = await readdir(BACKUP_DIR);
        const backups = [];

        for (const f of files) {
          if (!f.startsWith('radius-backup-') || !f.endsWith('.sql')) continue;
          try {
            const s = await stat(path.join(BACKUP_DIR, f));
            backups.push({
              filename: f,
              size: s.size,
              createdAt: s.mtime,
            });
          } catch {}
        }

        return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } catch (error) {
        return [];
      }
    }),

  /**
   * Delete a backup file (Owner only)
   */
  delete: superAdminProcedure
    .input(z.object({ filename: z.string() }))
    .mutation(async ({ input }: { input: { filename: string } }) => {
      const backupPath = path.join(BACKUP_DIR, input.filename);

      if (!existsSync(backupPath)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Backup file not found" });
      }

      await unlink(backupPath);

      return { success: true };
    }),
});

// Export helper for scheduled endpoint
export { createBackupSQL, sendBackupEmail };
