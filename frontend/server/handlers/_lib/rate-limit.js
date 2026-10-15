// DB-backed rate limiting. A serverless function has no reliable in-memory
// state between invocations (different instance, cold start, etc.), so an
// in-process Map — fine for the public stats endpoints — isn't enough to
// stop brute-forcing /api/auth/login or /api/auth/verify-email. The
// `auth_rate_limits` table gives every instance a shared, atomic counter.
import { getPool } from "./db.js";

// Returns { allowed: boolean, retryAfterSeconds } and records the attempt
// when allowed. `key` should uniquely identify the thing being limited,
// e.g. `login:ip:1.2.3.4` or `verify:email:a@b.com`.
export async function checkRateLimit(key, { max, windowSeconds }) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      "SELECT attempts, window_started_at FROM auth_rate_limits WHERE bucket_key = ? FOR UPDATE",
      [key],
    );
    const now = new Date();
    const row = rows[0];

    if (!row) {
      await conn.query(
        "INSERT INTO auth_rate_limits (bucket_key, attempts, window_started_at) VALUES (?, 1, ?)",
        [key, now],
      );
      await conn.commit();
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const windowStarted = new Date(row.window_started_at);
    const elapsedSeconds = (now.getTime() - windowStarted.getTime()) / 1000;

    if (elapsedSeconds > windowSeconds) {
      await conn.query(
        "UPDATE auth_rate_limits SET attempts = 1, window_started_at = ? WHERE bucket_key = ?",
        [now, key],
      );
      await conn.commit();
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (row.attempts >= max) {
      await conn.commit();
      return { allowed: false, retryAfterSeconds: Math.ceil(windowSeconds - elapsedSeconds) };
    }

    await conn.query("UPDATE auth_rate_limits SET attempts = attempts + 1 WHERE bucket_key = ?", [
      key,
    ]);
    await conn.commit();
    return { allowed: true, retryAfterSeconds: 0 };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
