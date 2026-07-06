# Deferred Items — Phase 159

## From Plan 159-02 execution

### Out-of-scope test failure (pre-existing / concurrent-plan territory)

- **Test:** `tests/e2e/admin-whatsapp.spec.ts:210` — `loadAdminConversationThread contains no update/insert/delete calls` (asserts `revalidatePath` is absent from `lib/actions/admin-whatsapp.ts`)
- **File under test:** `lib/actions/admin-whatsapp.ts` — NOT modified by 159-02 (Settings sub-page plan touches only `admin-whatsapp-accounts.tsx`, `whatsapp-templates-panel.tsx`, `app/admin/inbox/settings/page.tsx`)
- **Status when observed:** Failing during 159-02's verification pass, run concurrently with Plan 159-01 (main list-row/thread-header redesign), which is the plan most likely touching `lib/actions/admin-whatsapp.ts` / `admin-whatsapp-client.tsx` right now.
- **Action taken:** None — logged only, per scope-boundary rule (only auto-fix issues directly caused by the current task's changes). Not fixed, not investigated further by this executor.
- **Recommendation:** Re-run `npx playwright test tests/e2e/admin-whatsapp.spec.ts --grep "static contract"` once Plan 159-01 has fully completed and committed, to confirm this was transient concurrent-edit noise and not a real regression.

## From Plan 159-01 execution

### Pre-existing `npx tsc --noEmit` failures (unrelated to this plan's file scope)

Confirmed unrelated to `lib/utils/avatar.ts`, `app/admin/inbox/admin-whatsapp-client.tsx`,
`components/whatsapp/message-bubble.tsx`, `tests/unit/utils/avatar.test.ts` (grep of the
tsc output for "inbox", "avatar.ts", "message-bubble" returns zero matches). Not fixed here
per the scope-boundary rule.

- `tests/unit/ai/refine-shared-prompt.test.ts:49` — TS1501 regex flag needs es2018+ target
- `tests/unit/billing/calibration.test.ts:151,172` — test fixtures missing new `TierBilling`
  fields (`subscriptionPriceAnnualCents`, `includedSeats`) added by a later milestone (v4.12/v4.13)
- `tests/unit/billing/seat-billing.test.ts:92,223,291` — spread-argument / tuple-conversion type errors
- `tests/unit/estimate/markup-totals.test.ts:14` — test fixture missing `unit_price` field
- `tests/unit/estimate/observability.test.ts:38,58,66` — TS1501 regex flag needs es2018+ target
- `tests/unit/estimate/step-runner.test.ts:50` — StepRunner mock return-type mismatch
- `tests/unit/inngest/generate-estimate-job.test.ts:201` — Mock not callable without `new`
- `tests/unit/whatsapp/handler-inngest-dispatch.test.ts:132,231` — test fixtures missing
  `chatEnabled` field on `Entitlements`
- `tests/unit/whatsapp/handler-intent-routing.test.ts:130` — same `chatEnabled` gap
- `tests/unit/whatsapp/handler.test.ts:142,289` — same `chatEnabled` gap

These look like drift between test fixtures and evolving shared types across several
unrelated milestones (billing tiers, entitlements, estimate totals) — not caused by
this phase's changes. Recommend a follow-up `/gsd:quick` or dedicated phase to update
the stale test fixtures/tsconfig target.
