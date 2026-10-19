import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KEY_PREFIX, KEY_SHOWN_LENGTH, KEY_NAME_MAX, API_KEY_LIMITS, API_RATE_DEFAULTS, RATE_LIMIT_RANGE, KEY_STATUSES, KEY_LIST_LIMIT, V1_FILES_LIMIT,
  apiKeyLimitFor, rateLimitFor, hashApiKey, looksLikeApiKey, newApiKey, validateKeyName, validateCreateKey, validateKeyRef,
  validateAdminKeyAction, parseKeyListQuery, parseV1FilesQuery, toPublicFile, summarizeKeyAction,
} from "./storage-apikey-schema.js";
import { toApiKey } from "./storage-apikey-shape.js";
import { summarizeAction } from "./storage-user-schema.js";

const ID = "3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f";

test("constants match the TypeScript copy (src/lib/storage-apikeys.ts pins the same values)", () => {
  assert.equal(KEY_PREFIX, "cz_live_");
  assert.equal(KEY_SHOWN_LENGTH, 12);
  assert.equal(KEY_NAME_MAX, 60);
  assert.deepEqual(API_KEY_LIMITS, { starter: 1, pro: 5, scale: null });
  assert.deepEqual(API_RATE_DEFAULTS, { starter: 60, pro: 300, scale: 1200 });
  assert.deepEqual(RATE_LIMIT_RANGE, { min: 1, max: 10_000 });
  assert.deepEqual(KEY_STATUSES, ["all", "active", "revoked"]);
  assert.deepEqual(KEY_LIST_LIMIT, { default: 25, max: 100 });
  assert.deepEqual(V1_FILES_LIMIT, { default: 50, max: 100 });
});

test("plan key limits: unknown plans get the strictest", () => {
  assert.equal(apiKeyLimitFor("starter"), 1);
  assert.equal(apiKeyLimitFor("pro"), 5);
  assert.equal(apiKeyLimitFor("scale"), null);
  assert.equal(apiKeyLimitFor("enterprise"), 1);
  assert.equal(apiKeyLimitFor("__proto__"), 1);
});

test("rate limit: a custom value wins, otherwise the plan's default", () => {
  assert.equal(rateLimitFor("pro", null), 300);
  assert.equal(rateLimitFor("pro", 10), 10);
  assert.equal(rateLimitFor("scale", undefined), 1200);
  assert.equal(rateLimitFor("nonsense", null), 60);
  assert.equal(rateLimitFor("pro", 0), 300);
  assert.equal(rateLimitFor("pro", -5), 300);
  assert.equal(rateLimitFor("pro", 1.5), 300);
});

test("a new key looks right, is random, and only its hash is derivable", () => {
  const a = newApiKey();
  const b = newApiKey();
  assert.ok(looksLikeApiKey(a.secret));
  assert.equal(a.secret.length, 56);
  assert.equal(a.prefix, a.secret.slice(0, 12));
  assert.equal(a.hash, hashApiKey(a.secret));
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.notEqual(a.secret, b.secret);
  assert.ok(!a.hash.includes(a.secret.slice(8)));
});

test("only well formed keys are looked up", () => {
  const { secret } = newApiKey();
  assert.equal(looksLikeApiKey(secret), true);
  for (const bad of ["", "cz_live_", secret.toUpperCase(), `${secret}0`, secret.slice(0, -1), `x${secret}`, `${secret}\n`, "cz_live_" + "g".repeat(48), null, undefined, 5, [secret]]) {
    assert.equal(looksLikeApiKey(bad), false, String(bad));
  }
});

test("key names are tidied and checked", () => {
  assert.deepEqual(validateKeyName("  Mobile   app "), { ok: true, name: "Mobile app" });
  for (const bad of ["", "   ", "x".repeat(KEY_NAME_MAX + 1), "../x", "<script>", "-lead", 5, null]) assert.equal(validateKeyName(bad).ok, false, String(bad));
});

test("creating a key: name required, bucket optional and must be an id", () => {
  assert.deepEqual(validateCreateKey({ name: "App" }), { ok: true, name: "App", bucketId: null });
  assert.deepEqual(validateCreateKey({ name: "App", bucketId: null }), { ok: true, name: "App", bucketId: null });
  assert.deepEqual(validateCreateKey({ name: "App", bucketId: ID.toUpperCase() }), { ok: true, name: "App", bucketId: ID });
  assert.equal(validateCreateKey({ name: "App", bucketId: "photos" }).ok, false);
  assert.equal(validateCreateKey({ name: "App", bucketId: 7 }).ok, false);
  assert.equal(validateCreateKey(null).ok, false);
  assert.equal(validateCreateKey([]).ok, false);
});

test("revoking needs a key id", () => {
  assert.deepEqual(validateKeyRef({ id: ID }), { ok: true, id: ID });
  assert.equal(validateKeyRef({ id: "nope" }).ok, false);
  assert.equal(validateKeyRef(null).ok, false);
});

test("admin actions: each shape is checked, anything else is refused", () => {
  assert.deepEqual(validateAdminKeyAction({ action: "revoke", id: ID }), { ok: true, action: "revoke", id: ID });
  assert.deepEqual(validateAdminKeyAction({ action: "rateLimit", id: ID, rateLimitPerMinute: 120 }), { ok: true, action: "rateLimit", id: ID, rateLimitPerMinute: 120 });
  assert.deepEqual(validateAdminKeyAction({ action: "rateLimit", id: ID, rateLimitPerMinute: null }), { ok: true, action: "rateLimit", id: ID, rateLimitPerMinute: null });
  assert.deepEqual(validateAdminKeyAction({ action: "revokeAll", userId: ID }), { ok: true, action: "revokeAll", userId: ID });
  for (const v of [0, -1, 10_001, 1.5, "60", undefined, NaN]) {
    assert.equal(validateAdminKeyAction({ action: "rateLimit", id: ID, rateLimitPerMinute: v }).ok, false, String(v));
  }
  assert.equal(validateAdminKeyAction({ action: "revokeAll", userId: "everyone" }).ok, false);
  assert.equal(validateAdminKeyAction({ action: "delete", id: ID }).ok, false);
  assert.equal(validateAdminKeyAction({ id: ID }).ok, false);
  assert.equal(validateAdminKeyAction("revoke").ok, false);
});

test("admin list query: defaults, clamping and tidy search text", () => {
  assert.deepEqual(parseKeyListQuery(new URLSearchParams()), { q: "", status: "all", limit: 25, offset: 0 });
  assert.equal(parseKeyListQuery(new URLSearchParams({ status: "revoked" })).status, "revoked");
  assert.equal(parseKeyListQuery(new URLSearchParams({ status: "x'; --" })).status, "all");
  assert.equal(parseKeyListQuery(new URLSearchParams({ limit: "9999" })).limit, 100);
  assert.equal(parseKeyListQuery(new URLSearchParams({ q: " a\u0000\n  b " })).q, "a b");
  assert.equal(parseKeyListQuery(new URLSearchParams({ q: "x".repeat(500) })).q.length, 100);
});

test("public files query: limits clamp, a bucket id must be an id", () => {
  assert.deepEqual(parseV1FilesQuery(new URLSearchParams()), { ok: true, limit: 50, offset: 0, bucketId: null });
  assert.equal(parseV1FilesQuery(new URLSearchParams({ limit: "500" })).limit, 100);
  assert.equal(parseV1FilesQuery(new URLSearchParams({ offset: "-4" })).offset, 0);
  assert.equal(parseV1FilesQuery(new URLSearchParams({ bucket_id: ID.toUpperCase() })).bucketId, ID);
  assert.equal(parseV1FilesQuery(new URLSearchParams({ bucket_id: "x' OR '1'='1" })).ok, false);
});

test("a public file shows only safe fields, whatever the service sent", () => {
  const out = toPublicFile({ key: "f1", name: "a.png", size: 10, mimeType: "image/png", kind: "image", ownerId: "secret-owner", bucketId: ID, updatedAt: "2026-01-01T00:00:00", tg_message_id: 5 });
  assert.deepEqual(out, { id: "f1", name: "a.png", size: 10, contentType: "image/png", kind: "image", bucketId: ID, createdAt: "2026-01-01T00:00:00" });
  assert.deepEqual(toPublicFile({}), { id: "", name: "", size: 0, contentType: "", kind: "", bucketId: null, createdAt: null });
  assert.deepEqual(toPublicFile(null), { id: "", name: "", size: 0, contentType: "", kind: "", bucketId: null, createdAt: null });
});

test("a key row is shaped without its hash", () => {
  const key = toApiKey({
    id: "k", name: "App", key_prefix: "cz_live_ab12", key_hash: "must-not-leak", bucket_id: null, bucket_name: null,
    created_at: new Date("2026-01-01T00:00:00Z"), last_used_at: null, request_count: "12", revoked_at: null, rate_limit_per_minute: null,
  });
  assert.equal(key.requests, 12);
  assert.equal(key.revoked, false);
  assert.ok(!JSON.stringify(key).includes("must-not-leak"));
});

test("key actions read as plain sentences in a user's history", () => {
  assert.equal(summarizeKeyAction("cloud.apikey.revoke", "{}"), "Revoked an API key");
  assert.equal(summarizeKeyAction("cloud.apikey.revoke_all", JSON.stringify({ count: 3 })), "Revoked 3 API keys");
  assert.equal(summarizeKeyAction("cloud.apikey.revoke_all", JSON.stringify({ count: 1 })), "Revoked 1 API key");
  assert.equal(summarizeKeyAction("cloud.apikey.revoke_all", "garbage"), "Revoked all API keys");
  assert.equal(summarizeKeyAction("cloud.apikey.ratelimit", JSON.stringify({ to: 90 })), "Set an API key rate limit to 90 a minute");
  assert.equal(summarizeKeyAction("cloud.apikey.ratelimit", JSON.stringify({ to: null })), "Set an API key to follow its plan's rate limit");
  assert.equal(summarizeKeyAction("cloud.bucket.freeze", "{}"), null);
  assert.equal(summarizeAction("cloud.apikey.revoke_all", JSON.stringify({ count: 2 })), "Revoked 2 API keys");
});
