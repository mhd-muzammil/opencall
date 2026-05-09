import bcrypt from "bcryptjs";
import { closeDatabasePool, query } from "../config/database.js";

const username = process.env.OPENCALL_ADMIN_USERNAME?.trim();
const password = process.env.OPENCALL_ADMIN_PASSWORD;
const email =
  process.env.OPENCALL_ADMIN_EMAIL?.trim() ??
  (username ? `${username}@opencall.local` : undefined);

if (!username || !password || !email) {
  console.error(
    "OPENCALL_ADMIN_USERNAME, OPENCALL_ADMIN_PASSWORD, and OPENCALL_ADMIN_EMAIL are required",
  );
  process.exit(1);
}

if (password.length < 6) {
  console.error("OPENCALL_ADMIN_PASSWORD must be at least 6 characters");
  process.exit(1);
}

try {
  const passwordHash = await bcrypt.hash(password, 12);

  await query(
    `
      WITH updated AS (
        UPDATE users
        SET
          username = $1,
          email = $2,
          password_hash = $3,
          role = 'SUPER_ADMIN',
          region_id = NULL,
          is_active = TRUE
        WHERE lower(email) = lower($2)
           OR lower(username) = lower($1)
        RETURNING id
      )
      INSERT INTO users (username, email, password_hash, role, region_id, is_active)
      SELECT $1, $2, $3, 'SUPER_ADMIN', NULL, TRUE
      WHERE NOT EXISTS (SELECT 1 FROM updated)
    `,
    [username, email, passwordHash],
  );

  console.log(`Admin user '${username}' is ready`);
} finally {
  await closeDatabasePool();
}
