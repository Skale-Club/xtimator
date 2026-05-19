---
status: in-progress
task: fix-admin-integrations-page
created: 2026-05-19
---

# Fix Admin Integrations Page

## Goal

Fix the admin integrations page so navigating from the admin sidebar renders the default AI integrations content instead of showing only the header and category nav.

## Scope

- Replace the `/admin/integrations` redirect-only page with a real default category render.
- Reuse the same category rendering logic for `/admin/integrations` and `/admin/integrations/[slug]`.
- Point the admin sidebar integrations link at the default category URL.
- Run focused checks for the touched files.

## Verification

- TypeScript check or targeted lint where feasible.
- Inspect the changed route/component paths for regressions.
