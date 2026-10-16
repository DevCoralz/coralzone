// Server-only proxy to the CoralzOne storage service.
// STORAGE_SERVICE_URL and STORAGE_SERVICE_KEY are read inside handlers only —
// they are never sent to the browser, and no response ever echoes them.
// When the variables are not configured yet, every call reports
// { configured: false } so the UI can fall back to demo state.
import { createServerFn } from "@tanstack/react-start";

function storageBase(): string {
  return (process.env.STORAGE_SERVICE_URL ?? "").trim().replace(/\/+$/, "");
}

function storageKey(): string {
  return (process.env.STORAGE_SERVICE_KEY ?? "").trim();
}

type StorageResult<T> = {
  configured: boolean;
  ok: boolean;
  status: number;
  data: T | null;
};

async function storageFetch<T>(path: string, init?: RequestInit): Promise<StorageResult<T>> {
  const base = storageBase();
  if (!base) return { configured: false, ok: false, status: 0, data: null };
  const key = storageKey();
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...(key ? { Authorization: `Bearer ${key}`, "X-API-Key": key } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) return { configured: true, ok: false, status: response.status, data: null };
    const text = await response.text();
    let data: T | null = null;
    try {
      data = (text ? JSON.parse(text) : null) as T;
    } catch {
      data = text as unknown as T;
    }
    return { configured: true, ok: true, status: response.status, data };
  } catch {
    return { configured: true, ok: false, status: 0, data: null };
  }
}

function pickArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  if (value && typeof value === "object") {
    for (const key of ["files", "items", "data", "results"]) {
      const nested = (value as Record<string, unknown>)[key];
      if (Array.isArray(nested)) return nested as Array<Record<string, unknown>>;
    }
  }
  return [];
}

export interface StorageFile {
  key: string;
  size: number;
  updatedAt: string;
}

export const getStorageStatus = createServerFn({ method: "GET" }).handler(async (): Promise<{ configured: boolean; online: boolean; detail: string }> => {
  if (!storageBase()) return { configured: false, online: false, detail: "not_configured" };
  const result = await storageFetch<unknown>("/health");
  return { configured: true, online: result.ok, detail: result.ok ? "online" : `unreachable_${result.status || "network"}` };
});

export const listStorageFiles = createServerFn({ method: "GET" }).handler(async (): Promise<{ configured: boolean; files: StorageFile[] }> => {
  const result = await storageFetch<unknown>("/files?limit=50");
  const rows = pickArray(result.data).map(row => ({
    key: String(row.key ?? row.name ?? row.id ?? "file"),
    size: Number(row.size ?? row.bytes ?? 0),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? row.modified ?? ""),
  }));
  return { configured: result.configured && result.ok, files: rows };
});

export interface StorageUsage {
  configured: boolean;
  bytesUsed: number;
  bytesQuota: number;
  requests: number;
}

export const getStorageUsage = createServerFn({ method: "GET" }).handler(async (): Promise<StorageUsage> => {
  const result = await storageFetch<Record<string, unknown>>("/usage");
  const data = (result.data && typeof result.data === "object" ? result.data : {}) as Record<string, unknown>;
  const bytesUsed = Number(data.bytesUsed ?? data.bytes_used ?? data.used ?? data.storageUsed ?? 0);
  const bytesQuota = Number(data.bytesQuota ?? data.bytes_quota ?? data.quota ?? data.storageQuota ?? 0);
  const requests = Number(data.requests ?? data.requestCount ?? data.request_count ?? 0);
  return { configured: result.configured && result.ok, bytesUsed, bytesQuota, requests };
});

export const deleteStorageFile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (typeof input !== "string" || !input.trim()) throw new Error("A file key is required");
    return input.trim();
  })
  .handler(async ({ data }): Promise<{ configured: boolean; ok: boolean }> => {
    const result = await storageFetch<unknown>(`/files/${encodeURIComponent(data)}`, { method: "DELETE" });
    return { configured: result.configured, ok: result.ok };
  });

export const uploadStorageFile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const value = (input ?? {}) as { name?: unknown; contentType?: unknown; dataBase64?: unknown };
    if (typeof value.name !== "string" || !value.name.trim() || typeof value.dataBase64 !== "string") {
      throw new Error("A file name and contents are required");
    }
    return {
      name: value.name.trim(),
      contentType: typeof value.contentType === "string" ? value.contentType : "application/octet-stream",
      dataBase64: value.dataBase64,
    };
  })
  .handler(async ({ data }): Promise<{ configured: boolean; ok: boolean }> => {
    const result = await storageFetch<unknown>("/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: data.name, contentType: data.contentType, content: data.dataBase64 }),
    });
    return { configured: result.configured, ok: result.ok };
  });
