import { test } from "node:test";
import assert from "node:assert/strict";
import { FLAG_REASON_MAX, OWNERS_PER_REQUEST_MAX, cleanReason, validateFileAction, parseOwnersQuery } from "./storage-file-schema.js";
import { makeFileAdmin } from "./storage-file-admin.js";
import { makeFileStore } from "./storage-file-store.js";

const F1 = "3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f";
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const ADMIN = "99999999-9999-4999-8999-999999999999";

test("constants match the TypeScript copy (src/lib/storage-files.ts pins the same values)", () => {
  assert.equal(FLAG_REASON_MAX, 200);
  assert.equal(OWNERS_PER_REQUEST_MAX, 100);
});

test("a flag reason is tidied, capped and may be empty", () => {
  assert.equal(cleanReason("  looks \n like\tmalware \u0000 "), "looks like malware");
  assert.equal(cleanReason("   "), null);
  assert.equal(cleanReason(5), null);
  assert.equal(cleanReason("x".repeat(500)).length, FLAG_REASON_MAX);
});

test("file actions: each shape is checked, anything else is refused", () => {
  assert.deepEqual(validateFileAction({ action: "delete", id: F1.toUpperCase() }), { ok: true, action: "delete", id: F1 });
  assert.deepEqual(validateFileAction({ action: "unflag", id: F1 }), { ok: true, action: "unflag", id: F1 });
  assert.deepEqual(validateFileAction({ action: "flag", id: F1, reason: " bad " }), { ok: true, action: "flag", id: F1, reason: "bad" });
  assert.deepEqual(validateFileAction({ action: "flag", id: F1 }), { ok: true, action: "flag", id: F1, reason: null });
  assert.equal(validateFileAction({ action: "flag", id: F1, reason: 7 }).ok, false);
  for (const bad of [null, [], "delete", { action: "delete" }, { action: "delete", id: "../x" }, { action: "wipe", id: F1 }, { id: F1 }]) {
    assert.equal(validateFileAction(bad).ok, false, JSON.stringify(bad));
  }
});

test("owner lookups: only real ids, no duplicates, capped", () => {
  assert.deepEqual(parseOwnersQuery(new URLSearchParams({ owners: `${U1}, ${U2.toUpperCase()},${U1},nope,'; DROP` })), [U1, U2]);
  assert.deepEqual(parseOwnersQuery(new URLSearchParams()), []);
  const many = Array.from({ length: 300 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`).join(",");
  assert.equal(parseOwnersQuery(new URLSearchParams({ owners: many })).length, 100);
});

// ── the actions ───────────────────────────────────────────────────────────────

function setup({ reply, logFails = false } = {}) {
  const calls = [];
  const logs = [];
  const failures = [];
  const admin = makeFileAdmin({
    call: async (method, path, opts) => { calls.push({ method, path, json: opts?.json }); return typeof reply === "function" ? reply(method, path) : reply; },
    store: { logFileAction: async (...args) => { if (logFails) throw new Error("db down"); logs.push(args); } },
    onLogFailure: (e) => failures.push(e.message),
  });
  return { admin, calls, logs, failures };
}

const gone = { name: "bad.zip", size: 9, mimeType: "application/zip", ownerId: U1, bucketId: null, flagged: true, key: F1 };

test("deleting asks the storage service, then logs what was removed", async () => {
  const { admin, calls, logs } = setup({ reply: { ok: true, status: 200, data: { deleted: gone } } });
  const out = await admin.deleteFile(F1, ADMIN);
  assert.deepEqual(out, { status: 200, body: { ok: true, audited: true } });
  assert.deepEqual(calls, [{ method: "DELETE", path: `/api/v1/storage/admin/files/${F1}`, json: undefined }]);
  const [adminId, action, fileId, details] = logs[0];
  assert.deepEqual([adminId, action, fileId], [ADMIN, "cloud.file.delete", F1]);
  assert.deepEqual(details, { name: "bad.zip", size: 9, mimeType: "application/zip", ownerId: U1, bucketId: null, flagged: true });
});

test("a failed delete is never logged as done", async () => {
  for (const [reply, status] of [[null, 503], [{ ok: false, status: 404, data: null }, 404], [{ ok: false, status: 400, data: { detail: "secret telegram trace" } }, 502], [{ ok: true, status: 200, data: {} }, 502]]) {
    const { admin, logs } = setup({ reply });
    const out = await admin.deleteFile(F1, ADMIN);
    assert.equal(out.status, status);
    assert.equal(logs.length, 0);
    assert.ok(!JSON.stringify(out).includes("secret telegram trace"));
  }
});

test("if only the log write fails, the file is still gone and the answer says so", async () => {
  const { admin, failures } = setup({ reply: { ok: true, status: 200, data: { deleted: gone } }, logFails: true });
  const out = await admin.deleteFile(F1, ADMIN);
  assert.deepEqual(out, { status: 200, body: { ok: true, audited: false } });
  assert.deepEqual(failures, ["db down"]);
});

test("flagging sends the reason, and the log records the cleaned reason the service saved", async () => {
  const saved = { name: "bad.zip", mimeType: "application/zip", ownerId: U1, flagged: true, flagReason: "malware" };
  const { admin, calls, logs } = setup({ reply: { ok: true, status: 200, data: saved } });
  const out = await admin.setFlag(F1, true, "malware", ADMIN);
  assert.deepEqual(out, { status: 200, body: { ok: true, audited: true } });
  assert.deepEqual(calls[0], { method: "PUT", path: `/api/v1/storage/admin/files/${F1}/flag`, json: { flagged: true, reason: "malware" } });
  assert.deepEqual(logs[0].slice(0, 3), [ADMIN, "cloud.file.flag", F1]);
  assert.equal(logs[0][3].reason, "malware");
});

test("unflagging drops any reason and logs its own action", async () => {
  const saved = { name: "bad.zip", mimeType: "application/zip", ownerId: U1, flagged: false, flagReason: null };
  const { admin, calls, logs } = setup({ reply: { ok: true, status: 200, data: saved } });
  await admin.setFlag(F1, false, "should be ignored", ADMIN);
  assert.deepEqual(calls[0].json, { flagged: false, reason: null });
  assert.equal(logs[0][1], "cloud.file.unflag");
  assert.equal(logs[0][3].reason, null);
});

test("a failed flag change is never logged", async () => {
  for (const [reply, status] of [[null, 503], [{ ok: false, status: 404, data: null }, 404], [{ ok: false, status: 500, data: null }, 502]]) {
    const { admin, logs } = setup({ reply });
    assert.equal((await admin.setFlag(F1, true, null, ADMIN)).status, status);
    assert.equal(logs.length, 0);
  }
});

// ── the database side ─────────────────────────────────────────────────────────

test("owner lookup is one parameterised query and maps ban state", async () => {
  const calls = [];
  const store = makeFileStore({ query: async (sql, params) => { calls.push({ sql: sql.replace(/\s+/g, " "), params }); return [{ id: U1, name: null, email: "a@x.com", banned_at: new Date() }, { id: U2, name: "B", email: "b@x.com", banned_at: null }]; } });
  assert.deepEqual(await store.ownersInfo([]), []);
  assert.equal(calls.length, 0);
  const owners = await store.ownersInfo([U1, U2]);
  assert.deepEqual(owners, [{ id: U1, name: "", email: "a@x.com", banned: true }, { id: U2, name: "B", email: "b@x.com", banned: false }]);
  assert.match(calls[0].sql, /WHERE u\.id IN \(\?\)/);
  assert.deepEqual(calls[0].params, [[U1, U2]]);
  assert.ok(!calls[0].sql.includes("password"));
});

test("a file action is logged against the file, with details capped", async () => {
  const calls = [];
  const store = makeFileStore({ query: async (sql, params) => { calls.push({ sql: sql.replace(/\s+/g, " "), params }); return []; } });
  await store.logFileAction(ADMIN, "cloud.file.delete", F1, { name: "x".repeat(20_000) });
  assert.match(calls[0].sql, /INSERT INTO admin_action_log/);
  assert.match(calls[0].sql, /'file'/);
  assert.deepEqual(calls[0].params.slice(1, 4), [ADMIN, "cloud.file.delete", F1]);
  assert.equal(calls[0].params[4].length, 8000);
});
