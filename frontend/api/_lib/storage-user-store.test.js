// The SQL text is checked here by shape (what is parameterised, what is not);
// the real statements run against MySQL in the staging check in the README.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeUserStore, buildUserFilter } from "./storage-user-store.js";
import { parseUserListQuery } from "./storage-user-schema.js";

const U1 = "11111111-1111-4111-8111-111111111111";
const flat = (sql) => sql.replace(/\s+/g, " ").trim();

function recorder(answers) {
  const calls = [];
  const query = async (sql, params = []) => {
    calls.push({ sql: flat(sql), params });
    const hit = answers.find((a) => a.when(flat(sql)));
    if (!hit) throw new Error(`unexpected SQL: ${flat(sql).slice(0, 80)}`);
    return hit.rows;
  };
  return { query, calls };
}

const userRow = {
  id: U1, name: "Ada", email: "ada@x.com", created_at: new Date("2026-01-02T03:04:05Z"),
  plan: "pro", extra_bytes: 10, status: "frozen", bytes_quota: null, max_upload_bytes: 500,
  banned_at: null, ban_reason: null, bucket_count: 3,
};

test("no filters: no WHERE clause and no parameters", () => {
  assert.deepEqual(buildUserFilter({ q: "", status: "all", plan: "all" }), { clause: "", params: [] });
});

test("a text search matches name or email with escaped wildcards, as parameters", () => {
  const { clause, params } = buildUserFilter({ q: "50%_off", status: "all", plan: "all" });
  assert.match(clause, /LOWER\(u\.name\) LIKE \?/);
  assert.match(clause, /u\.email_normalized LIKE \?/);
  assert.deepEqual(params, ["%50\\%\\_off%", "%50\\%\\_off%"]);
});

test("a full user id searches by id exactly", () => {
  const { clause, params } = buildUserFilter({ q: U1.toUpperCase(), status: "all", plan: "all" });
  assert.equal(clause, "WHERE u.id = ?");
  assert.deepEqual(params, [U1]);
});

test("status and plan filters narrow the list; Starter includes users with no quota row", () => {
  const frozen = buildUserFilter({ q: "", status: "frozen", plan: "all" });
  assert.equal(frozen.clause, "WHERE q.status = 'frozen'");
  const banned = buildUserFilter({ q: "", status: "banned", plan: "all" });
  assert.equal(banned.clause, "WHERE b.user_id IS NOT NULL");
  const starter = buildUserFilter({ q: "", status: "all", plan: "starter" });
  assert.equal(starter.clause, "WHERE COALESCE(q.plan, 'starter') = ?");
  assert.deepEqual(starter.params, ["starter"]);
});

test("hostile search text only ever travels as a parameter, never inside the SQL", async () => {
  const evil = "'; DROP TABLE users; --";
  const { query, calls } = recorder([
    { when: (s) => s.startsWith("SELECT COUNT(*)"), rows: [{ n: 0 }] },
    { when: (s) => s.includes("ORDER BY u.created_at DESC"), rows: [] },
  ]);
  const store = makeUserStore({ query });
  await store.adminListUsers(parseUserListQuery(new URLSearchParams({ q: evil })));
  for (const call of calls) {
    assert.ok(!/drop table/i.test(call.sql), call.sql);
    assert.ok(call.params.some((p) => typeof p === "string" && /drop table/i.test(p)));
  }
});

test("list maps rows to raw entitlement facts and passes paging through", async () => {
  const { query, calls } = recorder([
    { when: (s) => s.startsWith("SELECT COUNT(*)"), rows: [{ n: 41 }] },
    { when: (s) => s.includes("ORDER BY u.created_at DESC"), rows: [userRow] },
  ]);
  const store = makeUserStore({ query });
  const out = await store.adminListUsers({ q: "", status: "all", plan: "all", limit: 25, offset: 50 });
  assert.equal(out.total, 41);
  assert.equal(out.users.length, 1);
  const [u] = out.users;
  assert.equal(u.email, "ada@x.com");
  assert.equal(u.bucketCount, 3);
  assert.equal(u.createdAt, "2026-01-02T03:04:05.000Z");
  assert.deepEqual(u.entitlement, { plan: "pro", extraBytes: 10, frozen: true, bytesQuotaOverride: null, maxUploadOverride: 500, banned: false });
  assert.deepEqual(calls[1].params.slice(-2), [25, 50]);
  // The list never asks for password hashes or ban reasons it does not show.
  assert.ok(!calls.some((c) => c.sql.includes("password_hash")));
});

test("overview gathers buckets, key totals and a short admin history", async () => {
  const { query } = recorder([
    { when: (s) => s.includes("WHERE u.id = ? LIMIT 1"), rows: [{ ...userRow, banned_at: new Date(), ban_reason: "spam" }] },
    { when: (s) => s.includes("FROM storage_buckets WHERE user_id = ?"), rows: [
      { id: "b1", name: "photos", frozen_at: null, created_at: new Date("2026-02-01T00:00:00Z") },
      { id: "b2", name: "evidence", frozen_at: new Date(), created_at: new Date("2026-02-02T00:00:00Z") },
    ] },
    { when: (s) => s.includes("FROM storage_api_keys"), rows: [{ total: "2", active: "1", requests: "900" }] },
    { when: (s) => s.includes("FROM admin_action_log"), rows: [
      { id: "l1", action: "cloud.user.controls.update", details: JSON.stringify({ changes: { banned: { from: false, to: true } } }), created_at: new Date("2026-03-01T00:00:00Z"), admin_email: "boss@x.com" },
    ] },
  ]);
  const overview = await makeUserStore({ query }).adminGetUserOverview(U1);
  assert.equal(overview.user.name, "Ada");
  assert.equal(overview.banReason, "spam");
  assert.deepEqual(overview.buckets.map((b) => [b.name, b.frozen]), [["photos", false], ["evidence", true]]);
  assert.deepEqual(overview.apiKeys, { total: 2, active: 1, requests: 900 });
  assert.deepEqual(overview.recentActions, [{ id: "l1", summary: "Banned the user", by: "boss@x.com", at: "2026-03-01T00:00:00.000Z" }]);
});

test("overview of a user who does not exist is null, and the ban reason stays hidden unless banned", async () => {
  const none = recorder([{ when: (s) => s.includes("WHERE u.id = ? LIMIT 1"), rows: [] }]);
  assert.equal(await makeUserStore({ query: none.query }).adminGetUserOverview(U1), null);

  const { query } = recorder([
    { when: (s) => s.includes("WHERE u.id = ? LIMIT 1"), rows: [{ ...userRow, banned_at: null, ban_reason: "old note" }] },
    { when: (s) => s.includes("FROM storage_buckets"), rows: [] },
    { when: (s) => s.includes("FROM storage_api_keys"), rows: [{ total: 0, active: 0, requests: 0 }] },
    { when: (s) => s.includes("FROM admin_action_log"), rows: [] },
  ]);
  const overview = await makeUserStore({ query }).adminGetUserOverview(U1);
  assert.equal(overview.banReason, null);
  assert.deepEqual(overview.apiKeys, { total: 0, active: 0, requests: 0 });
});
