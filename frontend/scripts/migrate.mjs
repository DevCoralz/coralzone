#!/usr/bin/env node
// One-off schema setup: `DATABASE_URL=... node scripts/migrate.mjs`
// (or just run it on Vercel/locally with DATABASE_URL already in env).
// Not part of /api — this must never be reachable as an HTTP endpoint.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mysql from "mysql2/promise";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseDatabaseUrl(raw) {
  if (!raw) throw new Error("DATABASE_URL is not set");
  const withoutJdbcPrefix = raw.startsWith("jdbc:") ? raw.slice("jdbc:".length) : raw;
  const url = new URL(withoutJdbcPrefix);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    multipleStatements: true,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  };
}

const sql = readFileSync(join(__dirname, "..", "api", "_lib", "schema.sql"), "utf8");
const connection = await mysql.createConnection(parseDatabaseUrl(process.env.DATABASE_URL));

try {
  console.log("Applying schema...");
  await connection.query(sql);
  console.log("Done — users, email_verification_codes, sessions, auth_rate_limits are ready.");
} finally {
  await connection.end();
}
