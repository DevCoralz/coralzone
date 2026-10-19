<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep homepage activity and announcement UI in focused components, so the approved homepage layout remains separate from updates.
- Use a restricted aggregate-only database heartbeat for visitor statistics; never expose visitor identifiers or account records to public readers.
- Store only an anonymous browser identifier locally to deduplicate visits; durable totals live in Cloud and online status expires after missed heartbeats.
- Derive canonical and social image URLs from the request origin using the shared brand metadata server function, so metadata follows the active domain without a hardcoded future domain.
- Keep the public dashboard preview in focused shell, chart and overview components; sample account data is client-only and must be replaced by authenticated owner-scoped reads before connecting real balances.
- Give each dashboard navigation destination its own top-level preview route and unique metadata; keep payment and unfinished product actions explicitly unavailable until connected.
- Keep staff administration in a separate `/admin` route family with focused pages and client-only sample records until a separate backend is connected; this preserves the public/customer experience and prevents preview actions from implying persisted account changes.
- Keep bucket rules (plan limit, unique names, ownership, ban, frozen) in the gateway's storage-bucket-store.js, which takes the database as an argument so it is unit tested; server functions only combine it with storage-service data and never trust a bucket id from the browser without re-checking it.
- Keep the admin Users pages read only in the gateway's storage-user-store.js (it takes the database as an argument and is unit tested); changes to a user still go through storage-quota-core.js so every change is audited in one place. Pages show only the short summary of an audit row, never its raw details.
- Keep API key rules (plan limit, bucket scope, ban, audit) in the gateway's storage-apikey-store.js and the request check in api-key-auth.js; both take their dependencies as arguments and are unit tested. Never select key_hash back out, never log or return a secret, and never let a public API handler take an owner id from the request: it always comes from the key.
