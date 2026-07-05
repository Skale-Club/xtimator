# Deferred Items — Phase 152

Out-of-scope failures observed while running the full `npm test` suite during 152-02 execution. Not caused by this plan's changes (Task 1-3: `lib/billing/calibration.ts`, `lib/queries/admin-company-cost.ts`, `app/admin/companies/[id]/company-cost-card.tsx` + `page.tsx`). Logged per deviation-rules scope boundary — not fixed here.

## 1. `tests/integration/blog-rls.test.ts` — 2 failing assertions

- `getBlogPost returns null for a draft post slug via anon client`
- `getBlogPost returns post object for a published post slug via anon client`
- Integration test requiring a live Supabase connection/anon RLS context; pre-existing, last touched in an unrelated commit (`5dcbe578`, SEO reconciliation). Not related to billing/admin cost.

## 2. `tests/unit/components/landing-page.test.tsx` — 1 failing assertion

- `opens the AuthDialog in login mode when ?auth=login and strips the param via router.replace`
- Documented pre-existing flake (AuthDialog portal timing via `screen.findByRole`), last touched in the same unrelated commit (`5dcbe578`). Not related to billing/admin cost.

Both were failing before this plan's Task 1 (`aggregateAiCostByOperation` companyId extension) and are unaffected by it — confirmed no shared code path.

## Confirmed by 152-01 (independent full-suite run)

152-01 (`lib/billing/usage-percent.ts`, `components/billing/usage-progress-bar.tsx`,
`components/billing/credit-balance-card.tsx`, `components/app-shell/credit-chip.tsx`,
`app/(app)/settings/billing/page.tsx`, `app/(app)/layout.tsx`,
`components/app-shell/topbar.tsx`) independently ran the full `npm test` suite and
observed the SAME two failing files/three assertions listed above, with no
additional failures. Isolated re-run of `tests/unit/components/landing-page.test.tsx`
alone still fails the same assertion, confirming it is not a cross-suite ordering
artifact. Both remain pre-existing and out of scope for 152-01.
