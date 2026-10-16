// Step 1 of Google sign-in: redirect the browser to Google's consent
// screen. Configure GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in env to
// enable this; until then it redirects back with an explanatory error so
// the button fails safely instead of 500ing.
import { randomBytes } from "node:crypto";
import { methodNotAllowed, getRequestOrigin } from "../http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const origin = getRequestOrigin(req);
  if (!process.env.GOOGLE_CLIENT_ID) {
    res.statusCode = 302;
    res.setHeader("Location", `${origin}/auth?error=google_not_configured`);
    return res.end();
  }

  const state = randomBytes(24).toString("hex");
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google-callback`;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });

  const stateCookie = [
    `cz_oauth_state=${state}`,
    "Path=/",
    "HttpOnly",
    "Max-Age=600",
    "SameSite=Lax",
  ];
  if (process.env.NODE_ENV !== "development") stateCookie.push("Secure");

  res.statusCode = 302;
  res.setHeader("Set-Cookie", stateCookie.join("; "));
  res.setHeader("Location", `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  res.end();
}
