import { defineConfig } from "drizzle-kit";

function required(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is missing. Add it to .env.`);
  }
  return value;
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: required("TURSO_DB_URL"),
    authToken: required("TURSO_DB_TOKEN"),
  },
});
