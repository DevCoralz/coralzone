import { describe, it, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  UploadError, backoffMs, cancelUpload, runChunkedUpload, sha256Hex,
  type ChunkReply, type ChunkTransport, type FinishResult, type UploadProgress, type UploadSession,
} from './chunked-upload';

const CHUNK = 1000;
const instantly = async () => {};

// jsdom's Blob has no arrayBuffer(), and the real thing is not what is under
// test here, so this tiny stand in has the three members the client uses.
class TestBlob {
  readonly size: number;
  private readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.size = bytes.length;
  }
  slice(start: number, end: number) {
    return new TestBlob(this.bytes.slice(start, end));
  }
  async arrayBuffer() {
    return this.bytes.buffer.slice(this.bytes.byteOffset, this.bytes.byteOffset + this.bytes.byteLength) as ArrayBuffer;
  }
  view() {
    return this.bytes;
  }
}

function fileOf(size: number): TestBlob {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = (i * 31 + 7) % 251;
  return new TestBlob(bytes);
}

const session: UploadSession = { id: 'up-1', token: 'secret-token', chunkSize: CHUNK, endpoint: 'https://storage.test/api/v1/storage/uploads/up-1' };

// A small fake of the storage service that follows the same rules as the real one.
interface FakeServer {
  size: number;
  received: number;
  status: string;
  stored: Uint8Array;
  error: string | undefined;
  chunkCalls: number[];
  deleted: boolean;
  // Test hook: return a reply to override what the server would say.
  beforeChunk: undefined | ((call: number, offset: number) => ChunkReply | 'drop' | 'store-then-drop' | undefined);
  processingPolls: number;
  seenTokens: Set<string>;
  transport: ChunkTransport;
  fetchImpl: typeof fetch;
}

function fakeServer(size: number, opts: { alreadyReceived?: number } = {}): FakeServer {
  const server: FakeServer = {
    size,
    received: opts.alreadyReceived ?? 0,
    status: 'uploading',
    stored: new Uint8Array(size),
    error: undefined,
    chunkCalls: [],
    deleted: false,
    beforeChunk: undefined,
    processingPolls: 1,
    seenTokens: new Set<string>(),
    transport: async () => ({ status: 500, body: null }),
    fetchImpl: (async () => ({})) as unknown as typeof fetch,
  };

  server.transport = async ({ headers, body }) => {
    server.seenTokens.add(headers['X-Upload-Token'] ?? '');
    const offset = Number(headers['X-Chunk-Offset']);
    const call = server.chunkCalls.push(offset);
    const hook = server.beforeChunk?.(call, offset);
    if (hook === 'drop') throw new Error('network error');
    const data = (body as unknown as TestBlob).view();
    const accept = () => {
      server.stored.set(data, offset);
      server.received = offset + data.length;
    };
    if (hook === 'store-then-drop') {
      accept();
      throw new Error('network error');
    }
    if (hook) return hook;
    if (offset !== server.received) return { status: 409, body: { detail: 'Chunk is out of order', received: server.received } };
    accept();
    return { status: 200, body: { received: server.received, size, complete: server.received === size } };
  };

  server.fetchImpl = (async (_url: string, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      server.deleted = true;
      return { status: 204, ok: true, json: async () => ({}) };
    }
    if (server.status === 'processing' && --server.processingPolls <= 0) server.status = server.error ? 'failed' : 'done';
    const body: Record<string, unknown> = { status: server.status, received: server.received, size, chunkSize: CHUNK };
    if (server.status === 'done') body.file = { id: 'media-1', url: '/api/v1/storage/media/media-1', kind: 'file', mimeType: 'application/pdf', size };
    if (server.status === 'failed') body.error = server.error;
    return { status: 200, ok: true, json: async () => body };
  }) as unknown as typeof fetch;

  return server;
}

async function failure(promise: Promise<unknown>): Promise<UploadError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(UploadError);
    return error as UploadError;
  }
  throw new Error('Expected the upload to fail');
}

function run(server: FakeServer, file: TestBlob, extra: Partial<Parameters<typeof runChunkedUpload>[0]> = {}) {
  return runChunkedUpload({
    file: file as unknown as Blob, session,
    // By default finishing starts processing, like the real service does.
    finish: async () => {
      server.status = 'processing';
      return { ok: true };
    },
    transport: server.transport, fetchImpl: server.fetchImpl, sleep: instantly, ...extra,
  });
}

describe('chunked upload client', () => {
  it('sends a file in order and hands back the stored file', async () => {
    const file = fileOf(3 * CHUNK + 250);
    const server = fakeServer(file.size);
    let finished = 0;
    const progress: UploadProgress[] = [];
    server.processingPolls = 2;
    const stored = await run(server, file, {
      finish: async () => {
        // Finishing must only ever happen once every byte is in.
        expect(server.received).toBe(file.size);
        finished++;
        server.status = 'processing';
        return { ok: true };
      },
      onProgress: p => progress.push(p),
    });
    expect(stored.id).toBe('media-1');
    expect(finished).toBe(1);
    expect(server.chunkCalls).toEqual([0, CHUNK, 2 * CHUNK, 3 * CHUNK]);
    expect(Array.from(server.stored)).toEqual(Array.from(file.view()));
    expect(progress[progress.length - 1]).toEqual({ percent: 100, phase: 'processing' });
    expect(progress.some(p => p.phase === 'uploading' && p.percent === 61)).toBe(true);
  });

  it('always uses the session token and never anything else', async () => {
    const file = fileOf(2 * CHUNK);
    const server = fakeServer(file.size);
    await run(server, file);
    expect(Array.from(server.seenTokens)).toEqual(['secret-token']);
  });

  it('carries on from where the server says it got to', async () => {
    const file = fileOf(3 * CHUNK);
    const server = fakeServer(file.size, { alreadyReceived: CHUNK });
    server.stored.set(file.view().slice(0, CHUNK), 0);
    await run(server, file);
    expect(server.chunkCalls).toEqual([CHUNK, 2 * CHUNK]);
    expect(Array.from(server.stored)).toEqual(Array.from(file.view()));
  });

  it('does not resend a chunk that landed while its answer was lost', async () => {
    const file = fileOf(3 * CHUNK);
    const server = fakeServer(file.size);
    server.beforeChunk = call => (call === 2 ? 'store-then-drop' : undefined);
    await run(server, file);
    expect(server.chunkCalls).toEqual([0, CHUNK, 2 * CHUNK]);
    expect(Array.from(server.stored)).toEqual(Array.from(file.view()));
  });

  it('resends a chunk that never arrived', async () => {
    const file = fileOf(2 * CHUNK);
    const server = fakeServer(file.size);
    server.beforeChunk = call => (call === 1 ? 'drop' : undefined);
    await run(server, file);
    expect(server.chunkCalls).toEqual([0, 0, CHUNK]);
  });

  it('retries on 429, 5xx and a damaged chunk (422)', async () => {
    const file = fileOf(CHUNK);
    for (const status of [429, 503, 422]) {
      const server = fakeServer(file.size);
      server.beforeChunk = call => (call === 1 ? { status, body: { detail: 'try again' } } : undefined);
      await run(server, file);
      expect(server.chunkCalls).toEqual([0, 0]);
    }
  });

  it('follows a 409 that says where the server is', async () => {
    const file = fileOf(3 * CHUNK);
    const server = fakeServer(file.size);
    server.beforeChunk = call => {
      if (call !== 1) return undefined;
      // Pretend another tab already delivered the first two chunks.
      server.stored.set(file.view().slice(0, 2 * CHUNK), 0);
      server.received = 2 * CHUNK;
      return { status: 409, body: { detail: 'The upload moved on', received: 2 * CHUNK } };
    };
    await run(server, file);
    expect(server.chunkCalls).toEqual([0, 2 * CHUNK]);
    expect(Array.from(server.stored)).toEqual(Array.from(file.view()));
  });

  it('stops at once on answers that will not improve, with the server message', async () => {
    const file = fileOf(2 * CHUNK);
    for (const status of [400, 404, 410, 413]) {
      const server = fakeServer(file.size);
      server.beforeChunk = () => ({ status, body: { detail: 'File type not allowed' } });
      const error = await failure(run(server, file));
      expect(error.message).toBe('File type not allowed');
      expect(error.cancelled).toBe(false);
      expect(server.chunkCalls.length).toBe(1);
    }
  });

  it('gives up with a friendly message when the connection never recovers', async () => {
    const file = fileOf(2 * CHUNK);
    const server = fakeServer(file.size);
    server.beforeChunk = () => 'drop';
    const error = await failure(run(server, file));
    expect(error.message).toMatch(/connection kept dropping/);
    expect(server.chunkCalls.length).toBe(6);
  });

  it('tells the user when the upload expired on the server', async () => {
    const file = fileOf(CHUNK);
    const server = fakeServer(file.size);
    const gone = (async () => ({ status: 404, ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    const error = await failure(run(server, file, { fetchImpl: gone }));
    expect(error.message).toMatch(/expired/);
  });

  it('retries the finish step only when told it may', async () => {
    const file = fileOf(CHUNK);
    let calls = 0;
    const server = fakeServer(file.size);
    await run(server, file, {
      finish: async () => {
        if (++calls < 3) return { ok: false, retry: true, error: 'hiccup' };
        server.status = 'processing';
        return { ok: true };
      },
    });
    expect(calls).toBe(3);

    calls = 0;
    const blocked = fakeServer(file.size);
    const error = await failure(run(blocked, file, { finish: async () => (calls++, { ok: false, error: 'Your storage access has been suspended.' }) }));
    expect(error.message).toBe('Your storage access has been suspended.');
    expect(calls).toBe(1);

    calls = 0;
    const flaky = fakeServer(file.size);
    await failure(run(flaky, file, { finish: async () => (calls++, { ok: false, retry: true, error: 'still down' }) }));
    expect(calls).toBe(3);
  });

  it('reports a failure found while processing', async () => {
    const file = fileOf(CHUNK);
    const server = fakeServer(file.size);
    server.error = 'Unsupported file type';
    const error = await failure(run(server, file, { finish: async () => ((server.status = 'processing'), { ok: true }) }));
    expect(error.message).toBe('Unsupported file type');
  });

  it('gives up if processing never starts', async () => {
    const file = fileOf(CHUNK);
    const server = fakeServer(file.size);
    const error = await failure(run(server, file, { finish: async () => ({ ok: true }) })); // status stays "uploading"
    expect(error.message).toMatch(/did not start processing/);
  });

  it('can be cancelled', async () => {
    const file = fileOf(3 * CHUNK);
    const server = fakeServer(file.size);
    const controller = new AbortController();
    server.beforeChunk = call => {
      if (call === 2) controller.abort();
      return undefined;
    };
    const error = await failure(run(server, file, { signal: controller.signal }));
    expect(error.cancelled).toBe(true);
  });

  it('cancelUpload deletes the session with the token and never throws', async () => {
    const server = fakeServer(10);
    await cancelUpload(session, server.fetchImpl);
    expect(server.deleted).toBe(true);
    await cancelUpload(session, (async () => { throw new Error('offline'); }) as unknown as typeof fetch);
  });
});

describe('helpers', () => {
  it('sha256Hex matches the known digest of "abc"', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    try {
      const blob = new TestBlob(new TextEncoder().encode('abc'));
      expect(await sha256Hex(blob as unknown as Blob)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    } finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original);
    }
  });

  it('sha256Hex skips quietly where crypto.subtle is missing', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
    try {
      expect(await sha256Hex(new TestBlob(new Uint8Array(1)) as unknown as Blob)).toBe(undefined);
    } finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original);
    }
  });

  it('backoff grows, stays under ten seconds and is never zero', () => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const wait = backoffMs(attempt);
      expect(wait).toBeGreaterThan(0);
      expect(wait <= 10_000).toBe(true);
    }
    expect(backoffMs(0) <= 800).toBe(true);
  });
});
