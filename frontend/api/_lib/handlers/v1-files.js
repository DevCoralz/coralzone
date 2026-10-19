// GET /api/v1/files?limit=&offset=&bucket_id=  (X-API-Key). Lists the key
// owner's files, newest first. A key limited to one bucket only ever sees that
// bucket. The owner id always comes from the key, never from the request.
import { sendJson, methodNotAllowed } from "../http.js";
import { authenticateApiKey } from "../api-key-auth-core.js";
import { parseV1FilesQuery, toPublicFile } from "../storage-apikey-schema.js";
import { getUserBucket } from "../storage-bucket-core.js";
import { storageGet } from "../storage-service.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error }, auth.headers);
  const { principal } = auth;

  const url = new URL(req.url, "http://localhost");
  const query = parseV1FilesQuery(url.searchParams);
  if (!query.ok) return sendJson(res, 400, { error: query.error }, auth.headers);

  // A bucket limited key is held to its bucket. An unlimited key may ask for
  // one of its owner's buckets, and anything else looks like a missing bucket.
  let bucketId = principal.bucketId;
  if (!bucketId && query.bucketId) {
    if (!(await getUserBucket(principal.userId, query.bucketId))) return sendJson(res, 404, { error: "Bucket not found." }, auth.headers);
    bucketId = query.bucketId;
  }

  const params = new URLSearchParams({ limit: String(query.limit), offset: String(query.offset), owner_id: principal.userId });
  if (bucketId) params.set("bucket_id", bucketId);
  const listing = await storageGet(`/api/v1/storage/files?${params.toString()}`);
  if (!listing || !Array.isArray(listing.files)) return sendJson(res, 503, { error: "Storage is unavailable right now. Try again shortly." }, auth.headers);

  return sendJson(res, 200, {
    files: listing.files.map(toPublicFile),
    limit: query.limit,
    offset: query.offset,
    bucketId,
  }, { ...auth.headers, "Cache-Control": "no-store" });
}
