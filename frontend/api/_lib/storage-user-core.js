// Data access for the admin Users and usage pages, wired to the real database.
// The rules and queries live in storage-user-store.js, which takes the
// database as an argument so it can be tested with a fake.
import { query } from "./db.js";
import { makeUserStore } from "./storage-user-store.js";

export const { adminListUsers, adminGetUserOverview } = makeUserStore({ query });
