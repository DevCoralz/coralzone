import { createFileRoute } from '@tanstack/react-router'
import { BookOpen, ShieldCheck, Terminal } from 'lucide-react';
import { dashboardHead } from '@/lib/dashboard-head';
import { getBrandMetadata } from '@/lib/brand.functions';

export const Route = createFileRoute('/cloud/docs')({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Cloud docs', 'How to authenticate and call the CoralzOne Cloud storage API.', '/cloud/docs', loaderData?.origin),
  component: Page,
});

const endpoints = [
  { method: 'GET', path: '/v1/files', text: 'List your files. Returns key, size and updatedAt for each item.' },
  { method: 'POST', path: '/v1/files', text: 'Upload a file. Send JSON with name, contentType and base64 content.' },
  { method: 'GET', path: '/v1/files/:key', text: 'Download a file by key.' },
  { method: 'DELETE', path: '/v1/files/:key', text: 'Delete a file by key.' },
  { method: 'GET', path: '/v1/usage', text: 'Current usage: bytes used, quota and request count.' },
  { method: 'GET', path: '/health', text: 'Service health check.' },
];

function Code({ children }: { children: string }) {
  return <pre className="mt-4 overflow-x-auto rounded-lg border border-glass-border bg-black/30 p-4 font-mono text-xs leading-relaxed text-foreground">{children}</pre>;
}

function Page() {
  return <>
    <p className="flex items-center gap-2 text-xs text-muted-foreground"><BookOpen size={14} />Reference</p>
    <h1 className="mt-2 font-display text-3xl font-normal sm:text-4xl">Cloud docs</h1>
    <p className="mt-3 max-w-xl text-sm text-muted-foreground">Everything your apps need to talk to CoralzOne Cloud. One privacy rule applies everywhere: CoralzOne never reveals storage URLs to end users — all traffic flows through your key.</p>

    <section className="dashboard-panel mt-8 p-6">
      <h2 className="flex items-center gap-2 font-display text-xl font-normal"><ShieldCheck size={18} className="text-primary-glow" />Authentication</h2>
      <p className="mt-3 text-sm text-muted-foreground">Send your API key with every request. Keys are created on the API keys page.</p>
      <Code>{`curl "https://cloud.coralzone.example/v1/files" \\
  -H "X-API-Key: cz_live_your_key_here"`}</Code>
    </section>

    <section className="dashboard-panel mt-6 overflow-hidden">
      <h2 className="flex items-center gap-2 border-b border-glass-border p-5 font-display text-xl font-normal"><Terminal size={18} className="text-primary-glow" />Endpoints</h2>
      <div className="divide-y divide-glass-border">
        {endpoints.map(endpoint => (
          <div key={endpoint.path + endpoint.method} className="flex flex-wrap items-baseline gap-3 p-4 sm:px-6">
            <span className={`shrink-0 rounded px-2 py-0.5 font-mono text-[11px] ${endpoint.method === 'GET' ? 'bg-primary/20 text-primary-glow' : endpoint.method === 'POST' ? 'bg-online/20 text-online' : 'bg-destructive/20 text-destructive'}`}>{endpoint.method}</span>
            <code className="text-sm">{endpoint.path}</code>
            <p className="w-full text-xs text-muted-foreground sm:w-auto sm:flex-1">{endpoint.text}</p>
          </div>
        ))}
      </div>
    </section>

    <section className="dashboard-panel mt-6 p-6">
      <h2 className="font-display text-xl font-normal">Rate limits</h2>
      <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        <div><p className="text-muted-foreground text-xs">Starter</p><p className="mt-1">60 requests / min</p></div>
        <div><p className="text-muted-foreground text-xs">Pro</p><p className="mt-1">300 requests / min</p></div>
        <div><p className="text-muted-foreground text-xs">Scale</p><p className="mt-1">1,200 requests / min</p></div>
      </div>
      <p className="mt-5 text-xs text-muted-foreground">A 429 response means you hit the limit — back off and retry. Every response includes <code className="text-primary-glow">X-RateLimit-Remaining</code>.</p>
    </section>

    <section className="dashboard-panel mt-6 p-6">
      <h2 className="font-display text-xl font-normal">Quick start</h2>
      <Code>{`# 1. Create a key on the API keys page
# 2. Upload a file
curl -X POST "https://cloud.coralzone.example/v1/files" \\
  -H "X-API-Key: cz_live_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"hello.txt","contentType":"text/plain","content":"<base64>"}'

# 3. List files
curl "https://cloud.coralzone.example/v1/files" \\
  -H "X-API-Key: cz_live_your_key_here"`}</Code>
    </section>
  </>;
}
