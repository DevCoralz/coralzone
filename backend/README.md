# CoralZone Backend

Standalone Node.js (Express) API for CoralZone, hosted separately from the frontend.

## Run locally

```bash
cd backend
bun install   # or npm install
bun run dev   # starts on http://localhost:4000 with auto-reload
```

## Endpoints

- `GET /api/health` — health check
- `GET /api/stats` — live homepage statistics
- `GET /api/announcements` — movie announcements feed

## Deploy

**Persistent host (Render, Railway, Fly.io, a VPS):**

```bash
bun run start
```

Set `PORT` if your host requires it.

**Vercel:**

Import the `backend` folder as its own Vercel project (separate from the
frontend project). `api/index.js` + `vercel.json` route every request to the
same Express app — no extra config needed, just set the root directory to
`backend` when importing.

Caveat: `/api/activity`'s visitor counts are held in an in-memory `Map` in
`src/app.js`. That's fine on a persistent host, but Vercel's Node functions
are serverless — no shared memory across instances, cold starts reset it.
Counts will under-report there. Swap in Upstash Redis or Vercel KV if you
need accurate numbers on Vercel; the in-memory version is otherwise a drop-in
placeholder.

Either way, point the frontend's `VITE_API_URL` at this API's public URL
once deployed.
