// Small shared helpers for the plain Vercel Node functions in /api.
// No framework — each file in /api is its own serverless function, which
// keeps the auth endpoints isolated from each other (a bug in one request
// handler can't take another one down) and avoids relying on an
// Express app staying alive between cold starts.

export async function readJsonBody(req) {
  if (req.body !== undefined && req.body !== null) {
    // Vercel's Node runtime sometimes pre-parses JSON bodies already.
    if (typeof req.body === "object") return req.body;
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body || "{}");
      } catch {
        return {};
      }
    }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error("Invalid JSON body");
    err.statusCode = 400;
    throw err;
  }
}

export function sendJson(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) res.setHeader(key, value);
  }
  res.end(JSON.stringify(body));
}

// Defense in depth against CSRF: browsers already refuse to let a
// cross-site page fetch() a JSON POST to us with credentials (our server
// sends no Access-Control-Allow-Origin, so the pre-flight fails and the
// real request is never sent) — this is an extra, explicit check so the
// endpoint fails closed even if that CORS behaviour is ever relied upon
// incorrectly or a browser bug relaxes it.
export function isTrustedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin navigations / non-browser clients send no Origin
  try {
    const originHost = new URL(origin).host;
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    return originHost === host;
  } catch {
    return false;
  }
}

export function getRequestOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

export function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress ?? "unknown";
}

export function methodNotAllowed(res, allowed) {
  sendJson(res, 405, { error: "Method not allowed" }, { Allow: allowed.join(", ") });
}

// Never reveal *why* an auth request failed beyond this generic shape —
// "no such user" vs "wrong password" vs "not verified yet" all leak
// information an attacker can use to enumerate accounts, so login/
// register failures collapse to one of a small set of stable messages.
export function authError(res, status, message) {
  sendJson(res, status, { error: message });
}
