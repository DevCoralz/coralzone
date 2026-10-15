// Password hashing, OTP codes, and session tokens.
//
// Passwords: bcryptjs (pure JS — no native build step, which matters on
// Vercel's serverless Node runtime) at cost factor 12.
//
// Sessions: opaque random tokens, not JWTs. We store only a SHA-256 hash
// of the token in the `sessions` table (so a stolen DB export doesn't hand
// out live sessions), and the session id is looked up in O(1) before the
// hash is compared with a timing-safe check. Because the row lives in the
// database, a session can be revoked (logout, "log out everywhere",
// password change) by deleting/marking the row — a signed JWT can't be
// revoked without extra infrastructure.
import bcrypt from "bcryptjs";
import { randomBytes, randomInt, createHmac, timingSafeEqual } from "node:crypto";

const BCRYPT_COST = 12;

function pepper() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set — required to hash OTP codes and session tokens.");
  }
  return secret;
}

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password, hash) {
  if (!hash) return Promise.resolve(false);
  return bcrypt.compare(password, hash);
}

// HMAC with a server-side secret, not plain SHA-256: a 6-digit OTP only
// has 1,000,000 possible values, so an unsalted/unkeyed hash of it would
// be trivially reversible by brute force from a leaked database alone.
// Keying the hash with SESSION_SECRET means that brute force also
// requires the secret, which only lives in server env vars.
function hmacHex(value) {
  return createHmac("sha256", pepper()).update(value).digest("hex");
}

function timingSafeEqualHex(a, b) {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// --- Email verification codes -------------------------------------------

export function generateOtp() {
  // 6-digit numeric code, zero-padded. randomInt is CSPRNG-backed.
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOtp(code) {
  return hmacHex(code);
}

export function verifyOtp(code, hash) {
  if (!/^\d{6}$/.test(code)) return false;
  return timingSafeEqualHex(hashOtp(code), hash);
}

// --- Session tokens -------------------------------------------------------

export function generateSessionToken() {
  return randomBytes(32).toString("hex");
}

export function hashSessionToken(token) {
  return hmacHex(token);
}

export function verifySessionToken(token, hash) {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return false;
  return timingSafeEqualHex(hashSessionToken(token), hash);
}

// --- Cookies ----------------------------------------------------------------

export const SESSION_COOKIE = "cz_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function serializeSessionCookie(sessionId, token) {
  const value = `${sessionId}.${token}`;
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
  ];
  if (process.env.NODE_ENV !== "development") parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie() {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "Max-Age=0", "SameSite=Lax"];
  if (process.env.NODE_ENV !== "development") parts.push("Secure");
  return parts.join("; ");
}

export function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const pair of cookieHeader.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export function readSessionCookie(req) {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;
  const dotIndex = raw.indexOf(".");
  if (dotIndex === -1) return null;
  const sessionId = raw.slice(0, dotIndex);
  const token = raw.slice(dotIndex + 1);
  if (!/^[0-9a-f-]{36}$/.test(sessionId)) return null;
  return { sessionId, token };
}
