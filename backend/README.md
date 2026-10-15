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

Host on any Node.js platform (Render, Railway, Fly.io, a VPS, etc.):

```bash
bun run start
```

Set the `PORT` environment variable if your host requires it. Point the
frontend at this API via its public URL once deployed.
