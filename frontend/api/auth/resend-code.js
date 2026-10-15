import { resendCodeSchema, formatZodError } from "../_lib/validate.js";
import { readJsonBody, sendJson, methodNotAllowed, isTrustedOrigin, getClientIp } from "../_lib/http.js";
import { checkRateLimit } from "../_lib/rate-limit.js";
import { findUserByEmail, issueVerificationCode } from "../_lib/auth-core.js";
import { sendVerificationEmail } from "../_lib/mailer.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!isTrustedOrigin(req)) return sendJson(res, 403, { error: "Request rejected" });

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid request body" });
  }

  const parsed = resendCodeSchema.safeParse(body);
  if (!parsed.success) {
    return sendJson(res, 400, { error: formatZodError(parsed.error) });
  }
  const { email } = parsed.data;
  const ip = getClientIp(req);

  const limit = await checkRateLimit(`resend:${email}`, { max: 4, windowSeconds: 900 });
  const genericOk = () =>
    sendJson(res, 200, { ok: true, message: "If that account needs a code, one was just sent." });

  if (!limit.allowed) {
    return sendJson(res, 429, { error: "Too many requests. Try again in a few minutes." }, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const user = await findUserByEmail(email);
  if (!user || user.email_verified_at) return genericOk();

  const code = await issueVerificationCode(user.id, "signup");

  try {
    await sendVerificationEmail({ to: user.email, name: user.name, code });
  } catch (error) {
    console.error("[auth/resend-code] failed to send email:", error, { ip });
    return sendJson(res, 502, { error: "Could not send the code. Try again shortly." });
  }

  return genericOk();
}
