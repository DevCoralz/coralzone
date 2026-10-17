// Sends one file to the storage service in chunks, straight from the browser.
// Why: Vercel refuses request bodies over about 4.5 MB, so big files cannot go
// through our own server. The server function startMyUpload (storage.functions.ts)
// checks the user and hands back a session; this file does the actual sending.
//
// No imports on purpose. It only needs fetch, XMLHttpRequest and crypto, which
// keeps it easy to test with fakes (see chunked-upload.test.ts).

export interface UploadSession {
  id: string;
  // One time pass for this upload only. Never the service key.
  token: string;
  // Exact size of every chunk except the last, decided by the storage service.
  chunkSize: number;
  // Full URL of this upload on the storage service, e.g. https://host/api/v1/storage/uploads/<id>
  endpoint: string;
}

export interface StoredFile {
  id: string;
  url: string;
  kind: string;
  mimeType: string;
  size: number;
}

export type UploadPhase = 'uploading' | 'processing';

export interface UploadProgress {
  percent: number;
  phase: UploadPhase;
}

// What the finish step (a server function) reports back.
export interface FinishResult {
  ok: boolean;
  error?: string;
  // True when trying again could work (for example the plan check hiccuped).
  retry?: boolean;
}

export interface ChunkReply {
  status: number;
  body: Record<string, unknown> | null;
}

export type ChunkTransport = (request: {
  url: string;
  headers: Record<string, string>;
  body: Blob;
  signal?: AbortSignal;
  onBytes: (sent: number) => void;
}) => Promise<ChunkReply>;

export interface ChunkedUploadOptions {
  file: Blob;
  session: UploadSession;
  // Called once every byte is uploaded. CoralzOne checks the user is still
  // allowed to upload, then tells the storage service to finish.
  finish: () => Promise<FinishResult>;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
  // The next three exist so tests can swap them for fakes.
  fetchImpl?: typeof fetch;
  transport?: ChunkTransport;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export class UploadError extends Error {
  readonly cancelled: boolean;
  constructor(message: string, cancelled = false) {
    super(message);
    this.name = 'UploadError';
    this.cancelled = cancelled;
  }
}

const MAX_TRIES_PER_CHUNK = 6;
const MAX_FINISH_TRIES = 3;
// Telegram can take a while with a 4 GB file, so be patient before giving up.
const MAX_PROCESSING_MS = 3 * 60 * 60 * 1000;

// Answers that will never get better by trying again.
const FATAL_STATUSES = new Set([400, 401, 403, 404, 410, 413]);

export function backoffMs(attempt: number): number {
  const base = Math.min(10_000, 800 * 2 ** attempt);
  // A little jitter so many browsers do not retry in lockstep.
  return base / 2 + Math.random() * (base / 2);
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new UploadError('Upload cancelled', true));
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new UploadError('Upload cancelled', true));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// The storage service can check this to catch a chunk damaged on the way.
// Needs a secure page (https or localhost); without it we simply skip the check.
export async function sha256Hex(blob: Blob): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return undefined;
  const digest = await subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

// Default transport: XMLHttpRequest, because fetch cannot report upload progress
// and a slow phone connection needs a moving bar, not one jump per chunk.
export const xhrTransport: ChunkTransport = ({ url, headers, body, signal, onBytes }) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = event => onBytes(event.loaded);
    xhr.onload = () => {
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(xhr.responseText) as Record<string, unknown>;
      } catch {
        /* the body was not JSON */
      }
      resolve({ status: xhr.status, body: parsed });
    };
    xhr.onerror = () => reject(new Error('network error'));
    xhr.ontimeout = () => reject(new Error('network timeout'));
    const onAbort = () => {
      xhr.abort();
      reject(new UploadError('Upload cancelled', true));
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    xhr.send(body);
  });

interface ServerState {
  status: string;
  received: number;
  size: number;
  file?: StoredFile;
  error?: string;
}

function readState(raw: unknown): ServerState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.status !== 'string' || typeof r.received !== 'number' || typeof r.size !== 'number') return null;
  let file: StoredFile | undefined;
  const f = r.file as Record<string, unknown> | undefined;
  if (f && typeof f.id === 'string') {
    file = { id: f.id, url: String(f.url ?? ''), kind: String(f.kind ?? ''), mimeType: String(f.mimeType ?? ''), size: Number(f.size ?? 0) };
  }
  return { status: r.status, received: r.received, size: r.size, file, error: typeof r.error === 'string' ? r.error : undefined };
}

function detailOf(body: Record<string, unknown> | null, fallback: string): string {
  return body && typeof body.detail === 'string' && body.detail ? body.detail.slice(0, 200) : fallback;
}

// Runs the whole upload. Resolves with the stored file, or throws UploadError
// with a message that is safe to show the user.
export async function runChunkedUpload(options: ChunkedUploadOptions): Promise<StoredFile> {
  const { file, session, finish, onProgress, signal } = options;
  const doFetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const send = options.transport ?? xhrTransport;
  const sleep = options.sleep ?? defaultSleep;
  const size = file.size;
  const authHeader = { 'X-Upload-Token': session.token };

  const report = (sent: number) => onProgress?.({ percent: Math.min(100, Math.floor((sent / size) * 100)), phase: 'uploading' });

  // Ask the storage service where it has got to. This is the one source of truth.
  async function fetchState(): Promise<ServerState> {
    let lastProblem = 'We could not reach the storage service.';
    for (let attempt = 0; attempt < MAX_TRIES_PER_CHUNK; attempt++) {
      if (signal?.aborted) throw new UploadError('Upload cancelled', true);
      try {
        const response = await doFetch(session.endpoint, { headers: authHeader, signal, cache: 'no-store' });
        if (response.status === 404 || response.status === 410) {
          throw new UploadError('This upload expired. Please start it again.');
        }
        if (response.ok) {
          const state = readState(await response.json());
          if (state) return state;
        }
      } catch (error) {
        if (error instanceof UploadError) throw error;
        if (signal?.aborted) throw new UploadError('Upload cancelled', true);
        lastProblem = 'We could not reach the storage service.';
      }
      await sleep(backoffMs(attempt), signal);
    }
    throw new UploadError(lastProblem);
  }

  // 1. Send the chunks, in order.
  let received = (await fetchState()).received;
  report(received);
  let stalls = 0;
  while (received < size) {
    if (signal?.aborted) throw new UploadError('Upload cancelled', true);
    const start = received;
    const end = Math.min(start + session.chunkSize, size);
    const piece = file.slice(start, end);
    const checksum = await sha256Hex(piece);

    for (let attempt = 0; attempt < MAX_TRIES_PER_CHUNK && received === start; attempt++) {
      try {
        const reply = await send({
          url: `${session.endpoint}/chunk`,
          headers: {
            ...authHeader,
            'X-Chunk-Offset': String(start),
            ...(checksum ? { 'X-Chunk-Sha256': checksum } : {}),
            'Content-Type': 'application/octet-stream',
          },
          body: piece,
          signal,
          onBytes: sent => report(start + sent),
        });
        const confirmed = reply.body?.received;
        if (reply.status >= 200 && reply.status < 300 && typeof confirmed === 'number') {
          received = confirmed;
        } else if (reply.status === 409) {
          // Out of step with the server. If it says where it is, go there.
          if (typeof confirmed === 'number') {
            received = confirmed;
          } else {
            await sleep(backoffMs(attempt), signal);
            received = (await fetchState()).received;
          }
        } else if (FATAL_STATUSES.has(reply.status)) {
          throw new UploadError(detailOf(reply.body, 'The upload was refused.'));
        } else {
          // 422 (damaged on the way), 429, 5xx: wait, then send the same chunk again.
          await sleep(backoffMs(attempt), signal);
        }
      } catch (error) {
        if (error instanceof UploadError) throw error;
        if (signal?.aborted) throw new UploadError('Upload cancelled', true);
        // The connection dropped. The chunk may or may not have landed, so ask.
        await sleep(backoffMs(attempt), signal);
        received = (await fetchState()).received;
      }
    }
    report(received);
    if (received === start) throw new UploadError('The connection kept dropping. Check your internet and try again.');
    // A server that keeps pointing us backwards would loop forever, so stop it.
    stalls = received < start ? stalls + 1 : 0;
    if (stalls >= MAX_TRIES_PER_CHUNK) throw new UploadError('The upload got out of step with the server. Please try again.');
  }

  // 2. Let CoralzOne check the user is still allowed, then start processing.
  onProgress?.({ percent: 100, phase: 'processing' });
  for (let attempt = 1; ; attempt++) {
    const result = await finish();
    if (result.ok) break;
    if (!result.retry || attempt >= MAX_FINISH_TRIES) throw new UploadError(result.error || 'Could not finish the upload.');
    await sleep(backoffMs(attempt), signal);
  }

  // 3. Wait for the storage service to verify the file and store it.
  const deadline = Date.now() + MAX_PROCESSING_MS;
  let notStarted = 0;
  for (let tick = 0; Date.now() < deadline; tick++) {
    const state = await fetchState();
    if (state.status === 'done' && state.file) return state.file;
    if (state.status === 'failed') throw new UploadError(state.error || 'The upload failed.');
    // Still "uploading" after we asked it to finish means it never started.
    notStarted = state.status === 'uploading' ? notStarted + 1 : 0;
    if (notStarted >= 10) throw new UploadError('The upload did not start processing. Please try again.');
    await sleep(Math.min(5000, 1200 + tick * 400), signal);
  }
  throw new UploadError('Processing is taking longer than expected. Check your files in a few minutes.');
}

// Tell the storage service to throw away a half sent upload. Best effort:
// if it fails, the service cleans the session up by itself after a while.
export async function cancelUpload(session: UploadSession, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): Promise<void> {
  try {
    await fetchImpl(session.endpoint, { method: 'DELETE', headers: { 'X-Upload-Token': session.token } });
  } catch {
    /* nothing more to do */
  }
}
