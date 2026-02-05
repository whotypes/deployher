import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!Bun.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: Bun.env.DATABASE_URL,
  },
});
