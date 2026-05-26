---
phase: 83-v4-0-server-action-sweep-derive-company-id-from-cookie
status: complete
shipped: 2026-05-26
mode: inline-pragmatic (codemod)
---

# Phase 83 — Server-Action Sweep Complete

## What shipped

Codemodded **11 server-action files** in `lib/actions/` to derive `company_id` from the active-company cookie (Phase 79 helper `getActiveCompanyId()`) instead of the legacy `companies.user_id = claims.sub` lookup. After Phase 83, all tenant-scoped writes target the user's **active** company — the Switcher UI from Phase 81 finally drives real data scoping in actions.

### Files rewritten (11)

| File | Change |
|---|---|
| `lib/actions/client.ts` | `getAuthContext` uses `getActiveCompanyId()` then `.eq('id', activeCompanyId)` |
| `lib/actions/custom-domain.ts` | same |
| `lib/actions/estimate-template.ts` | same |
| `lib/actions/estimate.ts` | same |
| `lib/actions/photo.ts` | same |
| `lib/actions/price-book.ts` | same |
| `lib/actions/project.ts` | same |
| `lib/actions/recording.ts` | same |
| `lib/actions/settings.ts` | same |
| `lib/actions/tour.ts` | same |
| `lib/actions/whatsapp-settings.ts` | same (manual edit — slightly different return shape) |
| `lib/actions/theme.ts` | direct UPDATE on companies — now keyed by `id = activeCompanyId` not `user_id = claims.sub` |

### Files intentionally NOT changed (3 — documented in test allow-list)

- `lib/actions/auth.ts` — post-login redirect "does this user have any company?" check is semantically per-user; pre-active-company-cookie scope.
- `lib/actions/company.ts` — `mode: 'first'` upsert path is per-user by design (initial onboarding before any company exists).
- `lib/actions/active-company.ts` — references `company_members.user_id` (different domain, not legacy `companies.user_id`).

## Tests

- **New** `tests/unit/phase83-server-action-sweep.test.ts` — 24 static-contract assertions:
  - 12 files asserted to NOT contain `.eq('user_id', claims.sub)` (the 12 non-allowlisted files in `lib/actions/`)
  - 12 files asserted to import `getActiveCompanyId` from `@/lib/queries/active-company` when they have a `getAuthContext` helper
- **Existing** v4.0 suites (67/67) all still pass — no regression from the codemod.

## Verification

- `npx tsc --noEmit` exit 0
- `npx vitest run` on 10 v4.0 suites: 91/91 green (67 prior + 24 new)
- Grep confirms 0 remaining legacy patterns in non-allowlisted action files

## Mode note

Executed **inline via Python codemod** rather than the full multi-agent pipeline. The work is mechanically uniform across 11 files: same regex match, same insertion of `await getActiveCompanyId()`, same swap of `.eq('user_id', claims.sub)` → `.eq('id', activeCompanyId)`. Spawning a researcher and planner for a deterministic codemod would have been pure overhead.

Documented as autonomous-mode pragmatic shortcut. Same pattern as Phase 82.

## What's next

- **Phase 84** — Billing per-company (tier/trial clock scoped to company). Skipped for autonomous batch — needs more product input (e.g., how to handle existing users on a paid tier creating a new company today: inherit, fresh trial, paid immediately?). Locked decision Phase 79 D-14/D-15 says "inherit from source" but this needs UI surfacing too.
- **Phase 85** — Drop `companies.user_id`. Can ship now in principle (all reads gated by `company_members` after Phase 82; all writes target active id after Phase 83). The 3 allowlisted files would also need to migrate first — auth.ts redirect could check `company_members` instead, theme.ts already migrated, company.ts mode:'first' path would need a small refactor.
