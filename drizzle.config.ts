import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const bunEnv = typeof Bun !== "undefined" ? Bun.env : undefined;
const databaseUrl = process.env.DATABASE_URL ?? bunEnv?.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
});
