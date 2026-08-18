import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const required = ["DATABASE_URL", "RADIUS_PRO_ADMIN_USERNAME", "RADIUS_PRO_ADMIN_PASSWORD", "RADIUS_PRO_ADMIN_EMAIL"];
for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}

const connection = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const passwordHash = await bcrypt.hash(process.env.RADIUS_PRO_ADMIN_PASSWORD, 12);
  await connection.execute(
    `INSERT INTO users (openId, username, passwordHash, name, email, role, status, emailVerified, onboardingCompleted, createdAt, updatedAt, lastSignedIn)
     VALUES (?, ?, ?, ?, ?, 'owner', 'active', 1, 1, NOW(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE username=VALUES(username), passwordHash=VALUES(passwordHash), name=VALUES(name), email=VALUES(email), role='owner', status='active', emailVerified=1, onboardingCompleted=1, updatedAt=NOW()`,
    ["local_admin_owner", process.env.RADIUS_PRO_ADMIN_USERNAME, passwordHash, "Administrator", process.env.RADIUS_PRO_ADMIN_EMAIL],
  );
  console.log("Initial owner account is ready");
} finally {
  await connection.end();
}
