import postgres from "postgres";
import { readFile } from "node:fs/promises";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });
try {
  await sql.unsafe(await readFile(new URL("../db/migrations/0001_license_system.sql", import.meta.url), "utf8"));
  process.stdout.write("Migration 0001 applied\n");
} finally { await sql.end(); }
