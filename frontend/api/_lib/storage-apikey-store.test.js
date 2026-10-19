// Checks the key RULES (plan limit, ban, bucket scope, secret handling, audit)
// against canned answers for the few statements each path runs. The SQL text
// is checked by shape: what is parameterised, and that a hash is never read out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeApiKeyStore, buildKeyFilter } from "./storage-apikey-store.js";
import { hashApiKey, looksLikeApiKey } from "./storage-apikey-schema.js";

const U1 = "11111111-1111-4111-8111-111111111111";
const B1 = "22222222-2222-4222-8222-222222222222";
const K1 = "33333333-3333-4333-8333-333333333333";
const ADMIN = "99999999-9999-4999-8999-999999999999";
const flat = (sql) => sql.replace(/\s+/g, " ").trim();

// answers: [textThatMustAppearInTheSql, rows]. First match wins.
function fake(answers) {
  const calls = [];
  const run = async (sql, params = []) => {
    const text = flat(sql);
    calls.push({ sql: text, params });
    const hit = answers.find(([needle]) => text.includes(needle));
    if (!hit) throw new Error(`unexpected SQL: ${text.slice(0, 90)}`);
    return typeof hit[1] === "function" ? hit[1](params) : hit[1];
  };
  const db = {
    query: run,
    withTransaction: async (fn) => fn({ query: async (sql, params) => [await run(sql, params)] }),
  };
  return { db, calls, ran: (needle) => calls.filter((c) => c.sql.includes(needle)) };
}

const keyRow = (over = {}) => ({
  id: K1, user_id: U1, bucket_id: null, name: "Website", key_prefix: "cz_live_ab12", last_used_at: null, request_count: 0,
  revoked_at: null, created_at: new Date("2026-02-01T00:00:00Z"), rate_limit_per_minute: null, bucket_name: null, ...over,
});

function createAnswers({ plan = "starter", active = 0, banned = false, user = true, bucket = true } = {}) {
  return [
    ["SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE", user ? [{ id: U1 }] : []],
    ["FROM storage_user_bans", banned ? [{ user_id: U1 }] : []],
    ["SELECT plan FROM storage_quotas", plan ? [{ plan }] : []],
    ["SELECT COUNT(*) AS n FROM storage_api_keys", [{ n: active }]],
    ["SELECT id FROM storage_buckets WHERE id = ? AND user_id = ?", bucket ? [{ id: B1 }] : []],
    ["INSERT INTO storage_api_keys", []],
    ["WHERE k.id = ? LIMIT 1", [keyRow()]],
  ];
}

const refuses = (promise, text) => assert.rejects(promise, (e) => e.userFacing === true && e.message.includes(text), `expected a refusal containing "${text}"`);

test("creating a key returns the secret once and stores only its hash and prefix", async () => {
  const { db, ran, calls } = fake(createAnswers());
  const out = await makeApiKeyStore(db).createUserKey(U1, { name: "Website", bucketId: null });
  assert.ok(looksLikeApiKey(out.secret));
  const [insert] = ran("INSERT INTO storage_api_keys");
  const [, , , , prefix, hash] = insert.params;
  assert.equal(prefix, out.secret.slice(0, 12));
  assert.equal(hash, hashApiKey(out.secret));
  // The secret itself is in no query, and not in the key that is returned.
  assert.ok(!calls.some((c) => c.params.includes(out.secret)));
  assert.ok(!JSON.stringify(out.key).includes(out.secret));
  assert.equal(out.key.prefix, "cz_live_ab12");
});

test("plan limits count only ACTIVE keys: Starter 1, Pro 5, Scale unlimited", async () => {
  await refuses(makeApiKeyStore(fake(createAnswers({ plan: "starter", active: 1 })).db).createUserKey(U1, { name: "x", bucketId: null }), "Starter plan includes 1 API key");
  await refuses(makeApiKeyStore(fake(createAnswers({ plan: null, active: 1 })).db).createUserKey(U1, { name: "x", bucketId: null }), "Starter plan");
  assert.ok(await makeApiKeyStore(fake(createAnswers({ plan: "starter", active: 0 })).db).createUserKey(U1, { name: "x", bucketId: null }));
  assert.ok(await makeApiKeyStore(fake(createAnswers({ plan: "pro", active: 4 })).db).createUserKey(U1, { name: "x", bucketId: null }));
  await refuses(makeApiKeyStore(fake(createAnswers({ plan: "pro", active: 5 })).db).createUserKey(U1, { name: "x", bucketId: null }), "Pro plan includes 5 API keys");
  assert.ok(await makeApiKeyStore(fake(createAnswers({ plan: "scale", active: 5000 })).db).createUserKey(U1, { name: "x", bucketId: null }));
});

test("the limit is checked inside the transaction after locking the user, so parallel creates cannot overshoot", async () => {
  const { db, calls } = fake(createAnswers());
  await makeApiKeyStore(db).createUserKey(U1, { name: "x", bucketId: null });
  const lock = calls.findIndex((c) => c.sql.includes("FOR UPDATE"));
  const count = calls.findIndex((c) => c.sql.includes("COUNT(*)"));
  const insert = calls.findIndex((c) => c.sql.includes("INSERT INTO storage_api_keys"));
  assert.ok(lock === 0 && lock < count && count < insert);
});

test("banned users cannot create keys; a missing user is null; nothing is written either way", async () => {
  const banned = fake(createAnswers({ banned: true }));
  await refuses(makeApiKeyStore(banned.db).createUserKey(U1, { name: "x", bucketId: null }), "suspended");
  assert.equal(banned.ran("INSERT").length, 0);
  const missing = fake(createAnswers({ user: false }));
  assert.equal(await makeApiKeyStore(missing.db).createUserKey(U1, { name: "x", bucketId: null }), null);
  assert.equal(missing.ran("INSERT").length, 0);
});

test("a bucket limited key must be limited to one the owner has", async () => {
  const bad = fake(createAnswers({ bucket: false }));
  await refuses(makeApiKeyStore(bad.db).createUserKey(U1, { name: "x", bucketId: B1 }), "no longer exists");
  assert.equal(bad.ran("INSERT").length, 0);
  const good = fake(createAnswers());
  await makeApiKeyStore(good.db).createUserKey(U1, { name: "x", bucketId: B1 });
  assert.deepEqual(good.ran("SELECT id FROM storage_buckets")[0].params, [B1, U1]);
  assert.equal(good.ran("INSERT")[0].params[2], B1);
});

test("listing own keys filters by the owner and never selects a hash", async () => {
  const { db, calls } = fake([["WHERE k.user_id = ?", [keyRow({ request_count: "7" }), keyRow({ id: "k2", revoked_at: new Date() })]]]);
  const keys = await makeApiKeyStore(db).listUserKeys(U1);
  assert.deepEqual(calls[0].params, [U1]);
  assert.deepEqual(keys.map((k) => [k.requests, k.revoked]), [[7, false], [0, true]]);
  assert.ok(!calls.some((c) => c.sql.includes("key_hash")));
});

test("revoking your own key: not yours is null, already revoked changes nothing, otherwise it is revoked", async () => {
  const none = fake([["SELECT id, revoked_at FROM storage_api_keys", []]]);
  assert.equal(await makeApiKeyStore(none.db).revokeUserKey(U1, K1), null);
  const done = fake([["SELECT id, revoked_at FROM storage_api_keys", [{ id: K1, revoked_at: new Date() }]]]);
  assert.deepEqual(await makeApiKeyStore(done.db).revokeUserKey(U1, K1), { changed: false });
  assert.equal(done.ran("UPDATE storage_api_keys SET").length, 0);
  const live = fake([["SELECT id, revoked_at FROM storage_api_keys", [{ id: K1, revoked_at: null }]], ["UPDATE storage_api_keys SET revoked_at = NOW()", []]]);
  assert.deepEqual(await makeApiKeyStore(live.db).revokeUserKey(U1, K1), { changed: true });
  assert.deepEqual(live.ran("SELECT id, revoked_at")[0].params, [K1, U1]);
  assert.deepEqual(live.ran("UPDATE storage_api_keys SET")[0].params, [K1, U1]);
});

test("checking a key hashes it first, and reports plan, scope, limit and flags", async () => {
  const secret = `cz_live_${"a".repeat(48)}`;
  const { db, calls } = fake([["WHERE k.key_hash = ?", [{ id: K1, user_id: U1, bucket_id: B1, revoked_at: null, rate_limit_per_minute: 90, plan: "pro", banned_at: new Date() }]]]);
  const found = await makeApiKeyStore(db).findKey(secret);
  assert.deepEqual(calls[0].params, [hashApiKey(secret)]);
  assert.ok(!calls[0].params.includes(secret));
  assert.deepEqual(found, { keyId: K1, userId: U1, bucketId: B1, plan: "pro", rateLimitPerMinute: 90, revoked: false, banned: true });
  const none = fake([["WHERE k.key_hash = ?", []]]);
  assert.equal(await makeApiKeyStore(none.db).findKey(secret), null);
  const bare = fake([["WHERE k.key_hash = ?", [{ id: K1, user_id: U1, bucket_id: null, revoked_at: new Date(), rate_limit_per_minute: null, plan: null, banned_at: null }]]]);
  const defaults = await makeApiKeyStore(bare.db).findKey(secret);
  assert.deepEqual([defaults.plan, defaults.revoked, defaults.rateLimitPerMinute, defaults.bucketId], ["starter", true, null, null]);
});

test("touching a key records its use", async () => {
  const { db, calls } = fake([["UPDATE storage_api_keys SET last_used_at", []]]);
  await makeApiKeyStore(db).touchKey(K1);
  assert.match(calls[0].sql, /request_count = request_count \+ 1/);
  assert.deepEqual(calls[0].params, [K1]);
});

test("admin search: wildcards escaped, text only as parameters, status narrows", () => {
  const { clause, params } = buildKeyFilter({ q: "50%_off", status: "all" });
  assert.match(clause, /LOWER\(k\.name\) LIKE \?/);
  assert.match(clause, /LOWER\(k\.key_prefix\) LIKE \?/);
  assert.match(clause, /u\.email_normalized LIKE \?/);
  assert.deepEqual(params, ["%50\\%\\_off%", "%50\\%\\_off%", "%50\\%\\_off%"]);
  assert.equal(buildKeyFilter({ q: "", status: "active" }).clause, "WHERE k.revoked_at IS NULL");
  assert.equal(buildKeyFilter({ q: "", status: "revoked" }).clause, "WHERE k.revoked_at IS NOT NULL");
  assert.deepEqual(buildKeyFilter({ q: "", status: "all" }), { clause: "", params: [] });
});

test("admin list: hostile search text stays out of the SQL; rows carry owner, plan and ban", async () => {
  const evil = "'; DROP TABLE storage_api_keys; --";
  const { db, calls } = fake([
    ["SELECT COUNT(*) AS n", [{ n: 3 }]],
    ["ORDER BY k.created_at DESC", [{ ...keyRow(), owner_email: "ada@x.com", owner_name: "Ada", plan: "pro", banned_at: new Date() }]],
  ]);
  const out = await makeApiKeyStore(db).adminListKeys({ q: evil, status: "all", limit: 25, offset: 25 });
  for (const call of calls) {
    assert.ok(!/drop table/i.test(call.sql), call.sql);
    assert.ok(!call.sql.includes("key_hash"));
  }
  assert.equal(out.total, 3);
  assert.deepEqual([out.keys[0].owner.email, out.keys[0].plan, out.keys[0].ownerBanned], ["ada@x.com", "pro", true]);
  assert.deepEqual(calls[1].params.slice(-2), [25, 25]);
});

test("admin revoke: audited once, idempotent, 404 for unknown", async () => {
  const live = fake([
    ["SELECT id, user_id, name, key_prefix, revoked_at FROM storage_api_keys", [{ id: K1, user_id: U1, name: "Website", key_prefix: "cz_live_ab12", revoked_at: null }]],
    ["UPDATE storage_api_keys SET revoked_at = NOW() WHERE id = ?", []],
    ["INSERT INTO admin_action_log", []],
  ]);
  assert.deepEqual(await makeApiKeyStore(live.db).adminRevokeKey(K1, ADMIN), { changed: true });
  const [log] = live.ran("INSERT INTO admin_action_log");
  assert.deepEqual([log.params[1], log.params[2], log.params[3], log.params[4]], [ADMIN, "cloud.apikey.revoke", "api_key", K1]);
  assert.deepEqual(JSON.parse(log.params[5]), { name: "Website", prefix: "cz_live_ab12", ownerId: U1 });

  const again = fake([["SELECT id, user_id, name, key_prefix, revoked_at FROM storage_api_keys", [{ id: K1, user_id: U1, name: "W", key_prefix: "p", revoked_at: new Date() }]]]);
  assert.deepEqual(await makeApiKeyStore(again.db).adminRevokeKey(K1, ADMIN), { changed: false });
  assert.equal(again.ran("INSERT").length, 0);

  const none = fake([["SELECT id, user_id, name, key_prefix, revoked_at FROM storage_api_keys", []]]);
  assert.equal(await makeApiKeyStore(none.db).adminRevokeKey(K1, ADMIN), null);
});

test("admin rate limit: sets, clears to the plan default, and logs only real changes", async () => {
  const row = (v) => [{ id: K1, user_id: U1, name: "W", key_prefix: "p", rate_limit_per_minute: v }];
  const set = fake([["rate_limit_per_minute FROM storage_api_keys", row(null)], ["UPDATE storage_api_keys SET rate_limit_per_minute", []], ["INSERT INTO admin_action_log", []]]);
  assert.deepEqual(await makeApiKeyStore(set.db).adminSetRateLimit(K1, 120, ADMIN), { changed: true });
  assert.deepEqual(set.ran("UPDATE storage_api_keys SET")[0].params, [120, K1]);
  assert.deepEqual(JSON.parse(set.ran("INSERT")[0].params[5]), { name: "W", prefix: "p", ownerId: U1, from: null, to: 120 });

  const clear = fake([["rate_limit_per_minute FROM storage_api_keys", row(120)], ["UPDATE storage_api_keys SET rate_limit_per_minute", []], ["INSERT INTO admin_action_log", []]]);
  assert.deepEqual(await makeApiKeyStore(clear.db).adminSetRateLimit(K1, null, ADMIN), { changed: true });
  assert.deepEqual(clear.ran("UPDATE storage_api_keys SET")[0].params, [null, K1]);

  const same = fake([["rate_limit_per_minute FROM storage_api_keys", row(120)]]);
  assert.deepEqual(await makeApiKeyStore(same.db).adminSetRateLimit(K1, 120, ADMIN), { changed: false });
  assert.equal(same.ran("INSERT").length, 0);
  const none = fake([["rate_limit_per_minute FROM storage_api_keys", []]]);
  assert.equal(await makeApiKeyStore(none.db).adminSetRateLimit(K1, 5, ADMIN), null);
});

test("admin revoke all: counts, logs against the user, and stays silent when there is nothing to revoke", async () => {
  const some = fake([
    ["SELECT id FROM users WHERE id = ? LIMIT 1", [{ id: U1 }]],
    ["SELECT id FROM storage_api_keys WHERE user_id = ?", [{ id: "a" }, { id: "b" }]],
    ["UPDATE storage_api_keys SET revoked_at = NOW() WHERE user_id = ?", []],
    ["INSERT INTO admin_action_log", []],
  ]);
  assert.deepEqual(await makeApiKeyStore(some.db).adminRevokeAllForUser(U1, ADMIN), { revoked: 2 });
  const [log] = some.ran("INSERT");
  assert.deepEqual([log.params[2], log.params[3], log.params[4]], ["cloud.apikey.revoke_all", "user", U1]);
  assert.deepEqual(JSON.parse(log.params[5]), { count: 2 });

  const empty = fake([["SELECT id FROM users WHERE id = ? LIMIT 1", [{ id: U1 }]], ["SELECT id FROM storage_api_keys WHERE user_id = ?", []]]);
  assert.deepEqual(await makeApiKeyStore(empty.db).adminRevokeAllForUser(U1, ADMIN), { revoked: 0 });
  assert.equal(empty.ran("INSERT").length, 0);
  const nobody = fake([["SELECT id FROM users WHERE id = ? LIMIT 1", []]]);
  assert.equal(await makeApiKeyStore(nobody.db).adminRevokeAllForUser(U1, ADMIN), null);
});

test("no query anywhere reads the hash back out", async () => {
  const everything = fake([
    ["SELECT COUNT(*) AS n", [{ n: 0 }]], ["ORDER BY", []], ["WHERE k.id = ? LIMIT 1", []], ["WHERE k.user_id = ?", []],
  ]);
  const store = makeApiKeyStore(everything.db);
  await store.adminListKeys({ q: "", status: "all", limit: 5, offset: 0 });
  await store.adminGetKey(K1);
  await store.listUserKeys(U1);
  const selects = everything.calls.filter((c) => c.sql.startsWith("SELECT"));
  assert.ok(selects.length >= 4);
  assert.ok(!selects.some((c) => c.sql.includes("key_hash")));
});
