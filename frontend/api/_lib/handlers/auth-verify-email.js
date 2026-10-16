import { verifyEmailSchema, formatZodError } from "../validate.js";
import { readJsonBody, sendJson, methodNotAllowed, isTrustedOrigin, getClientIp } from "../http.js";
import { checkRateLimit } from "../rate-limit.js";
import {
  findUserByEmail,
  consumeVerificationCode,
  markEmailVerified,
  createSession,
  publicUser,
} from "../auth-core.js";
import { serializeSessionCookie } from "../security.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!isTrustedOrigin(req)) return sendJson(res, 403, { error: "Request rejected" });

  const ip = getClientIp(req);
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid request body" });
  }

  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    return sendJson(res, 400, { error: formatZodError(parsed.error) });
  }
  const { email, code } = parsed.data;

  const limit = await checkRateLimit(`verify:${email}:${ip}`, { max: 8, windowSeconds: 600 });
  if (!limit.allowed) {
    return sendJson(res, 429, { error: "Too many attempts. Request a new code." }, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return sendJson(res, 400, { error: "That code is invalid or has expired." });
  }

  // "signup" is the only purpose this flow issues today — see
  // auth-core.js's `purpose` column for the future home of a login-time
  // 2FA code, which isn't part of this feature.
  const outcome = await consumeVerificationCode(user.id, "signup", code);

  if (outcome === "too_many_attempts") {
    return sendJson(res, 400, { error: "Too many incorrect attempts. Request a new code." });
  }
  if (outcome === "expired") {
    return sendJson(res, 400, { error: "That code has expired. Request a new one." });
  }
  if (outcome === "invalid") {
    return sendJson(res, 400, { error: "That code is invalid or has expired." });
  }

  if (!user.email_verified_at) {
    await markEmailVerified(user.id);
  }

  const { sessionId, token } = await createSession(user.id, {
    userAgent: req.headers["user-agent"],
    ip,
  });

  return sendJson(
    res,
    200,
    { ok: true, user: publicUser({ ...user, email_verified_at: new Date() }) },
    { "Set-Cookie": serializeSessionCookie(sessionId, token) },
  );
}
