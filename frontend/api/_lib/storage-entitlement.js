// Turns a joined users/storage_quotas/storage_user_bans row into the raw
// entitlement facts the app uses. Pure (no database), shared by the quota and
// bucket data layers.
export function toEntitlement(row) {
  return {
    plan: row?.plan ?? "starter",
    extraBytes: Number(row?.extra_bytes ?? 0),
    frozen: row?.status === "frozen",
    bytesQuotaOverride: row?.bytes_quota == null ? null : Number(row.bytes_quota),
    maxUploadOverride: row?.max_upload_bytes == null ? null : Number(row.max_upload_bytes),
    banned: row?.banned_at != null,
  };
}
