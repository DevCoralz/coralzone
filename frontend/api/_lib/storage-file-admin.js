// What an admin may do to a stored file: remove it, or mark it for review.
//
// The file lives in the storage service, so the action happens there first
// (through `call`), and only a successful action is written to the admin log.
// If the log write itself fails after the file is already gone, the action
// still counts as done, and the answer says `audited: false` so the page can
// tell the admin, instead of pretending the file is back.
//
// Built from `call` and `store` so the rules can be tested without a network
// or a database. Nothing from the storage service's own error text is passed on.
const PREFIX = "/api/v1/storage/admin/files";

const UNAVAILABLE = { status: 503, body: { error: "Storage is unavailable right now. Try again shortly." } };
const NOT_FOUND = { status: 404, body: { error: "File not found." } };

export function makeFileAdmin({ call, store, onLogFailure = () => {} }) {
  async function audit(adminId, action, fileId, details) {
    try {
      await store.logFileAction(adminId, action, fileId, details);
      return true;
    } catch (error) {
      onLogFailure(error);
      return false;
    }
  }

  async function deleteFile(fileId, adminId) {
    const reply = await call("DELETE", `${PREFIX}/${fileId}`);
    if (!reply) return UNAVAILABLE;
    if (reply.status === 404) return NOT_FOUND;
    if (!reply.ok || !reply.data?.deleted) {
      return { status: 502, body: { error: "The file could not be removed right now. Nothing was changed. Try again shortly." } };
    }
    const gone = reply.data.deleted;
    const audited = await audit(adminId, "cloud.file.delete", fileId, {
      name: gone.name, size: gone.size, mimeType: gone.mimeType, ownerId: gone.ownerId, bucketId: gone.bucketId, flagged: gone.flagged === true,
    });
    return { status: 200, body: { ok: true, audited } };
  }

  // reason is only kept when flagging. Clearing a flag drops it.
  async function setFlag(fileId, flagged, reason, adminId) {
    const reply = await call("PUT", `${PREFIX}/${fileId}/flag`, { json: { flagged, reason: flagged ? reason : null } });
    if (!reply) return UNAVAILABLE;
    if (reply.status === 404) return NOT_FOUND;
    if (!reply.ok || !reply.data) {
      return { status: 502, body: { error: "The change could not be saved right now. Try again shortly." } };
    }
    const file = reply.data;
    const audited = await audit(adminId, flagged ? "cloud.file.flag" : "cloud.file.unflag", fileId, {
      name: file.name, mimeType: file.mimeType, ownerId: file.ownerId, reason: flagged ? file.flagReason ?? null : null,
    });
    return { status: 200, body: { ok: true, audited } };
  }

  return { deleteFile, setFlag };
}
