// Checks the API key on a public API request (/api/v1/*). It is built from
// the key store and the rate limiter it is given, so the whole decision can be
// tested without a database.
//
// Order of checks: the key has the right shape, a key with this hash exists,
// it is not revoked, its owner is not banned, then the per key rate limit.
// Only a request that passes all of them is counted against the key.
import { looksLikeApiKey, rateLimitFor } from "./storage-apikey-schema.js";

const BAD_KEY_MESSAGE = "Missing or invalid API key. Send it in the X-API-Key header.";
const FAILED_PER_MINUTE = 30;

export function makeApiKeyAuth({ store, rateCheck, ipOf }) {
  // Returns { ok: true, principal, headers } or { ok: false, status, error, headers? }.
  return async function authenticate(req) {
    const header = req.headers["x-api-key"];
    const secret = Array.isArray(header) ? header[0] : header;

    const reject = async () => {
      // Wrong keys from one address are slowed down. A real key has 192 random
      // bits, so this protects the database more than it protects the keys.
      const bad = await rateCheck(`api-key-bad:${ipOf(req)}`, { max: FAILED_PER_MINUTE, windowSeconds: 60 });
      if (!bad.allowed) {
        return { ok: false, status: 429, error: "Too many failed attempts. Wait a moment.", headers: { "Retry-After": String(bad.retryAfterSeconds) } };
      }
      return { ok: false, status: 401, error: BAD_KEY_MESSAGE };
    };

    if (!looksLikeApiKey(secret)) return reject();
    const principal = await store.findKey(secret);
    if (!principal) return reject();

    // From here the caller holds a real key, so saying why it is refused is safe.
    if (principal.revoked) return { ok: false, status: 401, error: "This API key has been revoked." };
    if (principal.banned) return { ok: false, status: 403, error: "Cloud storage access for this account has been suspended." };

    const limit = rateLimitFor(principal.plan, principal.rateLimitPerMinute);
    const headers = { "X-RateLimit-Limit": String(limit) };
    const rate = await rateCheck(`api-key:${principal.keyId}`, { max: limit, windowSeconds: 60 });
    if (!rate.allowed) {
      return { ok: false, status: 429, error: `Rate limit reached (${limit} requests a minute for this key). Wait a moment.`, headers: { ...headers, "Retry-After": String(rate.retryAfterSeconds) } };
    }

    await store.touchKey(principal.keyId);
    return { ok: true, principal, headers };
  };
}
