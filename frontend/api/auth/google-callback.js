// Step 2 of Google sign-in. We exchange the one-time `code` for tokens
// server-to-server (authenticated with GOOGLE_CLIENT_SECRET over TLS), so
// the id_token in that response is trustworthy without us re-verifying its
// signature — it never passed through the browser.
import { methodNotAllowed, getRequestOrigin } from "../_lib/http.js";
import { parseCookies, serializeSessionCookie } from "../_lib/security.js";
import { query } from "../_lib/db.js";
import { findUserByEmail, createUser, createSession } from "../_lib/auth-core.js";

function decodeIdTokenPayload(idToken) {
  const payloadSegment = idToken.split(".")[1];
  const json = Buffer.from(payloadSegment, "base64url").toString("utf8");
  return JSON.parse(json);
}

function redirectTo(res, location, setCookie) {
  res.statusCode = 302;
  if (setCookie) res.setHeader("Set-Cookie", setCookie);
  res.setHeader("Location", location);
  res.end();
}

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const origin = getRequestOrigin(req);
  const url = new URL(req.url, origin);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = parseCookies(req.headers.cookie);

  const clearStateCookie = "cz_oauth_state=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax";

  if (!code || !state || !cookies.cz_oauth_state || state !== cookies.cz_oauth_state) {
    return redirectTo(res, `${origin}/auth?error=google_failed`, clearStateCookie);
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return redirectTo(res, `${origin}/auth?error=google_not_configured`, clearStateCookie);
  }

  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google-callback`;

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      console.error("[auth/google-callback] token exchange failed:", await tokenResponse.text());
      return redirectTo(res, `${origin}/auth?error=google_failed`, clearStateCookie);
    }

    const tokenPayload = await tokenResponse.json();
    const claims = decodeIdTokenPayload(tokenPayload.id_token);

    if (!claims.email || claims.email_verified !== true && claims.email_verified !== "true") {
      return redirectTo(res, `${origin}/auth?error=google_email_unverified`, clearStateCookie);
    }

    const email = String(claims.email).toLowerCase();
    const name = claims.name || email.split("@")[0];
    const googleId = claims.sub;

    let user = await findUserByEmail(email);
    if (!user) {
      user = await createUser({ name, email, passwordHash: null, googleId });
    } else if (!user.google_id) {
      // Existing password account signing in with Google for the first
      // time with a matching, Google-verified email — link the accounts.
      await query("UPDATE users SET google_id = ?, email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?", [
        googleId,
        user.id,
      ]);
    }

    const { sessionId, token } = await createSession(user.id, {
      userAgent: req.headers["user-agent"],
      ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ?? null,
    });

    const sessionCookie = serializeSessionCookie(sessionId, token);
    return redirectTo(res, `${origin}/dashboard`, [sessionCookie, clearStateCookie]);
  } catch (error) {
    console.error("[auth/google-callback] unexpected error:", error);
    return redirectTo(res, `${origin}/auth?error=google_failed`, clearStateCookie);
  }
}
