# CoralZone Monorepo

```text
/frontend   TanStack Start web app (hosted on its own, e.g. Lovable / Cloudflare)
/backend    Node.js Express API (hosted on its own, e.g. Render / Railway / VPS)
```

## Quick start

```bash
bun install            # installs both workspaces
bun run dev:frontend   # web app on http://localhost:8080
bun run dev:backend    # API on http://localhost:4000
```

Each folder can also be deployed independently — see its own README.
