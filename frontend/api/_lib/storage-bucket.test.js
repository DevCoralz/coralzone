import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUCKET_NAME_MAX, BUCKET_LIMITS, ADMIN_LIST_LIMIT, bucketLimitFor, validateBucketName, validateCreate, validateRename,
  validateBucketRef, validateFreeze, validateAdminDelete, escapeLike, parseAdminListQuery,
} from "./storage-bucket-schema.js";

const ID = "3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f";

test("constants match the TypeScript copy (src/lib/storage-buckets.ts pins the same values)", () => {
  assert.equal(BUCKET_NAME_MAX, 60);
  assert.deepEqual(BUCKET_LIMITS, { starter: 1, pro: null, scale: null });
  assert.deepEqual(ADMIN_LIST_LIMIT, { default: 25, max: 100 });
});

test("plan bucket limits: Starter has one, bigger plans are unlimited, unknown plans get the strictest", () => {
  assert.equal(bucketLimitFor("starter"), 1);
  assert.equal(bucketLimitFor("pro"), null);
  assert.equal(bucketLimitFor("scale"), null);
  assert.equal(bucketLimitFor("enterprise"), 1);
  assert.equal(bucketLimitFor("__proto__"), 1);
  assert.equal(bucketLimitFor(undefined), 1);
});

test("good names are trimmed and whitespace-collapsed", () => {
  assert.deepEqual(validateBucketName("  My   App  "), { ok: true, name: "My App" });
  for (const good of ["a", "photos-2026", "client_files", "v1.2 backup", "Café Menu", "项目1", "9lives"]) {
    assert.equal(validateBucketName(good).ok, true, good);
  }
  assert.equal(validateBucketName("x".repeat(BUCKET_NAME_MAX)).ok, true);
});

test("bad names are refused with a reason", () => {
  const bad = ["", "   ", "x".repeat(BUCKET_NAME_MAX + 1), "../etc", "a/b", "a\\b", "-leading", ".hidden", "_x",
    "<script>", "a;b", "emoji \u{1F600}", "quote'", 'dq"', "nul\u0000byte", null, undefined, 42, {}, []];
  for (const input of bad) {
    const result = validateBucketName(input);
    assert.equal(result.ok, false, JSON.stringify(input));
    assert.ok(result.error.length > 0);
  }
});

test("tabs and newlines inside a name become single spaces (never a second line)", () => {
  assert.deepEqual(validateBucketName("tab\there"), { ok: true, name: "tab here" });
  assert.deepEqual(validateBucketName("line\nbreak"), { ok: true, name: "line break" });
});

test("create / rename / ref / freeze / delete bodies", () => {
  assert.equal(validateCreate({ name: "Docs" }).ok, true);
  assert.equal(validateCreate(null).ok, false);
  assert.equal(validateCreate([]).ok, false);
  assert.deepEqual(validateRename({ id: ID.toUpperCase(), name: " New " }), { ok: true, id: ID, name: "New" });
  assert.equal(validateRename({ id: "nope", name: "x" }).ok, false);
  assert.equal(validateRename({ id: ID, name: "" }).ok, false);
  assert.deepEqual(validateBucketRef({ id: ID }), { ok: true, id: ID });
  assert.equal(validateBucketRef({ id: "1; DROP TABLE" }).ok, false);
  assert.deepEqual(validateFreeze({ id: ID, frozen: true }), { ok: true, id: ID, frozen: true });
  assert.equal(validateFreeze({ id: ID, frozen: "yes" }).ok, false);
  assert.equal(validateFreeze({ id: ID }).ok, false);
  assert.deepEqual(validateAdminDelete({ id: ID }), { ok: true, id: ID, filesDeleted: 0 });
  assert.deepEqual(validateAdminDelete({ id: ID, filesDeleted: 12 }), { ok: true, id: ID, filesDeleted: 12 });
  for (const n of [-1, 1.5, "5", 1e12, NaN, null]) assert.equal(validateAdminDelete({ id: ID, filesDeleted: n }).ok, false, String(n));
});

test("LIKE wildcards in a search are escaped", () => {
  assert.equal(escapeLike("50%_off\\"), "50\\%\\_off\\\\");
  assert.equal(escapeLike("plain"), "plain");
});

test("admin list query: sane defaults, clamped limit, bad input falls back", () => {
  const parse = (qs) => parseAdminListQuery(new URLSearchParams(qs));
  assert.deepEqual(parse(""), { q: "", status: "all", limit: 25, offset: 0 });
  assert.deepEqual(parse("q=%20Docs%20&status=frozen&limit=10&offset=20"), { q: "Docs", status: "frozen", limit: 10, offset: 20 });
  assert.equal(parse("limit=5000").limit, 100);
  assert.equal(parse("limit=0").limit, 25);
  assert.equal(parse("limit=abc").limit, 25);
  assert.equal(parse("offset=-4").offset, 0);
  assert.equal(parse("offset=1.5").offset, 0);
  assert.equal(parse("status=hacked").status, "all");
  assert.equal(parse(`q=${"a".repeat(500)}`).q.length, 100);
  assert.equal(parse("q=a%00b%0Ac").q, "a b c");
});
