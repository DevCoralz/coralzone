// Shared data-access helpers used by the /api/auth/* functions. Every
// query here uses `?` placeholders (see db.js) and every row that belongs
// to one user is always fetched by a server-derived id (the verified
// session's user id, or a freshly-inserted row's own id) — never by an id
// read straight off the request — which is the application-level
// equivalent of row-level security on a database engine (MySQL) that has
// no native RLS of its own.
import { randomUUID } from "node:crypto";
import { query, withTransaction } from "./db.js";
import {
  generateOtp,
  hashOtp,
  verifyOtp,
  generateSessionToken,
  hashSessionToken,
  verifySessionToken,
} from "./security.js";

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL_DAYS = 30;

export async function findUserByEmail(emailNormalized) {
  const rows = await query(
    "SELECT id, name, email, password_hash, google_id, email_verified_at FROM users WHERE email_normalized = ? LIMIT 1",
    [emailNormalized],
  );
  return rows[0] ?? null;
}

export async function findUserById(id) {
  const rows = await query(
    "SELECT id, name, email, password_hash, google_id, email_verified_at FROM users WHERE id = ? LIMIT 1",
    [id],
  );
  return rows[0] ?? null;
}

export async function createUser({ name, email, passwordHash, googleId = null }) {
  const id = randomUUID();
  await query(
    `INSERT INTO users (id, name, email, email_normalized, password_hash, google_id, email_verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, name, email, email.toLowerCase(), passwordHash, googleId, googleId ? new Date() : null],
  );
  return findUserById(id);
}

export async function markEmailVerified(userId) {
  await query("UPDATE users SET email_verified_at = NOW() WHERE id = ?", [userId]);
}

// --- Email verification codes ---------------------------------------------

export async function issueVerificationCode(userId, purpose) {
  const code = generateOtp();
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);
  await withTransaction(async (conn) => {
    // Invalidate any earlier unconsumed codes for this purpose so only the
    // most recently sent code is ever accepted.
    await conn.query(
      "UPDATE email_verification_codes SET consumed_at = NOW() WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL",
      [userId, purpose],
    );
    await conn.query(
      `INSERT INTO email_verification_codes (id, user_id, purpose, code_hash, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, userId, purpose, hashOtp(code), expiresAt],
    );
  });
  return code;
}

// Returns "ok" | "expired" | "invalid" | "too_many_attempts"
export async function consumeVerificationCode(userId, purpose, code) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT id, code_hash, attempts, expires_at FROM email_verification_codes
       WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [userId, purpose],
    );
    const row = rows[0];
    if (!row) return "invalid";
    if (row.attempts >= OTP_MAX_ATTEMPTS) return "too_many_attempts";
    if (new Date(row.expires_at).getTime() < Date.now()) return "expired";

    if (!verifyOtp(code, row.code_hash)) {
      await conn.query("UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = ?", [
        row.id,
      ]);
      return "invalid";
    }

    await conn.query("UPDATE email_verification_codes SET consumed_at = NOW() WHERE id = ?", [
      row.id,
    ]);
    return "ok";
  });
}

// --- Sessions ---------------------------------------------------------------

export async function createSession(userId, { userAgent, ip }) {
  const token = generateSessionToken();
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60_000);
  await query(
    `INSERT INTO sessions (id, user_id, token_hash, user_agent, ip_address, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, hashSessionToken(token), (userAgent || "").slice(0, 255), ip ?? null, expiresAt],
  );
  return { sessionId: id, token };
}

export async function resolveSession(sessionId, token) {
  const rows = await query(
    `SELECT s.id, s.token_hash, s.expires_at, s.revoked_at, u.id AS user_id, u.name, u.email, u.email_verified_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? LIMIT 1`,
    [sessionId],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  if (!verifySessionToken(token, row.token_hash)) return null;
  return {
    sessionId: row.id,
    user: { id: row.user_id, name: row.name, email: row.email, emailVerified: !!row.email_verified_at },
  };
}

export async function revokeSession(sessionId) {
  await query("UPDATE sessions SET revoked_at = NOW() WHERE id = ?", [sessionId]);
}

export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: !!user.email_verified_at,
  };
}
