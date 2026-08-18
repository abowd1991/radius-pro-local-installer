import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { isJobEnabled } from "./cronJobGuard";

const execAsync = promisify(exec);

// Backup configuration
const BACKUP_DIR = process.env.BACKUP_DIR || "/home/ubuntu/radius-backups";
const MAX_DAILY_BACKUPS = 7;
const MAX_WEEKLY_BACKUPS = 4;

// Ensure backup directory exists
async function ensureBackupDir(): Promise<void> {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  
  const dailyDir = path.join(BACKUP_DIR, "daily");
  const weeklyDir = path.join(BACKUP_DIR, "weekly");
  const manualDir = path.join(BACKUP_DIR, "manual");
  
  if (!fs.existsSync(dailyDir)) fs.mkdirSync(dailyDir, { recursive: true });
  if (!fs.existsSync(weeklyDir)) fs.mkdirSync(weeklyDir, { recursive: true });
  if (!fs.existsSync(manualDir)) fs.mkdirSync(manualDir, { recursive: true });
}

// Backup types
export type BackupType = "daily" | "weekly" | "manual";

export interface BackupInfo {
  id: string;
  filename: string;
  type: BackupType;
  size: number;
  sizeFormatted: string;
  createdAt: Date;
  path: string;
}

type QueryRow = Record<string, unknown>;

/**
 * Drizzle/MySQL قد يعيدان rows مباشرة أو كأول عنصر ضمن [rows, metadata].
 * نوحد الصيغة هنا حتى لا يتحول صف الجدول نفسه إلى "[object Object]".
 */
export function normalizeQueryRows(result: unknown): QueryRow[] {
  if (!Array.isArray(result)) return [];
  if (Array.isArray(result[0])) return result[0] as QueryRow[];
  return result as QueryRow[];
}

// Format file size
function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Generate backup filename
function generateBackupFilename(type: BackupType): string {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `backup-${type}-${dateStr}.sql`;
}

// Get database connection info from DATABASE_URL
function getDbConfig(): { host: string; port: string; user: string; password: string; database: string } {
  const dbUrl = process.env.DATABASE_URL || "";
  // Format: mysql://user:password@host:port/database
  const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  
  if (!match) {
    throw new Error("Invalid DATABASE_URL format");
  }
  
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: match[4],
    database: match[5].split("?")[0], // Remove query params
  };
}

// Create database backup using SQL export
export async function createDatabaseBackup(type: BackupType = "manual"): Promise<BackupInfo> {
  await ensureBackupDir();
  
  const filename = generateBackupFilename(type);
  const backupPath = path.join(BACKUP_DIR, type, filename);
  
  try {
    // Get database connection
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }
    
    // Get all tables
    const tables = normalizeQueryRows(await db.execute(sql`SHOW TABLES`));
    const tableNames = tables
      .map((row) => Object.values(row).find((value) => typeof value === "string"))
      .filter((tableName): tableName is string => Boolean(tableName));

    if (tableNames.length === 0) {
      throw new Error("No database tables discovered; backup file was not created");
    }
    
    let sqlContent = `-- RADIUS SaaS Database Backup\n`;
    sqlContent += `-- Created: ${new Date().toISOString()}\n`;
    sqlContent += `-- Type: ${type}\n\n`;
    sqlContent += `SET FOREIGN_KEY_CHECKS=0;\n\n`;
    
    for (const tableName of tableNames) {
      // Get table structure
      const createTableResult = normalizeQueryRows(await db.execute(sql.raw(`SHOW CREATE TABLE \`${tableName}\``)));
      const createStatement = createTableResult[0]?.["Create Table"];
      
      if (createStatement) {
        sqlContent += `-- Table: ${tableName}\n`;
        sqlContent += `DROP TABLE IF EXISTS \`${tableName}\`;\n`;
        sqlContent += `${createStatement};\n\n`;
        
        // Get table data
        const rows = normalizeQueryRows(await db.execute(sql.raw(`SELECT * FROM \`${tableName}\``)));
        
        if (rows.length > 0) {
          const columns = Object.keys(rows[0]);
          
          for (const row of rows) {
            const values = columns.map(col => {
              const val = row[col];
              if (val === null) return "NULL";
              if (typeof val === "number") return val.toString();
              if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace("T", " ")}'`;
              return `'${String(val).replace(/'/g, "''").replace(/\\/g, "\\\\")}'`;
            });
            
            sqlContent += `INSERT INTO \`${tableName}\` (\`${columns.join("`, `")}\`) VALUES (${values.join(", ")});\n`;
          }
          sqlContent += "\n";
        }
      }
    }
    
    sqlContent += `SET FOREIGN_KEY_CHECKS=1;\n`;
    
    // Write to file
    fs.writeFileSync(backupPath, sqlContent, "utf8");
    
    const stats = fs.statSync(backupPath);
    
    return {
      id: Buffer.from(backupPath).toString("base64"),
      filename,
      type,
      size: stats.size,
      sizeFormatted: formatSize(stats.size),
      createdAt: stats.birthtime,
      path: backupPath,
    };
  } catch (error) {
    console.error("[Backup] Error creating backup:", error);
    throw new Error(`Failed to create backup: ${(error as Error).message}`);
  }
}

// List all backups
export async function listBackups(type?: BackupType): Promise<BackupInfo[]> {
  await ensureBackupDir();
  
  const backups: BackupInfo[] = [];
  const types: BackupType[] = type ? [type] : ["daily", "weekly", "manual"];
  
  for (const t of types) {
    const dir = path.join(BACKUP_DIR, t);
    
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql"));
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        
        backups.push({
          id: Buffer.from(filePath).toString("base64"),
          filename: file,
          type: t,
          size: stats.size,
          sizeFormatted: formatSize(stats.size),
          createdAt: stats.birthtime,
          path: filePath,
        });
      }
    }
  }
  
  // Sort by date descending
  return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// Get backup by ID
export async function getBackup(id: string): Promise<BackupInfo | null> {
  try {
    const filePath = Buffer.from(id, "base64").toString("utf8");
    
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    const stats = fs.statSync(filePath);
    const filename = path.basename(filePath);
    const type = filePath.includes("/daily/") ? "daily" : 
                 filePath.includes("/weekly/") ? "weekly" : "manual";
    
    return {
      id,
      filename,
      type: type as BackupType,
      size: stats.size,
      sizeFormatted: formatSize(stats.size),
      createdAt: stats.birthtime,
      path: filePath,
    };
  } catch {
    return null;
  }
}

// Get backup file content
export async function getBackupContent(id: string): Promise<Buffer | null> {
  try {
    const filePath = Buffer.from(id, "base64").toString("utf8");
    
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

// Delete backup
export async function deleteBackup(id: string): Promise<boolean> {
  try {
    const filePath = Buffer.from(id, "base64").toString("utf8");
    
    if (!fs.existsSync(filePath)) {
      return false;
    }
    
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

// Cleanup old backups
export async function cleanupOldBackups(): Promise<{ deleted: number }> {
  await ensureBackupDir();
  
  let deleted = 0;
  
  // Cleanup daily backups
  const dailyDir = path.join(BACKUP_DIR, "daily");
  if (fs.existsSync(dailyDir)) {
    const dailyFiles = fs.readdirSync(dailyDir)
      .filter(f => f.endsWith(".sql"))
      .map(f => ({
        name: f,
        path: path.join(dailyDir, f),
        time: fs.statSync(path.join(dailyDir, f)).birthtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time);
    
    // Keep only MAX_DAILY_BACKUPS
    for (let i = MAX_DAILY_BACKUPS; i < dailyFiles.length; i++) {
      fs.unlinkSync(dailyFiles[i].path);
      deleted++;
    }
  }
  
  // Cleanup weekly backups
  const weeklyDir = path.join(BACKUP_DIR, "weekly");
  if (fs.existsSync(weeklyDir)) {
    const weeklyFiles = fs.readdirSync(weeklyDir)
      .filter(f => f.endsWith(".sql"))
      .map(f => ({
        name: f,
        path: path.join(weeklyDir, f),
        time: fs.statSync(path.join(weeklyDir, f)).birthtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time);
    
    // Keep only MAX_WEEKLY_BACKUPS
    for (let i = MAX_WEEKLY_BACKUPS; i < weeklyFiles.length; i++) {
      fs.unlinkSync(weeklyFiles[i].path);
      deleted++;
    }
  }
  
  return { deleted };
}

// Get backup statistics
export async function getBackupStats(): Promise<{
  totalBackups: number;
  totalSize: number;
  totalSizeFormatted: string;
  lastDailyBackup: Date | null;
  lastWeeklyBackup: Date | null;
  dailyCount: number;
  weeklyCount: number;
  manualCount: number;
}> {
  const backups = await listBackups();
  
  const dailyBackups = backups.filter(b => b.type === "daily");
  const weeklyBackups = backups.filter(b => b.type === "weekly");
  const manualBackups = backups.filter(b => b.type === "manual");
  
  const totalSize = backups.reduce((sum, b) => sum + b.size, 0);
  
  return {
    totalBackups: backups.length,
    totalSize,
    totalSizeFormatted: formatSize(totalSize),
    lastDailyBackup: dailyBackups.length > 0 ? dailyBackups[0].createdAt : null,
    lastWeeklyBackup: weeklyBackups.length > 0 ? weeklyBackups[0].createdAt : null,
    dailyCount: dailyBackups.length,
    weeklyCount: weeklyBackups.length,
    manualCount: manualBackups.length,
  };
}

// Scheduled backup runner (to be called by cron)
export async function runScheduledBackup(type: BackupType): Promise<void> {
  console.log(`[Backup] Starting scheduled ${type} backup...`);
  
  try {
    const backup = await createDatabaseBackup(type);
    console.log(`[Backup] ${type} backup created: ${backup.filename} (${backup.sizeFormatted})`);
    
    // Cleanup old backups
    const cleanup = await cleanupOldBackups();
    if (cleanup.deleted > 0) {
      console.log(`[Backup] Cleaned up ${cleanup.deleted} old backup(s)`);
    }
  } catch (error) {
    console.error(`[Backup] Failed to create ${type} backup:`, error);
  }
}

// Initialize backup scheduler
let dailyBackupInterval: NodeJS.Timeout | null = null;
let weeklyBackupInterval: NodeJS.Timeout | null = null;

export function startBackupScheduler(): void {
  console.log("[Backup] Starting backup scheduler...");
  
  // Daily backup every 24 hours (at startup + every 24h)
  dailyBackupInterval = setInterval(async () => {
    if (!(await isJobEnabled("daily_backup"))) return;
    runScheduledBackup("daily");
  }, 24 * 60 * 60 * 1000); // 24 hours
  
  // Weekly backup every 7 days
  weeklyBackupInterval = setInterval(async () => {
    if (!(await isJobEnabled("weekly_backup"))) return;
    runScheduledBackup("weekly");
  }, 7 * 24 * 60 * 60 * 1000); // 7 days
  
  // Run initial daily backup after 1 minute
  setTimeout(() => {
    runScheduledBackup("daily");
  }, 60 * 1000);
  
  console.log("[Backup] Scheduler started - Daily backup every 24h, Weekly backup every 7 days");
}

export function stopBackupScheduler(): void {
  if (dailyBackupInterval) {
    clearInterval(dailyBackupInterval);
    dailyBackupInterval = null;
  }
  if (weeklyBackupInterval) {
    clearInterval(weeklyBackupInterval);
    weeklyBackupInterval = null;
  }
  console.log("[Backup] Scheduler stopped");
}
