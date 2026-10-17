// Run with: node --test api/_lib/   (no dependencies needed)
import test from "node:test";
import assert from "node:assert/strict";
import {
  FILE_GROUP_IDS,
  PLAN_IDS,
  LIMITS,
  validateSettingsPatch,
  validateSettingValue,
} from "./storage-settings-schema.js";

const GB = 1024 ** 3;
const MB = 1024 ** 2;

test("pinned constants (must match src/lib/storage-settings.ts)", () => {
  assert.deepEqual(FILE_GROUP_IDS, ["images", "video", "audio", "documents", "archives", "text_data", "other"]);
  assert.deepEqual(PLAN_IDS, ["starter", "pro", "scale"]);
  assert.equal(LIMITS.globalMaxUploadBytes.max, 4 * GB);
  assert.equal(LIMITS.planBytesQuota.max, 100 * 1024 * GB);
  assert.equal(LIMITS.maintenanceMessageMax, 200);
});

test("rejects non-objects, arrays, empty and unknown keys", () => {
  for (const bad of [null, undefined, 5, "x", [], {}]) assert.equal(validateSettingsPatch(bad).ok, false);
  assert.equal(validateSettingsPatch({ nope: 1 }).ok, false);
  assert.equal(validateSettingsPatch(JSON.parse('{"__proto__": {"a": 1}}')).ok, false);
});

test("global max upload bounds", () => {
  assert.equal(validateSettingValue("globalMaxUploadBytes", 4 * GB).ok, true);
  assert.equal(validateSettingValue("globalMaxUploadBytes", 4 * GB + 1).ok, false);
  assert.equal(validateSettingValue("globalMaxUploadBytes", MB - 1).ok, false);
  assert.equal(validateSettingValue("globalMaxUploadBytes", MB + 0.5).ok, false);
  assert.equal(validateSettingValue("globalMaxUploadBytes", "100").ok, false);
});

test("extra storage price bounds", () => {
  assert.equal(validateSettingValue("extraStoragePriceNgn", 1000).ok, true);
  assert.equal(validateSettingValue("extraStoragePriceNgn", 0).ok, true);
  assert.equal(validateSettingValue("extraStoragePriceNgn", -1).ok, false);
  assert.equal(validateSettingValue("extraStoragePriceNgn", 1_000_001).ok, false);
});

test("allowed file groups: needs >=1, known ids only, de-duplicated, canonical order", () => {
  assert.equal(validateSettingValue("allowedFileGroups", []).ok, false);
  assert.equal(validateSettingValue("allowedFileGroups", ["exe"]).ok, false);
  assert.equal(validateSettingValue("allowedFileGroups", "images").ok, false);
  const r = validateSettingValue("allowedFileGroups", ["video", "images", "images"]);
  assert.deepEqual(r.value, ["images", "video"]);
});

const plan = (q, u) => ({ bytesQuota: q, maxUploadBytes: u });
const goodQuotas = () => ({ starter: plan(20 * GB, 500 * MB), pro: plan(500 * GB, 2 * GB), scale: plan(2048 * GB, 4 * GB) });

test("plan quotas: valid, missing plan, extra plan, upload > quota", () => {
  assert.equal(validateSettingValue("planQuotas", goodQuotas()).ok, true);
  const missing = goodQuotas(); delete missing.scale;
  assert.equal(validateSettingValue("planQuotas", missing).ok, false);
  assert.equal(validateSettingValue("planQuotas", { ...goodQuotas(), enterprise: plan(GB, MB) }).ok, false);
  assert.equal(validateSettingValue("planQuotas", { ...goodQuotas(), starter: plan(1 * GB, 2 * GB) }).ok, false);
  assert.equal(validateSettingValue("planQuotas", { ...goodQuotas(), starter: { bytesQuota: 20 * GB, maxUploadBytes: 500 * MB, evil: 1 } }).ok, false);
});

test("maintenance: shape, control characters stripped, length cap", () => {
  assert.equal(validateSettingValue("maintenance", { enabled: "yes", message: "" }).ok, false);
  assert.equal(validateSettingValue("maintenance", { enabled: true }).ok, false);
  const r = validateSettingValue("maintenance", { enabled: true, message: "  Back\n\nsoon\u0000  " });
  assert.equal(r.ok, true);
  assert.equal(r.value.message, "Back soon");
  assert.equal(validateSettingValue("maintenance", { enabled: false, message: "x".repeat(201) }).ok, false);
});

test("patch: null resets a key; valid values are normalised", () => {
  const r = validateSettingsPatch({ extraStoragePriceNgn: null, allowedFileGroups: ["video", "images"] });
  assert.equal(r.ok, true);
  assert.equal(r.patch.extraStoragePriceNgn, null);
  assert.deepEqual(r.patch.allowedFileGroups, ["images", "video"]);
});
