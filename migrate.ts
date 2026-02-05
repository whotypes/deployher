import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://app:app@localhost:5432/placeholder";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "drizzle",
);

const maxAttempts = 5;
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);
  try {
    await migrate(db, { migrationsFolder });
    await pool.end();
    break;
  } catch (error) {
    await pool.end().catch(() => {});
    if (attempt === maxAttempts) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }
}
