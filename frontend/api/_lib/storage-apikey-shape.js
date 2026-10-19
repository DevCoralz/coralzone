// How a storage_api_keys row is shown. Pure, so every query that lists keys
// (the owner's list, the admin list, a user's overview) shapes them the same
// way. The key hash is never selected by any of these queries.
const iso = (value) => (value ? new Date(value).toISOString() : null);

// Columns every key list needs. Join storage_buckets as `b` to get bucket_name.
export const KEY_COLUMNS = `k.id, k.user_id, k.bucket_id, k.name, k.key_prefix, k.last_used_at, k.request_count,
  k.revoked_at, k.created_at, k.rate_limit_per_minute, b.name AS bucket_name`;

export function toApiKey(row) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.key_prefix,
    bucketId: row.bucket_id ?? null,
    bucketName: row.bucket_name ?? null,
    createdAt: iso(row.created_at),
    lastUsedAt: iso(row.last_used_at),
    requests: Number(row.request_count ?? 0),
    revoked: row.revoked_at != null,
    revokedAt: iso(row.revoked_at),
    rateLimitPerMinute: row.rate_limit_per_minute == null ? null : Number(row.rate_limit_per_minute),
  };
}
