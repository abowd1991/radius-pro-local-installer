/**
 * run-migrations.ts
 * 
 * Script تطبيق migrations على قاعدة بيانات VPS تلقائياً عند كل deployment.
 * يُشغَّل من GitHub Actions قبل restart PM2.
 * 
 * الفكرة: يحتفظ بجدول __migrations__ في DB يسجل الـ migrations المطبقة،
 * ويطبق فقط الـ migrations الجديدة بالترتيب.
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// قراءة DATABASE_URL من .env أو environment
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('[Migrations] DATABASE_URL not set, skipping migrations');
  process.exit(0);
}

// Parse MySQL URL
function parseMysqlUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || '3306'),
    user: u.username,
    password: u.password,
    database: u.pathname.replace('/', ''),
    ssl: u.searchParams.get('ssl-mode') === 'REQUIRED' ? { rejectUnauthorized: false } : undefined,
  };
}

async function main() {
  const config = parseMysqlUrl(dbUrl!);
  const conn = await mysql.createConnection(config);

  console.log('[Migrations] Connected to DB');

  // إنشاء جدول __migrations__ إذا لم يكن موجوداً
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS __migrations__ (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // قراءة الـ migrations المطبقة
  const [appliedRows] = await conn.execute('SELECT name FROM __migrations__ ORDER BY name ASC') as any;
  const applied = new Set((appliedRows as any[]).map((r: any) => r.name));

  // قراءة ملفات migrations من drizzle/
  const migrationsDir = path.join(__dirname, '..', 'drizzle');
  if (!fs.existsSync(migrationsDir)) {
    console.log('[Migrations] No drizzle/ directory found, skipping');
    await conn.end();
    process.exit(0);
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let applied_count = 0;
  let skipped_count = 0;

  for (const file of files) {
    if (applied.has(file)) {
      skipped_count++;
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8').trim();

    if (!sql || sql === '--> statement-breakpoint') {
      // ملف فارغ أو placeholder فقط - سجّله كمطبق
      await conn.execute('INSERT IGNORE INTO __migrations__ (name) VALUES (?)', [file]);
      skipped_count++;
      continue;
    }

    console.log(`[Migrations] Applying: ${file}`);

    try {
      // تقسيم الـ SQL إلى statements منفصلة
      const statements = sql
        .split('--> statement-breakpoint')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const stmt of statements) {
        if (stmt.trim()) {
          try {
            await conn.execute(stmt);
          } catch (stmtErr: any) {
            // تجاهل أخطاء "already exists" و "duplicate column"
            const ignorable = [
              'ER_DUP_KEYNAME',       // Index already exists
              'ER_DUP_FIELDNAME',     // Column already exists
              'ER_TABLE_EXISTS_ERROR', // Table already exists
            ];
            if (ignorable.includes(stmtErr.code)) {
              console.log(`[Migrations]   Skipping (already exists): ${stmtErr.code}`);
            } else {
              throw stmtErr;
            }
          }
        }
      }

      // تسجيل الـ migration كمطبق
      await conn.execute('INSERT IGNORE INTO __migrations__ (name) VALUES (?)', [file]);
      applied_count++;
      console.log(`[Migrations] ✓ Applied: ${file}`);
    } catch (err: any) {
      console.error(`[Migrations] ✗ Failed: ${file} - ${err.message}`);
      await conn.end();
      process.exit(1);
    }
  }

  console.log(`[Migrations] Done: ${applied_count} applied, ${skipped_count} skipped`);
  await conn.end();
  process.exit(0);
}

main().catch(err => {
  console.error('[Migrations] Fatal error:', err);
  process.exit(1);
});
