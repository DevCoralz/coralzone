import { createFileRoute } from '@tanstack/react-router'
import { dashboardHead } from '@/lib/dashboard-head';
import { getBrandMetadata } from '@/lib/brand.functions';

export const Route = createFileRoute('/cloud/docs')({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Cloud docs', 'Call the CloudOne API from your own apps.', '/cloud/docs', loaderData?.origin),
  component: Page,
});

const endpoints = [
  { method: 'GET', path: '/v1/files', text: 'List your files' },
  { method: 'POST', path: '/v1/files', text: 'Upload a file' },
  { method: 'GET', path: '/v1/files/:key', text: 'Download a file' },
  { method: 'DELETE', path: '/v1/files/:key', text: 'Delete a file' },
  { method: 'GET', path: '/v1/usage', text: 'Storage and request usage' },
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
      <p className="mt-3 text-sm text-muted-foreground">Add your key to every request in the X-API-Key header.</p>
      <Code>{`curl "${base}/v1/files" \\
  -H "X-API-Key: cz_live_your_key"`}</Code>
    </section>

    <section className="dashboard-panel mt-6 overflow-hidden">
      <h2 className="border-b border-glass-border p-5 font-display text-xl font-normal">Endpoints</h2>
      <div className="divide-y divide-glass-border">
        {endpoints.map(endpoint => (
          <div key={endpoint.path + endpoint.method} className="flex flex-wrap items-baseline gap-3 p-4 sm:px-6">
            <span className={`w-16 shrink-0 rounded px-2 py-0.5 text-center font-mono text-[11px] ${endpoint.method === 'GET' ? 'bg-primary/20 text-primary-glow' : endpoint.method === 'POST' ? 'bg-online/20 text-online' : 'bg-destructive/20 text-destructive'}`}>{endpoint.method}</span>
            <code className="text-sm">{endpoint.path}</code>
            <p className="w-full text-xs text-muted-foreground sm:w-auto sm:flex-1 sm:text-right">{endpoint.text}</p>
          </div>
        ))}
      </div>
    </section>

    <section className="dashboard-panel mt-6 p-6">
      <h2 className="font-display text-xl font-normal">Upload a file</h2>
      <Code>{`curl -X POST "${base}/v1/files" \\
  -H "X-API-Key: cz_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"hello.txt","contentType":"text/plain","content":"<base64>"}'`}</Code>
    </section>

    <section className="dashboard-panel mt-6 p-6">
      <h2 className="font-display text-xl font-normal">Rate limits</h2>
      <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        <div><p className="text-xs text-muted-foreground">Starter</p><p className="mt-1">60 per minute</p></div>
        <div><p className="text-xs text-muted-foreground">Pro</p><p className="mt-1">300 per minute</p></div>
        <div><p className="text-xs text-muted-foreground">Scale</p><p className="mt-1">1,200 per minute</p></div>
      </div>
      <p className="mt-5 text-xs text-muted-foreground">Over the limit you get a 429. Wait a moment and try again.</p>
    </section>
  </>;
}
