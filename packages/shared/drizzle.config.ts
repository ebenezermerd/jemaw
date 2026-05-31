import { defineConfig } from "drizzle-kit";

// Load the repo-root .env (Node >=20.6). Ignore if absent (prod uses real env).
try {
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch {
  // no .env file — rely on the ambient environment
}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required for drizzle-kit");
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
