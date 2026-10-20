// The admin file actions wired to the real storage service and database.
// The rules live in storage-file-admin.js and storage-file-store.js, which take
// their dependencies as arguments so they can be tested with fakes.
import { query } from "./db.js";
import { storageCall } from "./storage-service.js";
import { makeFileStore } from "./storage-file-store.js";
import { makeFileAdmin } from "./storage-file-admin.js";

const store = makeFileStore({ query });
export const { ownersInfo } = store;
export const { deleteFile, setFlag } = makeFileAdmin({
  call: storageCall,
  store,
  // Only the error's message goes to the log, never request data.
  onLogFailure: (error) => console.error("[admin files] audit log write failed:", error?.message ?? error),
});
