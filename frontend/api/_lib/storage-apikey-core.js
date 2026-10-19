// Data access for Cloud API keys, wired to the real database. The rules and
// queries live in storage-apikey-store.js, which takes the database as an
// argument so it can be tested with a fake.
import { query, withTransaction } from "./db.js";
import { makeApiKeyStore } from "./storage-apikey-store.js";

export const {
  listUserKeys, countActive, createUserKey, revokeUserKey, findKey, touchKey,
  adminListKeys, adminGetKey, adminRevokeKey, adminSetRateLimit, adminRevokeAllForUser,
} = makeApiKeyStore({ query, withTransaction });
