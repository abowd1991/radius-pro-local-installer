import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseMysqlUrl(url: string) {
  const connectionUrl = url.split("?")[0];
  const parsed = new URL(connectionUrl);
  const isLocalMySql = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  return {
    host: parsed.hostname,
    port: Number(parsed.port || "3306"),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    ...(isLocalMySql ? {} : { ssl: { rejectUnauthorized: true } }),
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("[Migrations] DATABASE_URL not set, skipping migrations");
    return;
  }

  const connection = await mysql.createConnection(parseMysqlUrl(databaseUrl));
  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS __migrations__ (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const [rows] = await connection.execute("SELECT name FROM __migrations__ ORDER BY name ASC") as [{ name: string }[], unknown];
    const applied = new Set(rows.map((row) => row.name));
    const migrationsDir = process.env.MIGRATIONS_DIR
      ? path.resolve(process.env.MIGRATIONS_DIR)
      : path.join(__dirname, "..", "drizzle");
    const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const statements = fs.readFileSync(path.join(migrationsDir, file), "utf8")
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter(Boolean);
      console.log(`[Migrations] Applying: ${file}`);
      for (const statement of statements) {
        try {
          await connection.execute(statement);
        } catch (error: any) {
          if (!["ER_DUP_KEYNAME", "ER_DUP_FIELDNAME", "ER_TABLE_EXISTS_ERROR"].includes(error?.code)) throw error;
          console.log(`[Migrations]   Existing schema accepted: ${error.code}`);
        }
      }
      await connection.execute("INSERT IGNORE INTO __migrations__ (name) VALUES (?)", [file]);
      console.log(`[Migrations] Applied: ${file}`);
    }
  } finally {
    await connection.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[Migrations] Failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
