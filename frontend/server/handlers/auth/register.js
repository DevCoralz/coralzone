import { registerSchema, formatZodError } from "../_lib/validate.js";
import { readJsonBody, sendJson, methodNotAllowed, isTrustedOrigin, getClientIp } from "../_lib/http.js";
import { checkRateLimit } from "../_lib/rate-limit.js";
import { hashPassword } from "../_lib/security.js";
import { findUserByEmail, createUser, issueVerificationCode } from "../_lib/auth-core.js";
import { sendVerificationEmail } from "../_lib/mailer.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!isTrustedOrigin(req)) return sendJson(res, 403, { error: "Request rejected" });

  const ip = getClientIp(req);
  const ipLimit = await checkRateLimit(`register:ip:${ip}`, { max: 10, windowSeconds: 3600 });
  if (!ipLimit.allowed) {
    return sendJson(res, 429, { error: "Too many attempts. Try again later." }, {
      "Retry-After": String(ipLimit.retryAfterSeconds),
    });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid request body" });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return sendJson(res, 400, { error: formatZodError(parsed.error) });
  }
  const { name, email, password } = parsed.data;

  const existing = await findUserByEmail(email);
  if (existing) {
    // Same response whether or not the account exists, so this endpoint
    // can't be used to enumerate registered emails.
    return sendJson(res, 200, {
      ok: true,
      email,
      message: "If that email can be registered, a verification code has been sent.",
    });
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser({ name, email, passwordHash });

  const code = await issueVerificationCode(user.id, "signup");
  try {
    await sendVerificationEmail({ to: email, name, code });
  } catch (error) {
    console.error("[auth/register] failed to send verification email:", error);
    return sendJson(res, 502, { error: "Could not send the verification email. Try again shortly." });
  }

  return sendJson(res, 200, {
    ok: true,
    email,
    message: "If that email can be registered, a verification code has been sent.",
  });
}
