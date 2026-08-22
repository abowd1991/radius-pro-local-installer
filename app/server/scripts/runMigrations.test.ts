import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "../db";

const execFileAsync = promisify(execFile);

describe("run-migrations", () => {
  it("applies a statement-breakpoint migration and records it exactly once", async () => {
    const db = await getDb();
    if (!db || !process.env.DATABASE_URL) throw new Error("قاعدة بيانات الاختبار غير متاحة");
    const token = `${Date.now()}_${Math.floor(Math.random() * 100_000)}`;
    const migrationsDir = await fs.mkdtemp(path.join(os.tmpdir(), "radius-migrations-"));
    const tableName = `migration_runner_probe_${token}`;
    const indexName = `migration_runner_probe_idx_${token}`;
    const fileName = "0114_runner_probe.sql";

    try {
      await fs.writeFile(path.join(migrationsDir, fileName), [
        `CREATE TABLE \`${tableName}\` (\`id\` int NOT NULL, \`value\` varchar(32) NOT NULL, PRIMARY KEY (\`id\`));`,
        "--> statement-breakpoint",
        `CREATE INDEX \`${indexName}\` ON \`${tableName}\` (\`value\`);`,
      ].join("\n"));

      await execFileAsync(process.execPath, ["--import", "tsx", "scripts/run-migrations.ts"], {
        cwd: process.cwd(),
        env: { ...process.env, MIGRATIONS_DIR: migrationsDir },
        timeout: 15_000,
      });

      const [tables] = await db.execute(sql.raw(`SHOW TABLES LIKE '${tableName}'`)) as unknown as [unknown[], unknown];
      const [migrations] = await db.execute(sql`SELECT name FROM __migrations__ WHERE name = ${fileName}`) as unknown as [{ name: string }[], unknown];
      expect(tables).toHaveLength(1);
      expect(migrations).toEqual([{ name: fileName }]);
    } finally {
      await db.execute(sql.raw(`DROP TABLE IF EXISTS \`${tableName}\``));
      await db.execute(sql`DELETE FROM __migrations__ WHERE name = ${fileName}`).catch(() => undefined);
      await fs.rm(migrationsDir, { recursive: true, force: true });
    }
  }, 30_000);
});
