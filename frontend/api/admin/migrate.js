// Runs schema.sql against DATABASE_URL over plain HTTP — a stand-in for
// `bun run db:migrate` when you have no terminal (Vercel's free plan gives
// you a dashboard and env vars, not a shell). Visit this URL once after
// deploying with DATABASE_URL and MIGRATION_SECRET set:
//
//   https://your-domain.vercel.app/api/admin/migrate?secret=YOUR_MIGRATION_SECRET
//
// Safe to run more than once — every statement in schema.sql is
// `CREATE TABLE IF NOT EXISTS`. Once it's worked, delete MIGRATION_SECRET
// from Vercel's env vars (or change it) so this endpoint can't be used
// again by anyone who finds the URL.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mysql from "mysql2/promise";
import { sendJson, methodNotAllowed } from "../_lib/http.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseDatabaseUrl(raw) {
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

function secretsMatch(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Still do a constant-time compare against a random buffer of the
    // same length as `a`, so a mismatched length doesn't short-circuit
    // the response any faster than a same-length mismatch would.
    timingSafeEqual(bufA, randomBytes(bufA.length));
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const configuredSecret = process.env.MIGRATION_SECRET;
  if (!configuredSecret) {
    return sendJson(res, 503, {
      error: "Set MIGRATION_SECRET in Vercel env vars, redeploy, then visit this URL with ?secret=...",
    });
  }

  const url = new URL(req.url, "http://localhost");
  const providedSecret = url.searchParams.get("secret") || "";
  if (!secretsMatch(providedSecret, configuredSecret)) {
    return sendJson(res, 403, { error: "Wrong or missing ?secret=" });
  }

  if (!process.env.DATABASE_URL) {
    return sendJson(res, 503, { error: "DATABASE_URL is not set." });
  }

  const sql = readFileSync(join(__dirname, "..", "_lib", "schema.sql"), "utf8");
  let connection;
  try {
    connection = await mysql.createConnection(parseDatabaseUrl(process.env.DATABASE_URL));
    await connection.query(sql);
  } catch (error) {
    console.error("[admin/migrate] failed:", error);
    return sendJson(res, 500, { error: "Migration failed — check Vercel function logs for details." });
  } finally {
    if (connection) await connection.end();
  }

  return sendJson(res, 200, {
    ok: true,
    message:
      "users, email_verification_codes, sessions and auth_rate_limits are ready. Now remove or change MIGRATION_SECRET in Vercel env vars.",
  });
}
