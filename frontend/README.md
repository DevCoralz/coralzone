# CoralzOne

A crystal-blue ecosystem for movies, REST APIs, foreign numbers and future tools.

## API

`/api` holds plain Vercel Node functions (no Express) — each file is its
own serverless function:

| Route | What it does |
| --- | --- |
| `POST /api/auth/register` | Create account, email a 6-digit code |
| `POST /api/auth/verify-email` | Confirm the code, start a session |
| `POST /api/auth/login` | Email + password; unverified accounts get a fresh code instead of a session |
| `POST /api/auth/resend-code` | Re-send the verification code |
| `GET  /api/auth/google` | Redirect to Google's consent screen |
| `GET  /api/auth/google-callback` | Exchange the code, sign the user in (no email step — Google already verified it) |
| `GET  /api/auth/me` | Current session's user, or 401 |
| `POST /api/auth/logout` | Revoke the session |
| `GET  /api/health`, `/api/stats`, `/api/announcements`, `POST /api/activity` | The pre-existing public homepage endpoints |

Two ways to create the `users`, `email_verification_codes`, `sessions` and
`auth_rate_limits` tables (schema in `api/_lib/schema.sql`):

- **Have a terminal?** `bun run db:migrate` with `DATABASE_URL` set.
- **No terminal (e.g. Vercel free plan)?** Set `MIGRATION_SECRET` in
  Vercel's env vars alongside `DATABASE_URL`, deploy, then visit
  `https://<your-domain>/api/admin/migrate?secret=<that value>` once in a
  browser. It's safe to re-visit (every statement is `CREATE TABLE IF NOT
  EXISTS`) — once it reports success, delete or change `MIGRATION_SECRET`
  so the URL stops working for anyone else who finds it.

> **After updating to the quota engine (Cloud step 3), run the migration
> again.** It adds the `storage_user_bans` table and relaxes two columns on
> `storage_quotas`. Until it runs, Cloud uploads are refused with "could not
> verify your storage plan" — that is deliberate (a ban or freeze must never
> be skippable by a failed lookup). Re-running is safe.

Copy `.env.example` to `.env` for local dev, and set the same variables on
Vercel.

## Brand assets

The crystal logo is used for the favicon, Apple touch icon and social sharing image; it does not appear in the page layout. Each page defines its own CoralzOne search and social metadata.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS


## Large uploads (chunked, direct to the storage service)

Vercel rejects request bodies over about 4.5 MB, so files are not sent through
this app. The flow on `/cloud/storage`:

1. `startMyUpload` (server function) runs the quota engine and opens a session on
   the storage service with the service key. The browser gets a one time token.
2. The browser sends 8 MB chunks to the storage service (`src/lib/chunked-upload.ts`),
   each with a SHA-256 so damage in transit is caught. A dropped connection resumes
   where it stopped.
3. `finishMyUpload` checks the user again (ban, freeze, maintenance), then tells the
   storage service to finish. Processing and the Telegram upload happen there in the
   background and the page waits for the result.

Set `STORAGE_PUBLIC_URL` if browsers reach the storage service on a different
address than the server does, and list your site in the storage service's
`CORS_ORIGINS`. See `coralz-storage/.env.example` for the upload settings.
