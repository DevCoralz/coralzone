# Roadmap
- [x] Rename CoralzOne and reduce heading weights while preserving the approved design.
- [x] Add live online, visitor and registered-user counts.
- [x] Add right-to-left looping movie announcements and verify the homepage and auth page.
- [x] Create crystal-blue logo for favicon and social/search identity only.
- [x] Replace template page branding and verify icons and sharing metadata.
- [ ] Remove the platform-injected publishing badge — blocked: requires editor access on Pro or higher.
- [x] Build dashboard balance, interactive usage charts, summary and top announcements.
- [x] Add five-tab floating navigation and separate hamburger-menu pages.
- [x] Verify dashboard interactions and mobile layout.
- [x] Build a frontend-only admin workspace with overview, user management and user detail, payments, site settings, ads, and admin management; keep all data demo-only.

## Cloud admin build-out (one zip per step)
- [x] Step 1 — Admin tree: /admin/cloud layout + 7 branch pages, shared guard/formatters, storage_settings + admin_action_log tables.
- [x] Step 2 — System settings (global max upload, plan quotas, extra-storage price, allowed file groups, storage maintenance mode). Pricing page and uploads now read them.
- [x] Step 3 — Quota engine. Per-user plan + extra storage + manual limits, freeze and ban, enforced on upload (maintenance → banned → frozen → per-file limit → free space; fails closed if the plan can't be verified). The storage service re-checks free space itself (`quota_bytes`). Admin can set all of it from /admin/cloud/users (look up by email or id, audited). Banned users also lose download/delete through the app.
- [x] Step 3b — Large uploads. Chunked, browser to storage service direct (8 MB chunks, resumable, SHA-256 checked per chunk). CoralzOne opens the session (quota, ban, freeze, free space) and finishes it (checks again), so a ban mid upload stops the file. The storage service reserves space for uploads in flight, refuses a wrong file type after the first chunk and finishes in the background. Needs the storage service redeployed and STORAGE_MAX_UPLOAD_MB set (4000 for Scale, needs Telegram Premium).
- [x] Step 4 — Buckets. Users create, rename and delete buckets at /cloud/buckets (Starter 1, Pro/Scale unlimited; unique names; delete only when empty) and pick one on the Storage page to filter files and upload into it. Admin: /admin/cloud/buckets (search by name or owner email, Frozen filter, owners over 80% full, paging) and /admin/cloud/buckets/{id} (owner, usage, newest files, freeze, delete with files). Freeze stops uploads into a bucket and checks again when a long upload finishes. Every change is in the admin log. No new migration (storage_buckets already existed). The Pricing page lists each plan's bucket limit. "Owner over 80% full" means strictly above 80%. A hiccup while finishing a big upload keeps the file and retries instead of cancelling it. Needs the storage service redeployed (two new routes).
- [x] Step 5 — Users & usage. /admin/cloud/users lists everyone (newest first) with search by name, email or full user id, filters for Frozen, Banned and plan (Starter includes people with no quota row), paging and each person's space, file count and bucket count. /admin/cloud/users/{id} is a read only overview: plan and flags, space used against the allowance, files, buckets (each links to its bucket page), space outside any bucket, newest files, API key totals and the last admin changes. /admin/cloud/users/{id}/controls holds the plan, extra storage, overrides, freeze and ban form from Step 3 (cap upload lives here). New gateway route GET /api/admin/cloud-users (admin only, read only, rate limited). The storage service's /buckets/usage now also returns each owner's file count; the page copes with the old service (counts show as unknown). Request totals and key reset need real API keys, so they arrive with Step 6: the page already shows key totals from storage_api_keys and says so when there are none. No migration. Needs the storage service redeployed for file counts only.
- [ ] Step 6 — API keys (real, hashed). Also adds "revoke all keys" for one user on the user controls page, and live request counts.
- [ ] Step 7 — Files & abuse (filters, flags, MIME block).
- [ ] Step 8 — Billing & extra storage (Paystack).
- [ ] Step 9 — Overview cards.
