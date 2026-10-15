# CoralZone Monorepo

```text
/frontend   TanStack Start web app + its own /api — this is the Vercel
            project root (set "Root Directory" to frontend in Vercel's
            project settings). One deployment, one domain.
```

The Express backend that used to live in `/backend` and deploy to its own
host has been folded into `frontend/api` — see `frontend/README.md` for the
endpoints and env vars. There's no `VITE_API_URL` anymore: the frontend
calls `/api/...` on its own origin.

## Quick start

```bash
bun install
cd frontend && bun run db:migrate   # one-time: creates the auth tables
cd ..
bun run dev                         # web app + API on http://localhost:3000
```

See `frontend/.env.example` for the environment variables to set locally
and on Vercel (`DATABASE_URL`, `SMTP_*`, etc).
