// Server-only helpers for bucket server functions: talking to the gateway (the
// bucket list, which CoralzOne owns) and to the storage service (what is in
// each bucket). Import ONLY from createServerFn handlers or other .server.ts files.
import { callGateway } from "./storage-settings.server";
import { STORAGE_PREFIX, storageFetch } from "./storage-service.server";
import { parseEntitlement } from "./storage-quota";
import type { Bucket, BucketUsage, RawAdminBucket } from "./storage-buckets";

export interface GatewayReply {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}

// Never throws: an unreachable gateway is just { ok: false, status: 0 }.
export async function gateway(path: string, init?: RequestInit & { json?: unknown }): Promise<GatewayReply> {
  try {
    const { json, ...rest } = init ?? {};
    const response = await callGateway(path, json === undefined ? rest : {
      ...rest,
      headers: { ...(rest.headers ?? {}), "content-type": "application/json" },
      body: JSON.stringify(json),
    });
    let body: Record<string, unknown> = {};
    try {
      const parsed = await response.json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    } catch {
      /* empty or non-JSON body */
    }
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    console.error("[buckets] gateway call failed:", error);
    return { ok: false, status: 0, body: {} };
  }
}

export const UNREACHABLE = "Could not reach the server. Please try again.";

// The gateway's own message when it sent one (they are written for people).
export function errorOf(reply: GatewayReply, fallback = UNREACHABLE): string {
  return typeof reply.body.error === "string" && reply.body.error ? reply.body.error.slice(0, 200) : fallback;
}

export function parseBucket(value: unknown): Bucket | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || typeof v.name !== "string") return null;
  return { id: v.id, name: v.name, frozen: v.frozen === true, createdAt: typeof v.createdAt === "string" ? v.createdAt : null };
}

export function parseRawAdminBucket(value: unknown): RawAdminBucket | null {
  const bucket = parseBucket(value);
  const v = value as Record<string, unknown>;
  const owner = v?.owner as Record<string, unknown> | undefined;
  const entitlement = parseEntitlement(v?.entitlement);
  if (!bucket || !owner || typeof owner.id !== "string" || typeof owner.email !== "string" || !entitlement) return null;
  return { ...bucket, owner: { id: owner.id, email: owner.email, name: typeof owner.name === "string" ? owner.name : "" }, entitlement };
}

export interface UsageMaps {
  buckets: Map<string, BucketUsage>;
  owners: Map<string, number>;
}

// One storage-service call per 500 ids. null = the service could not be
// reached, so callers show "unavailable" instead of pretending the bucket is empty.
export async function fetchUsage(bucketIds: string[], ownerIds: string[]): Promise<UsageMaps | null> {
  const out: UsageMaps = { buckets: new Map(), owners: new Map() };
  const uniqueBuckets = [...new Set(bucketIds)];
  const uniqueOwners = [...new Set(ownerIds)];
  const calls = Math.max(1, Math.ceil(Math.max(uniqueBuckets.length, uniqueOwners.length) / 500));
  if (uniqueBuckets.length === 0 && uniqueOwners.length === 0) return out;
  for (let i = 0; i < calls; i++) {
    const result = await storageFetch<{ buckets?: Array<Record<string, unknown>>; owners?: Array<Record<string, unknown>> }>(`${STORAGE_PREFIX}/buckets/usage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bucket_ids: uniqueBuckets.slice(i * 500, (i + 1) * 500), owner_ids: uniqueOwners.slice(i * 500, (i + 1) * 500) }),
    });
    if (!result.ok || !result.data) return null;
    for (const row of result.data.buckets ?? []) out.buckets.set(String(row.bucketId), { files: Number(row.files ?? 0), bytes: Number(row.bytes ?? 0) });
    for (const row of result.data.owners ?? []) out.owners.set(String(row.ownerId), Number(row.bytes ?? 0));
  }
  return out;
}

// The user's own bucket, if it exists and uploads into it are allowed.
export async function loadUsableBucket(bucketId: string): Promise<{ ok: true; bucket: Bucket } | { ok: false; error: string }> {
  const reply = await gateway(`/api/cloud/buckets?id=${encodeURIComponent(bucketId)}`);
  if (reply.status === 404) return { ok: false, error: "That bucket no longer exists. Pick another one." };
  const bucket = reply.ok ? parseBucket(reply.body.bucket) : null;
  if (!bucket) return { ok: false, error: UNREACHABLE };
  if (bucket.frozen) return { ok: false, error: "This bucket is frozen, so uploads to it are paused. Contact support." };
  return { ok: true, bucket };
}
