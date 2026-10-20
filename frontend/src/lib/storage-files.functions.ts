// Server functions for the admin Files and abuse pages.
//
// Reads (search, one file, counts per type) go straight to the storage
// service, because that is where the files are. The owner's email comes from
// the gateway (the user database). Changes go through the gateway, which
// checks the caller is an admin and writes the admin log. Blocking a file
// type is a normal setting, saved through the settings route.
//
// Every function calls requireAdmin() first, because each one has its own HTTP
// endpoint and the page guard alone would not protect it.
import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "./admin.functions";
import { STORAGE_PREFIX, storageFetch } from "./storage-service.server";
import { gateway, errorOf } from "./storage-buckets.server";
import { loadEffectiveSettings } from "./storage-settings.server";
import { MIME_TYPE_RE, resolveStorageSettings } from "./storage-settings";
import {
  ADMIN_FILE_PAGE_SIZE, FLAG_REASON_MAX, attachOwners, blockableTypes, blockedListProblem, isFlagFilter, isSizeFilter, isSortId, minBytesFor,
  ownerIdsOf, parseAdminFile, parseAdminFiles, parseOwners, parseTypeCounts,
  type AdminFile, type AdminFileRow, type BlockableType, type FileOwner,
} from "./storage-files";

const UUID_LIKE = /^[0-9a-f-]{36}$/i;
const STORAGE_DOWN = "The storage service could not be reached.";

function cleanFileId(input: unknown): string {
  if (typeof input !== "string" || !UUID_LIKE.test(input.trim())) throw new Error("A file id is required");
  return input.trim().toLowerCase();
}

// Who owns these files. If the lookup fails the rows still show; they just
// have no email next to them.
async function loadOwners(files: AdminFile[]): Promise<FileOwner[]> {
  const ids = ownerIdsOf(files);
  if (ids.length === 0) return [];
  const reply = await gateway(`/api/admin/cloud-files?owners=${encodeURIComponent(ids.join(","))}`);
  return reply.ok ? parseOwners(reply.body.owners) : [];
}

// ─── Search ──────────────────────────────────────────────────────────────────

export type AdminFileList =
  | { ok: true; rows: AdminFileRow[]; total: number; page: number; pageSize: number }
  | { ok: false; error: string };

export const adminSearchFiles = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const mime = typeof v.mimeType === "string" ? v.mimeType.toLowerCase() : "all";
    return {
      q: typeof v.q === "string" ? v.q.slice(0, 100) : "",
      mimeType: mime !== "all" && MIME_TYPE_RE.test(mime) ? mime : "all",
      size: isSizeFilter(v.size) ? v.size : "any",
      flagged: isFlagFilter(v.flagged) ? v.flagged : "all",
      sort: isSortId(v.sort) ? v.sort : "newest",
      page: typeof v.page === "number" && Number.isInteger(v.page) && v.page >= 1 && v.page <= 100_000 ? v.page : 1,
    };
  })
  .handler(async ({ data }): Promise<AdminFileList> => {
    await requireAdmin();
    const params = new URLSearchParams({ sort: data.sort, limit: String(ADMIN_FILE_PAGE_SIZE), offset: String((data.page - 1) * ADMIN_FILE_PAGE_SIZE) });
    if (data.q.trim()) params.set("q", data.q.trim());
    if (data.mimeType !== "all") params.set("mime_type", data.mimeType);
    const floor = minBytesFor(data.size);
    if (floor !== null) params.set("min_size", String(floor));
    if (data.flagged === "flagged") params.set("flagged", "true");

    const result = await storageFetch<{ files?: unknown; total?: unknown }>(`${STORAGE_PREFIX}/admin/files?${params.toString()}`);
    if (!result.ok || !result.data) return { ok: false, error: result.configured ? result.detail ?? STORAGE_DOWN : "Cloud storage is not set up on this server." };
    const files = parseAdminFiles(result.data.files);
    return {
      ok: true,
      rows: attachOwners(files, await loadOwners(files)),
      total: typeof result.data.total === "number" ? result.data.total : files.length,
      page: data.page,
      pageSize: ADMIN_FILE_PAGE_SIZE,
    };
  });

// ─── One file ────────────────────────────────────────────────────────────────

export type AdminFileResult =
  | { ok: true; file: AdminFileRow; typeBlocked: boolean; blockedTypes: string[] }
  | { ok: false; error: string; notFound?: boolean };

export const adminGetFile = createServerFn({ method: "POST" })
  .inputValidator(cleanFileId)
  .handler(async ({ data }): Promise<AdminFileResult> => {
    await requireAdmin();
    const [result, settings] = await Promise.all([
      storageFetch<Record<string, unknown>>(`${STORAGE_PREFIX}/admin/files/${encodeURIComponent(data)}`),
      loadEffectiveSettings(),
    ]);
    if (result.status === 404) return { ok: false, error: "File not found.", notFound: true };
    const file = result.ok ? parseAdminFile(result.data) : null;
    if (!file) return { ok: false, error: result.configured ? STORAGE_DOWN : "Cloud storage is not set up on this server." };
    const [row] = attachOwners([file], await loadOwners([file]));
    return { ok: true, file: row, typeBlocked: settings.blockedMimeTypes.includes(file.mimeType), blockedTypes: settings.blockedMimeTypes };
  });

// ─── Actions on a file ───────────────────────────────────────────────────────

// audited is false only when the file change worked but the log entry could
// not be saved; the page says so.
export type FileActionResult = { ok: true; audited: boolean } | { ok: false; error: string };

export const adminFileAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Send a file and an action.");
    const { id, action, reason } = input as { id?: unknown; action?: unknown; reason?: unknown };
    if (action !== "delete" && action !== "flag" && action !== "unflag") throw new Error("Unknown action.");
    return { id: cleanFileId(id), action, reason: typeof reason === "string" ? reason.slice(0, FLAG_REASON_MAX) : null };
  })
  .handler(async ({ data }): Promise<FileActionResult> => {
    await requireAdmin();
    const reply = await gateway("/api/admin/cloud-files", {
      method: "PUT",
      json: data.action === "flag" ? { action: "flag", id: data.id, reason: data.reason } : { action: data.action, id: data.id },
    });
    return reply.ok ? { ok: true, audited: reply.body.audited !== false } : { ok: false, error: errorOf(reply) };
  });

// ─── Blocked types ───────────────────────────────────────────────────────────

export type AdminBlockedTypes =
  | { ok: true; types: BlockableType[]; blocked: string[]; countsAvailable: boolean }
  | { ok: false; error: string };

export const adminGetBlockedTypes = createServerFn({ method: "GET" }).handler(async (): Promise<AdminBlockedTypes> => {
  await requireAdmin();
  const [settings, summary] = await Promise.all([
    loadEffectiveSettings(),
    storageFetch<{ types?: unknown }>(`${STORAGE_PREFIX}/admin/files/types`),
  ]);
  const counts = summary.ok && summary.data ? parseTypeCounts(summary.data.types) : [];
  return { ok: true, types: blockableTypes(counts, settings.blockedMimeTypes), blocked: settings.blockedMimeTypes, countsAvailable: summary.ok };
});

// Saves the whole list. It is a setting, so it is validated by the gateway
// again, applied within seconds on every server instance, and written to the
// admin log like any other settings change.
export const adminSetBlockedTypes = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (!Array.isArray(input) || !input.every(item => typeof item === "string")) throw new Error("Send a list of MIME types.");
    const problem = blockedListProblem(input as string[]);
    if (problem) throw new Error(problem);
    return input as string[];
  })
  .handler(async ({ data }): Promise<{ ok: true; blocked: string[] } | { ok: false; error: string }> => {
    await requireAdmin();
    const reply = await gateway("/api/admin/cloud-settings", { method: "PUT", json: { blockedMimeTypes: data } });
    if (!reply.ok) return { ok: false, error: errorOf(reply) };
    return { ok: true, blocked: resolveStorageSettings(reply.body.overrides).blockedMimeTypes };
  });
