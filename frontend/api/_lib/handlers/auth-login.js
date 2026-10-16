import { loginSchema, formatZodError } from "../validate.js";
import { readJsonBody, sendJson, methodNotAllowed, isTrustedOrigin, getClientIp } from "../http.js";
import { checkRateLimit } from "../rate-limit.js";
import { verifyPassword, serializeSessionCookie } from "../security.js";
import { findUserByEmail, issueVerificationCode, createSession, publicUser } from "../auth-core.js";
import { sendVerificationEmail } from "../mailer.js";

const GENERIC_CREDENTIALS_ERROR = "Incorrect email or password.";

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

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return sendJson(res, 400, { error: formatZodError(parsed.error) });
  }
  const { email, password } = parsed.data;

  // Limit by IP *and* by email so one attacker can't hammer a single
  // account from many IPs, and one IP can't spray many accounts.
  const [ipLimit, emailLimit] = await Promise.all([
    checkRateLimit(`login:ip:${ip}`, { max: 20, windowSeconds: 900 }),
    checkRateLimit(`login:email:${email}`, { max: 8, windowSeconds: 900 }),
  ]);
  if (!ipLimit.allowed || !emailLimit.allowed) {
    const retryAfterSeconds = Math.max(ipLimit.retryAfterSeconds, emailLimit.retryAfterSeconds);
    return sendJson(res, 429, { error: "Too many attempts. Try again later." }, {
      "Retry-After": String(retryAfterSeconds),
    });
  }

  const user = await findUserByEmail(email);
  const passwordOk = user ? await verifyPassword(password, user.password_hash) : false;

  // Always run bcrypt.compare-shaped work even for a missing user so this
  // endpoint's timing doesn't reveal whether the account exists.
  if (!user || !passwordOk) {
    return sendJson(res, 401, { error: GENERIC_CREDENTIALS_ERROR });
  }

  if (!user.password_hash) {
    // Account exists but was created via Google — no password to check.
    return sendJson(res, 401, {
      error: "This account signs in with Google. Use “Continue with Google” instead.",
    });
  }

  if (!user.email_verified_at) {
    const code = await issueVerificationCode(user.id, "signup");
    try {
      await sendVerificationEmail({ to: user.email, name: user.name, code });
    } catch (error) {
      console.error("[auth/login] failed to send verification email:", error);
      return sendJson(res, 502, { error: "Could not send the verification email. Try again shortly." });
    }
    return sendJson(res, 200, { ok: true, needsVerification: true, email: user.email });
  }

  const { sessionId, token } = await createSession(user.id, {
    userAgent: req.headers["user-agent"],
    ip,
  });

  return sendJson(
    res,
    200,
    { ok: true, user: publicUser(user) },
    { "Set-Cookie": serializeSessionCookie(sessionId, token) },
  );
}
