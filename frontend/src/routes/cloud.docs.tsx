import { createFileRoute } from '@tanstack/react-router'
import { dashboardHead } from '@/lib/dashboard-head';
import { getBrandMetadata } from '@/lib/brand.functions';
import { API_RATE_DEFAULTS } from '@/lib/storage-apikeys';

export const Route = createFileRoute('/cloud/docs')({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Cloud docs', 'Call the CloudOne API from your own apps.', '/cloud/docs', loaderData?.origin),
  component: Page,
});

// live = answers today. Anything else is planned and not available yet, so the
// page says so instead of describing a call that would fail.
const endpoints = [
  { method: 'GET', path: '/v1/files', text: 'List your files, newest first', live: true },
  { method: 'GET', path: '/v1/usage', text: 'What you store and your key limit', live: true },
  { method: 'POST', path: '/v1/files', text: 'Upload a file', live: false },
  { method: 'GET', path: '/v1/files/:key', text: 'Download a file', live: false },
  { method: 'DELETE', path: '/v1/files/:key', text: 'Delete a file', live: false },
];

function Code({ children }: { children: string }) {
  return <pre className="mt-4 overflow-x-auto rounded-lg border border-glass-border bg-black/30 p-4 font-mono text-xs leading-relaxed text-foreground">{children}</pre>;
}

function Page() {
  const { origin } = Route.useLoaderData();
  const base = `${origin}/api`;

  return <>
    <h1 className="font-display text-3xl font-normal sm:text-4xl">Docs</h1>

    <section className="dashboard-panel mt-8 p-6">
      <h2 className="font-display text-xl font-normal">Base URL</h2>
      <Code>{base}</Code>
      <h2 className="mt-8 font-display text-xl font-normal">Authentication</h2>
      <p className="mt-3 text-sm text-muted-foreground">Add your key to every request in the X-API-Key header. Make keys on the API keys page; a key is shown once, when you make it. Keep it on your server, never in a web page or an app.</p>
      <Code>{`curl "${base}/v1/files" \\
  -H "X-API-Key: cz_live_your_key"`}</Code>
    </section>

    <section className="dashboard-panel mt-6 overflow-hidden">
      <h2 className="border-b border-glass-border p-5 font-display text-xl font-normal">Endpoints</h2>
      <div className="divide-y divide-glass-border">
        {endpoints.map(endpoint => (
          <div key={endpoint.path + endpoint.method} className="flex flex-wrap items-baseline gap-3 p-4 sm:px-6">
            <span className={`w-16 shrink-0 rounded px-2 py-0.5 text-center font-mono text-[11px] ${endpoint.method === 'GET' ? 'bg-primary/20 text-primary-glow' : endpoint.method === 'POST' ? 'bg-online/20 text-online' : 'bg-destructive/20 text-destructive'}`}>{endpoint.method}</span>
            <code className={`text-sm ${endpoint.live ? '' : 'text-muted-foreground'}`}>{endpoint.path}</code>
            {!endpoint.live && <span className="rounded-full border border-glass-border px-2 py-0.5 text-[10px] text-muted-foreground">Coming soon</span>}
            <p className="w-full text-xs text-muted-foreground sm:w-auto sm:flex-1 sm:text-right">{endpoint.text}</p>
          </div>
        ))}
      </div>
    </section>

    <section className="dashboard-panel mt-6 p-6">
      <h2 className="font-display text-xl font-normal">List your files</h2>
      <p className="mt-3 text-sm text-muted-foreground">Add <code className="text-primary-glow">limit</code> (up to 100), <code className="text-primary-glow">offset</code> and <code className="text-primary-glow">bucket_id</code> to narrow it. A key limited to one bucket only ever sees that bucket.</p>
      <Code>{`curl "${base}/v1/files?limit=20" \\
  -H "X-API-Key: cz_live_your_key"`}</Code>
      <Code>{`{
  "files": [
    {
      "id": "…",
      "name": "logo.png",
      "size": 48213,
      "contentType": "image/png",
      "kind": "image",
      "bucketId": null,
      "createdAt": "2026-03-01T09:30:00"
    }
  ],
  "limit": 20,
  "offset": 0,
  "bucketId": null
}`}</Code>
      <h2 className="mt-8 font-display text-xl font-normal">Check your usage</h2>
      <Code>{`curl "${base}/v1/usage" \\
  -H "X-API-Key: cz_live_your_key"`}</Code>
      <p className="mt-3 text-xs text-muted-foreground">Uploading, downloading and deleting through the API are not ready yet. Until then, use the Storage page.</p>
    </section>

    <section className="dashboard-panel mt-6 p-6">
      <h2 className="font-display text-xl font-normal">Rate limits</h2>
      <p className="mt-3 text-sm text-muted-foreground">The limit is per key, per minute.</p>
      <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        <div><p className="text-xs text-muted-foreground">Starter</p><p className="mt-1">{API_RATE_DEFAULTS.starter.toLocaleString('en-NG')} per minute</p></div>
        <div><p className="text-xs text-muted-foreground">Pro</p><p className="mt-1">{API_RATE_DEFAULTS.pro.toLocaleString('en-NG')} per minute</p></div>
        <div><p className="text-xs text-muted-foreground">Scale</p><p className="mt-1">{API_RATE_DEFAULTS.scale.toLocaleString('en-NG')} per minute</p></div>
      </div>
      <p className="mt-5 text-xs text-muted-foreground">Over the limit you get a 429 with a Retry-After header. Wait that many seconds and try again. Every response carries X-RateLimit-Limit so you can see your key's limit.</p>
      <h2 className="mt-8 font-display text-xl font-normal">Errors</h2>
      <div className="mt-4 grid gap-2 text-sm">
        <p><span className="font-mono text-primary-glow">401</span> <span className="text-muted-foreground">Missing, wrong or revoked key.</span></p>
        <p><span className="font-mono text-primary-glow">403</span> <span className="text-muted-foreground">Cloud access for the account is suspended.</span></p>
        <p><span className="font-mono text-primary-glow">404</span> <span className="text-muted-foreground">That bucket does not exist.</span></p>
        <p><span className="font-mono text-primary-glow">429</span> <span className="text-muted-foreground">Too many requests.</span></p>
        <p><span className="font-mono text-primary-glow">503</span> <span className="text-muted-foreground">Storage is busy. Try again shortly.</span></p>
      </div>
    </section>
  </>;
}
