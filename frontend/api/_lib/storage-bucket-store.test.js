// Tests the bucket RULES (plan limit, unique names, ownership, ban, frozen,
// audit log) against a small in-memory fake of the few SQL statements the
// store uses. The SQL text itself is covered by reading it and by the staging
// check in the README; what is proven here is the logic around it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeBucketStore } from "./storage-bucket-store.js";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const ADMIN = "99999999-9999-4999-8999-999999999999";

function fakeDb() {
  const state = {
    users: [{ id: U1, email: "a@x.com", name: "A" }, { id: U2, email: "b@x.com", name: "B" }],
    quotas: new Map(), // userId -> plan
    bans: new Set(),
    buckets: [],
    log: [],
    clock: 0,
  };
  const row = (b) => ({ id: b.id, user_id: b.user_id, name: b.name, frozen_at: b.frozen_at, created_at: new Date(1_700_000_000_000 + b.n * 1000) });
  const has = (sql, text) => sql.replace(/\s+/g, " ").includes(text);

  async function run(sql, p) {
    if (has(sql, "SELECT id FROM users WHERE id = ?")) return state.users.filter((u) => u.id === p[0]).map((u) => ({ id: u.id }));
    if (has(sql, "FROM storage_user_bans WHERE user_id = ?")) return state.bans.has(p[0]) ? [{ user_id: p[0] }] : [];
    if (has(sql, "SELECT plan FROM storage_quotas WHERE user_id = ?")) return state.quotas.has(p[0]) ? [{ plan: state.quotas.get(p[0]) }] : [];
    if (has(sql, "SELECT COUNT(*) AS n FROM storage_buckets WHERE user_id = ?")) return [{ n: state.buckets.filter((b) => b.user_id === p[0]).length }];
    if (has(sql, "AND LOWER(name) = LOWER(?) AND id <> ?")) {
      return state.buckets.filter((b) => b.user_id === p[0] && b.name.toLowerCase() === p[1].toLowerCase() && b.id !== p[2]).map((b) => ({ id: b.id }));
    }
    if (has(sql, "INSERT INTO storage_buckets (id, user_id, name)")) {
      state.buckets.push({ id: p[0], user_id: p[1], name: p[2], frozen_at: null, n: ++state.clock });
      return [];
    }
    if (has(sql, "SELECT id, name, frozen_at, created_at FROM storage_buckets WHERE id = ? AND user_id = ?")) return state.buckets.filter((b) => b.id === p[0] && b.user_id === p[1]).map(row);
    if (has(sql, "SELECT id, name, frozen_at, created_at FROM storage_buckets WHERE id = ?")) return state.buckets.filter((b) => b.id === p[0]).map(row);
    if (has(sql, "SELECT id, name, frozen_at, created_at FROM storage_buckets WHERE user_id = ?")) return state.buckets.filter((b) => b.user_id === p[0]).sort((a, b) => a.n - b.n).map(row);
    if (has(sql, "SELECT id, frozen_at FROM storage_buckets WHERE id = ? AND user_id = ?")) return state.buckets.filter((b) => b.id === p[0] && b.user_id === p[1]).map(row);
    if (has(sql, "UPDATE storage_buckets SET name = ? WHERE id = ? AND user_id = ?")) {
      for (const b of state.buckets) if (b.id === p[1] && b.user_id === p[2]) b.name = p[0];
      return [];
    }
    if (has(sql, "DELETE FROM storage_buckets WHERE id = ? AND user_id = ?")) {
      state.buckets = state.buckets.filter((b) => !(b.id === p[0] && b.user_id === p[1]));
      return [];
    }
    if (has(sql, "SELECT id, user_id, name, frozen_at FROM storage_buckets WHERE id = ?")) return state.buckets.filter((b) => b.id === p[0]).map(row);
    if (has(sql, "SELECT id, user_id, name FROM storage_buckets WHERE id = ?")) return state.buckets.filter((b) => b.id === p[0]).map(row);
    if (has(sql, "UPDATE storage_buckets SET frozen_at = ? WHERE id = ?")) {
      for (const b of state.buckets) if (b.id === p[1]) b.frozen_at = p[0];
      return [];
    }
    if (has(sql, "DELETE FROM storage_buckets WHERE id = ?")) {
      state.buckets = state.buckets.filter((b) => b.id !== p[0]);
      return [];
    }
    if (has(sql, "INSERT INTO admin_action_log")) {
      state.log.push({ admin: p[1], action: p[2], target: p[3], details: JSON.parse(p[4]) });
      return [];
    }
    throw new Error(`fake db: unhandled SQL: ${sql.replace(/\s+/g, " ").slice(0, 100)}`);
  }

  const db = {
    query: async (sql, params = []) => run(sql, params),
    // Like the real one: roll back everything if the callback throws.
    withTransaction: async (fn) => {
      const snapshot = { buckets: structuredClone(state.buckets), log: structuredClone(state.log) };
      try {
        return await fn({ query: async (sql, params = []) => [await run(sql, params)] });
      } catch (error) {
        state.buckets = snapshot.buckets;
        state.log = snapshot.log;
        throw error;
      }
    },
  };
  return { state, store: makeBucketStore(db) };
}

const refuses = async (promise, text) => {
  await assert.rejects(promise, (error) => error.userFacing === true && error.message.includes(text), `expected a user-facing refusal containing "${text}"`);
};

test("a Starter user can make one bucket, not two", async () => {
  const { store } = fakeDb();
  const first = await store.createUserBucket(U1, "My App");
  assert.equal(first.name, "My App");
  assert.equal(first.frozen, false);
  assert.match(first.id, /^[0-9a-f-]{36}$/);
  await refuses(store.createUserBucket(U1, "Second"), "Starter plan includes 1 bucket");
  assert.equal((await store.listUserBuckets(U1)).length, 1);
});

test("Pro and Scale are unlimited; an unknown plan value gets the strict limit", async () => {
  for (const plan of ["pro", "scale"]) {
    const { store, state } = fakeDb();
    state.quotas.set(U1, plan);
    for (let i = 0; i < 12; i++) await store.createUserBucket(U1, `bucket ${i}`);
    assert.equal((await store.listUserBuckets(U1)).length, 12, plan);
  }
  const { store, state } = fakeDb();
  state.quotas.set(U1, "mystery");
  await store.createUserBucket(U1, "one");
  await refuses(store.createUserBucket(U1, "two"), "plan includes 1 bucket");
});

test("limits are per user", async () => {
  const { store } = fakeDb();
  await store.createUserBucket(U1, "mine");
  assert.equal((await store.createUserBucket(U2, "mine")).name, "mine"); // same name, different user: fine
});

test("names are unique per user, ignoring case", async () => {
  const { store, state } = fakeDb();
  state.quotas.set(U1, "pro");
  await store.createUserBucket(U1, "Photos");
  await refuses(store.createUserBucket(U1, "photos"), "already have a bucket with that name");
  await refuses(store.createUserBucket(U1, "PHOTOS"), "already have a bucket with that name");
});

test("a banned user cannot create buckets", async () => {
  const { store, state } = fakeDb();
  state.bans.add(U1);
  await refuses(store.createUserBucket(U1, "x"), "suspended");
  assert.equal(state.buckets.length, 0);
});

test("an unknown user gets null, not a bucket", async () => {
  const { store, state } = fakeDb();
  assert.equal(await store.createUserBucket("00000000-0000-4000-8000-000000000000", "x"), null);
  assert.equal(state.buckets.length, 0);
});

test("ownership: other users' buckets look like they don't exist", async () => {
  const { store } = fakeDb();
  const mine = await store.createUserBucket(U1, "mine");
  assert.equal(await store.getUserBucket(U2, mine.id), null);
  assert.equal(await store.renameUserBucket(U2, mine.id, "stolen"), null);
  assert.equal(await store.deleteUserBucket(U2, mine.id), false);
  assert.equal((await store.getUserBucket(U1, mine.id)).name, "mine");
  assert.deepEqual(await store.listUserBuckets(U2), []);
});

test("rename: works, keeps names unique, can keep its own name in a different case", async () => {
  const { store, state } = fakeDb();
  state.quotas.set(U1, "pro");
  const a = await store.createUserBucket(U1, "alpha");
  await store.createUserBucket(U1, "beta");
  assert.equal((await store.renameUserBucket(U1, a.id, "Alpha")).name, "Alpha");
  await refuses(store.renameUserBucket(U1, a.id, "BETA"), "already have a bucket with that name");
  assert.equal((await store.getUserBucket(U1, a.id)).name, "Alpha");
});

test("a frozen bucket cannot be renamed or deleted by its owner, but the admin can unfreeze it", async () => {
  const { store } = fakeDb();
  const b = await store.createUserBucket(U1, "evidence");
  assert.deepEqual(await store.adminSetBucketFrozen(b.id, true, ADMIN), { changed: true });
  assert.equal((await store.getUserBucket(U1, b.id)).frozen, true);
  await refuses(store.renameUserBucket(U1, b.id, "innocent"), "frozen");
  await refuses(store.deleteUserBucket(U1, b.id), "frozen");
  assert.ok(await store.getUserBucket(U1, b.id)); // still there
  await store.adminSetBucketFrozen(b.id, false, ADMIN);
  assert.equal(await store.deleteUserBucket(U1, b.id), true);
});

test("admin freeze is idempotent and audited exactly once per real change", async () => {
  const { store, state } = fakeDb();
  const b = await store.createUserBucket(U1, "spam");
  assert.deepEqual(await store.adminSetBucketFrozen(b.id, true, ADMIN), { changed: true });
  assert.deepEqual(await store.adminSetBucketFrozen(b.id, true, ADMIN), { changed: false });
  assert.deepEqual(await store.adminSetBucketFrozen(b.id, false, ADMIN), { changed: true });
  assert.deepEqual(await store.adminSetBucketFrozen(b.id, false, ADMIN), { changed: false });
  assert.deepEqual(state.log.map((l) => l.action), ["cloud.bucket.freeze", "cloud.bucket.unfreeze"]);
  assert.equal(state.log[0].admin, ADMIN);
  assert.equal(state.log[0].target, b.id);
  assert.deepEqual(state.log[0].details, { name: "spam", ownerId: U1 });
  assert.equal(await store.adminSetBucketFrozen("00000000-0000-4000-8000-000000000000", true, ADMIN), null);
});

test("admin delete removes the row, logs what was deleted, and 404s on a second try", async () => {
  const { store, state } = fakeDb();
  const b = await store.createUserBucket(U1, "old");
  assert.equal(await store.adminDeleteBucket(b.id, 42, ADMIN), true);
  assert.equal(state.buckets.length, 0);
  assert.deepEqual(state.log.at(-1), { admin: ADMIN, action: "cloud.bucket.delete", target: b.id, details: { name: "old", ownerId: U1, filesDeleted: 42 } });
  assert.equal(await store.adminDeleteBucket(b.id, 0, ADMIN), false);
  assert.equal(state.log.length, 1);
});

test("a user can delete their own empty, unfrozen bucket and then make another on Starter", async () => {
  const { store } = fakeDb();
  const b = await store.createUserBucket(U1, "first");
  assert.equal(await store.deleteUserBucket(U1, b.id), true);
  assert.equal((await store.createUserBucket(U1, "second")).name, "second");
});

test("a refused create leaves nothing behind (transaction rolls back)", async () => {
  const { store, state } = fakeDb();
  await store.createUserBucket(U1, "one");
  await assert.rejects(store.createUserBucket(U1, "two"));
  assert.equal(state.buckets.length, 1);
});
