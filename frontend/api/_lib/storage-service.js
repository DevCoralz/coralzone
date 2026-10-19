// A small read only client for the storage service, for gateway handlers that
// answer public API calls. It never throws and never returns the service's own
// error text: the caller just gets the data, or null.
//
// The service key stays in the server's environment. It is never put in a
// response, a log line or an error.
const TIMEOUT_MS = 8_000;

export function storageConfigured() {
  return (process.env.STORAGE_SERVICE_URL ?? "").trim().length > 0;
}

export async function storageGet(path) {
  const base = (process.env.STORAGE_SERVICE_URL ?? "").trim().replace(/\/+$/, "");
  if (!base) return null;
  const key = (process.env.STORAGE_SERVICE_KEY ?? "").trim();
  try {
    const response = await fetch(`${base}${path}`, {
      headers: key ? { "X-Service-Key": key } : {},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
