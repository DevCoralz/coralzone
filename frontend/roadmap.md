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
- [ ] Step 3b — Large uploads: chunked, direct-to-storage (Vercel ~4.5 MB body cap and Cloudflare ~100 MB cap block 500 MB–4 GB uploads today).
- [ ] Step 4 — Buckets.
- [ ] Step 5 — Users & usage (per-user controls already live from Step 3; still to do: user search/list, per-user buckets, GB and request totals, API-key reset).
- [ ] Step 6 — API keys (real, hashed).
- [ ] Step 7 — Files & abuse (filters, flags, MIME block).
- [ ] Step 8 — Billing & extra storage (Paystack).
- [ ] Step 9 — Overview cards.
