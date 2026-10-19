import { test } from "node:test";
import assert from "node:assert/strict";
import { makeApiKeyAuth } from "./api-key-auth.js";
import { newApiKey } from "./storage-apikey-schema.js";

const { secret } = newApiKey();
const principal = (over = {}) => ({ keyId: "k1", userId: "u1", bucketId: null, plan: "starter", rateLimitPerMinute: null, revoked: false, banned: false, ...over });

function setup({ found = principal(), allowed = true, badAllowed = true } = {}) {
  const log = { finds: [], touches: [], limits: [] };
  const auth = makeApiKeyAuth({
    store: {
      findKey: async (s) => { log.finds.push(s); return found; },
      touchKey: async (id) => { log.touches.push(id); },
    },
    rateCheck: async (key, opts) => {
      log.limits.push([key, opts]);
      const ok = key.startsWith("api-key-bad:") ? badAllowed : allowed;
      return { allowed: ok, retryAfterSeconds: 7 };
    },
    ipOf: () => "1.2.3.4",
  });
  return { log, call: (headers) => auth({ headers }) };
}

test("a good key passes, is counted once, and reports its limit", async () => {
  const { call, log } = setup();
  const out = await call({ "x-api-key": secret });
  assert.equal(out.ok, true);
  assert.equal(out.principal.userId, "u1");
  assert.equal(out.headers["X-RateLimit-Limit"], "60");
  assert.deepEqual(log.touches, ["k1"]);
  assert.deepEqual(log.limits, [["api-key:k1", { max: 60, windowSeconds: 60 }]]);
});

test("the limit follows the plan, and a custom limit beats the plan", async () => {
  assert.equal((await setup({ found: principal({ plan: "pro" }) }).call({ "x-api-key": secret })).headers["X-RateLimit-Limit"], "300");
  const custom = setup({ found: principal({ plan: "pro", rateLimitPerMinute: 5 }) });
  assert.equal((await custom.call({ "x-api-key": secret })).headers["X-RateLimit-Limit"], "5");
  assert.equal(custom.log.limits[0][1].max, 5);
});

test("missing, malformed or unknown keys all get the same 401 and never reach the database when malformed", async () => {
  for (const headers of [{}, { "x-api-key": "" }, { "x-api-key": "cz_live_short" }, { "x-api-key": `${secret}x` }, { "x-api-key": secret.toUpperCase() }]) {
    const { call, log } = setup();
    const out = await call(headers);
    assert.deepEqual([out.ok, out.status], [false, 401]);
    assert.equal(log.finds.length, 0);
    assert.deepEqual(log.touches, []);
  }
  const unknown = setup({ found: null });
  const out = await unknown.call({ "x-api-key": secret });
  assert.deepEqual([out.ok, out.status], [false, 401]);
  assert.equal(unknown.log.touches.length, 0);
});

test("a header sent twice uses the first value", async () => {
  const { call, log } = setup();
  await call({ "x-api-key": [secret, "other"] });
  assert.equal(log.finds[0], secret);
});

test("a revoked key is refused with a clear reason and is not counted", async () => {
  const { call, log } = setup({ found: principal({ revoked: true }) });
  const out = await call({ "x-api-key": secret });
  assert.deepEqual([out.status, out.error], [401, "This API key has been revoked."]);
  assert.deepEqual(log.touches, []);
  assert.equal(log.limits.length, 0);
});

test("a banned owner's key stops working, even a valid one", async () => {
  const { call, log } = setup({ found: principal({ banned: true }) });
  const out = await call({ "x-api-key": secret });
  assert.equal(out.status, 403);
  assert.deepEqual(log.touches, []);
});

test("over the key's limit: 429 with Retry-After, and the request is not counted", async () => {
  const { call, log } = setup({ allowed: false });
  const out = await call({ "x-api-key": secret });
  assert.equal(out.status, 429);
  assert.equal(out.headers["Retry-After"], "7");
  assert.equal(out.headers["X-RateLimit-Limit"], "60");
  assert.deepEqual(log.touches, []);
});

test("repeated wrong keys from one address are slowed down with 429", async () => {
  const { call, log } = setup({ found: null, badAllowed: false });
  const out = await call({ "x-api-key": secret });
  assert.equal(out.status, 429);
  assert.equal(out.headers["Retry-After"], "7");
  assert.equal(log.limits[0][0], "api-key-bad:1.2.3.4");
});
