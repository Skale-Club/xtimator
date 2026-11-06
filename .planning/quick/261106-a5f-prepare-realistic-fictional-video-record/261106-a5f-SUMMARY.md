---
quick_id: 261106-a5f
date: 2026-11-06
status: complete
---

# Tutorial data prepared in the existing company

User chose a mixed field-service business and archival of old tests in the existing company. Development configuration and production public application bundles identify the same Supabase project, so one committed data transaction serves both.

Created `scripts/seed-video-workspace.mjs`: dry-run default, exact owner/company check, deterministic IDs, private before-state snapshot, transactional apply, math/lifecycle checks, protected-state hash and read-only verification. Refuses to overwrite an existing seed. No external deliveries, charges, AI calls or auth updates.

Committed database result: 12 clients, 19 active projects/current estimates, 40 sections, 86 items, 56 catalogue entries, eight renamed service folders, 60 activity entries and five simulated paid invoices. Seven accepted estimates total $18,908. Archived seven active test projects; soft-deleted 43 old active marketing/technology catalogue entries; retained previously trashed data. Billing, credits, integrations, identity, membership and admin state verified unchanged.

Validation: node syntax check, read-only dry run, transaction validation, independent post-commit verify, data API joins/counts and absence of active technology services. Production health 200. Local dev server unavailable; no visual browser claim. Full reproduction/recording guide at `docs/VIDEO-WORKSPACE.md`.

Existing dashboard limitation documented: estimate aggregates include archived/trashed project estimates (29 pending total vs seven pending from new visible samples). No application code or deployment changed by this task. Unrelated user edits in storage and dashboard components were retained.

Private backup: `.bg-shell/video-workspace/<company-uuid>-<timestamp>-before.json` (not committed).
