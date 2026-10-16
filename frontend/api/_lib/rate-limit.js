// DB-backed rate limiting. A serverless function has no reliable in-memory
// state between invocations (different instance, cold start, etc.), so an
// in-process Map — fine for the public stats endpoints — isn't enough to
// stop brute-forcing /api/auth/login or /api/auth/verify-email. The
// `auth_rate_limits` table gives every instance a shared, atomic counter.
//
// This used to open an explicit transaction (SELECT ... FOR UPDATE, then
// an INSERT/UPDATE, then COMMIT) per call. login.js checks an IP bucket
// and an email bucket at once, and under concurrent requests two of those
// transactions can lock the two rows in opposite order and deadlock —
// exactly the "Deadlock found when trying to get lock" MySQL throws
// when that happens. A single atomic UPSERT removes the window where a
// lock is held across multiple round-trips, and the retry loop below
// covers the rare deadlock MySQL can still report under heavy concurrency
// (its own error message says to just retry the transaction).
import { getPool } from "./db.js";

const MAX_ATTEMPTS_ON_DEADLOCK = 3;

function isDeadlock(error) {
  return error && (error.code === "ER_LOCK_DEADLOCK" || error.errno === 1213);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Returns { allowed: boolean, retryAfterSeconds }. `key` should uniquely
// identify the thing being limited, e.g. `login:ip:1.2.3.4` or
// `verify:email:a@b.com`.
export async function checkRateLimit(key, { max, windowSeconds }) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS_ON_DEADLOCK; attempt++) {
    try {
      return await attemptCheck(key, max, windowSeconds);
    } catch (error) {
      if (!isDeadlock(error) || attempt === MAX_ATTEMPTS_ON_DEADLOCK) throw error;
      await sleep(20 * attempt + Math.floor(Math.random() * 20));
    }
  }
}

async function attemptCheck(key, max, windowSeconds) {
  const pool = getPool();
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowSeconds * 1000);

  // One atomic statement: insert a fresh bucket, or — if the existing
  // bucket's window has expired — reset it to 1, or — still inside the
  // window — bump its count. No explicit transaction, so no lock is held
  // across separate round-trips.
  await pool.query(
    `INSERT INTO auth_rate_limits (bucket_key, attempts, window_started_at)
     VALUES (?, 1, ?)
     ON DUPLICATE KEY UPDATE
       attempts = IF(window_started_at < ?, 1, attempts + 1),
       window_started_at = IF(window_started_at < ?, VALUES(window_started_at), window_started_at)`,
    [key, now, cutoff, cutoff],
  );

  const [rows] = await pool.query(
    "SELECT attempts, window_started_at FROM auth_rate_limits WHERE bucket_key = ?",
    [key],
  );
  const row = rows[0];
  const windowStarted = new Date(row.window_started_at);
  const elapsedSeconds = (now.getTime() - windowStarted.getTime()) / 1000;

  if (row.attempts > max) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(windowSeconds - elapsedSeconds)) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}
