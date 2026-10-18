// Data access for Cloud storage buckets, wired to the real database. All the
// rules live in storage-bucket-store.js (which takes the database as an
// argument so it can be unit tested); see that file for what is enforced.
import { query, withTransaction } from "./db.js";
import { makeBucketStore } from "./storage-bucket-store.js";

export const {
  listUserBuckets,
  getUserBucket,
  createUserBucket,
  renameUserBucket,
  deleteUserBucket,
  adminListBuckets,
  adminGetBucket,
  adminSetBucketFrozen,
  adminDeleteBucket,
} = makeBucketStore({ query, withTransaction });
