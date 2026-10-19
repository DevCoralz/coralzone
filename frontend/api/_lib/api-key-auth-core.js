// The real wiring of api-key-auth.js: the database store and the shared rate limiter.
import { getClientIp } from "./http.js";
import { checkRateLimit } from "./rate-limit.js";
import { findKey, touchKey } from "./storage-apikey-core.js";
import { makeApiKeyAuth } from "./api-key-auth.js";

export const authenticateApiKey = makeApiKeyAuth({
  store: { findKey, touchKey },
  rateCheck: checkRateLimit,
  ipOf: getClientIp,
});
