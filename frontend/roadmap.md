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

## Current request (Oct 2026) — continue from here after any remix
- [x] Import website ZIP into project/preview (survives remix)
- [x] Admin/user roles: admin routes gated by ADMIN_EMAIL via getIsAdmin (src/lib/admin.functions.ts); non-admins get 404
- [x] STORAGE_SERVICE_URL / STORAGE_SERVICE_KEY read server-side only in src/lib/storage.functions.ts (never exposed to users)
- [x] Dashboard bottom nav: square corners (bar radius 0, links rounded-lg), same contents/size
- [x] Movies removed everywhere; Cloud section live at /cloud, /cloud/pricing, /cloud/pay, /cloud/storage, /cloud/api-keys, /cloud/usage, /cloud/docs
- [x] Admin page to manage Cloud storage system at /admin/cloud (nav item added)
- [x] Full updated ZIP delivered to Files

## Waiting on the owner
- Add ADMIN_EMAIL to project variables to grant admin access to that email
- Add STORAGE_SERVICE_URL and STORAGE_SERVICE_KEY to enable live storage listing/upload/delete (endpoint contract: /health, /files, /files/:key, /usage)
- Card/bank checkout buttons are wired but disabled until a payment provider is connected
