// Run with: node --test api/_lib/   (no dependencies needed)
import test from "node:test";
import assert from "node:assert/strict";
import { validateControlsPatch, parseUserRef, isUuid, CONTROL_KEYS, BAN_REASON_MAX } from "./storage-quota-schema.js";

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const ID = "123e4567-e89b-42d3-a456-426614174000";

test("pinned control keys (must match src/lib/storage-quota.ts)", () => {
  assert.deepEqual(CONTROL_KEYS, ["plan", "extraBytes", "frozen", "bytesQuotaOverride", "maxUploadOverride", "banned", "banReason"]);
  assert.equal(BAN_REASON_MAX, 200);
});

test("isUuid / parseUserRef", () => {
  assert.equal(isUuid(ID), true);
  assert.equal(isUuid("nope"), false);
  assert.equal(isUuid(5), false);
  assert.deepEqual(parseUserRef(` ${ID.toUpperCase()} `), { userId: ID });
  assert.deepEqual(parseUserRef("  Ada@Example.COM "), { email: "ada@example.com" });
  for (const bad of ["", "   ", "not an email", "a@b c.com", 5, null, undefined, "x".repeat(300) + "@a.com"]) {
    assert.equal(parseUserRef(bad), null);
  }
});

test("rejects non-objects, empty and unknown keys, prototype pollution", () => {
  for (const bad of [null, undefined, 5, "x", [], {}]) assert.equal(validateControlsPatch(bad).ok, false);
  assert.equal(validateControlsPatch({ nope: 1 }).ok, false);
  assert.equal(validateControlsPatch(JSON.parse('{"__proto__": {"a": 1}}')).ok, false);
});

test("plan", () => {
  assert.deepEqual(validateControlsPatch({ plan: "pro" }), { ok: true, patch: { plan: "pro" } });
  for (const bad of ["enterprise", "", null, 1]) assert.equal(validateControlsPatch({ plan: bad }).ok, false);
});

test("extra storage bounds and type", () => {
  assert.equal(validateControlsPatch({ extraBytes: 0 }).ok, true);
  assert.equal(validateControlsPatch({ extraBytes: 10 * GB }).ok, true);
  for (const bad of [-1, 1.5, "10", null, NaN, Infinity, 101 * 1024 * GB]) assert.equal(validateControlsPatch({ extraBytes: bad }).ok, false);
});

test("overrides accept null (follow plan) and bounded integers", () => {
  assert.deepEqual(validateControlsPatch({ bytesQuotaOverride: null, maxUploadOverride: null }).patch, { bytesQuotaOverride: null, maxUploadOverride: null });
  assert.equal(validateControlsPatch({ bytesQuotaOverride: 1 * GB }).ok, true);
  assert.equal(validateControlsPatch({ bytesQuotaOverride: 1 * GB - 1 }).ok, false);
  assert.equal(validateControlsPatch({ maxUploadOverride: 4 * GB }).ok, true);
  assert.equal(validateControlsPatch({ maxUploadOverride: 4 * GB + 1 }).ok, false);
  assert.equal(validateControlsPatch({ maxUploadOverride: 1 * MB - 1 }).ok, false);
  assert.equal(validateControlsPatch({ maxUploadOverride: "5" }).ok, false);
});

test("upload override cannot exceed the storage override in the same patch", () => {
  assert.equal(validateControlsPatch({ bytesQuotaOverride: 2 * GB, maxUploadOverride: 3 * GB }).ok, false);
  assert.equal(validateControlsPatch({ bytesQuotaOverride: 2 * GB, maxUploadOverride: 2 * GB }).ok, true);
});

test("booleans are strict", () => {
  assert.equal(validateControlsPatch({ frozen: true }).ok, true);
  assert.equal(validateControlsPatch({ banned: false }).ok, true);
  for (const bad of ["true", 1, null]) {
    assert.equal(validateControlsPatch({ frozen: bad }).ok, false);
    assert.equal(validateControlsPatch({ banned: bad }).ok, false);
  }
});

test("ban reason is cleaned to one safe line and bounded", () => {
  assert.equal(validateControlsPatch({ banned: true, banReason: "  spam\n\nbot\t farm  " }).patch.banReason, "spam bot farm");
  assert.equal(validateControlsPatch({ banReason: "   " }).patch.banReason, null);
  assert.equal(validateControlsPatch({ banReason: null }).patch.banReason, null);
  assert.equal(validateControlsPatch({ banReason: "x".repeat(BAN_REASON_MAX) }).ok, true);
  assert.equal(validateControlsPatch({ banReason: "x".repeat(BAN_REASON_MAX + 1) }).ok, false);
  assert.equal(validateControlsPatch({ banReason: 5 }).ok, false);
});
