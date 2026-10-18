import { test } from "node:test";
import assert from "node:assert/strict";
import { USER_STATUSES, USER_PLAN_FILTERS, USER_LIST_LIMIT, parseUserListQuery, summarizeAction } from "./storage-user-schema.js";

const params = (obj) => new URLSearchParams(obj);

test("constants match the TypeScript copy (src/lib/storage-users.ts pins the same values)", () => {
  assert.deepEqual(USER_STATUSES, ["all", "frozen", "banned"]);
  assert.deepEqual(USER_PLAN_FILTERS, ["all", "starter", "pro", "scale"]);
  assert.deepEqual(USER_LIST_LIMIT, { default: 25, max: 100 });
});

test("an empty query gives the defaults", () => {
  assert.deepEqual(parseUserListQuery(params({})), { q: "", status: "all", plan: "all", limit: 25, offset: 0 });
});

test("good filters pass through, unknown ones fall back to all", () => {
  const ok = parseUserListQuery(params({ status: "banned", plan: "pro" }));
  assert.equal(ok.status, "banned");
  assert.equal(ok.plan, "pro");
  const bad = parseUserListQuery(params({ status: "everyone'; DROP TABLE users;--", plan: "enterprise" }));
  assert.equal(bad.status, "all");
  assert.equal(bad.plan, "all");
  assert.equal(parseUserListQuery(params({ plan: "__proto__" })).plan, "all");
});

test("search text is tidied: control characters out, spaces collapsed, length capped", () => {
  assert.equal(parseUserListQuery(params({ q: "  ada\u0000\n  lovelace\t" })).q, "ada lovelace");
  assert.equal(parseUserListQuery(params({ q: "x".repeat(500) })).q.length, 100);
});

test("limit and offset are clamped, and nonsense falls back", () => {
  assert.equal(parseUserListQuery(params({ limit: "5000" })).limit, 100);
  assert.equal(parseUserListQuery(params({ limit: "10" })).limit, 10);
  assert.equal(parseUserListQuery(params({ limit: "-3" })).limit, 25);
  assert.equal(parseUserListQuery(params({ limit: "abc" })).limit, 25);
  assert.equal(parseUserListQuery(params({ limit: "2.5" })).limit, 25);
  assert.equal(parseUserListQuery(params({ offset: "50" })).offset, 50);
  assert.equal(parseUserListQuery(params({ offset: "-1" })).offset, 0);
  assert.equal(parseUserListQuery(params({ offset: "99999999" })).offset, 0);
});

test("a controls update is summarised in plain words", () => {
  const details = JSON.stringify({ changes: { frozen: { from: false, to: true }, plan: { from: "starter", to: "pro" } } });
  assert.equal(summarizeAction("cloud.user.controls.update", details), "Froze uploads, changed the plan");
  assert.equal(summarizeAction("cloud.user.controls.update", JSON.stringify({ changes: { banned: { from: true, to: false } } })), "Lifted the ban");
  assert.equal(summarizeAction("cloud.user.controls.update", JSON.stringify({ changes: { frozen: { from: true, to: false } } })), "Unfroze uploads");
});

test("odd or broken log details never throw and never leak raw text", () => {
  assert.equal(summarizeAction("cloud.user.controls.update", "not json"), "Changed storage controls");
  assert.equal(summarizeAction("cloud.user.controls.update", null), "Changed storage controls");
  assert.equal(summarizeAction("cloud.user.controls.update", JSON.stringify({ changes: [] })), "Changed storage controls");
  assert.equal(summarizeAction("cloud.user.controls.update", JSON.stringify({ changes: { sneaky: { to: 1 } } })), "Changed storage controls");
  assert.equal(summarizeAction("something.else", "<script>alert(1)</script>"), "something.else");
  assert.ok(!/[<>/]/.test(summarizeAction("<b>x</b>", "")));
  assert.equal(summarizeAction(undefined, ""), "Admin action");
});
