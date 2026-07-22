---
phase: 174
slug: tenant-cutover-whatsapp-reenable
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-21
---

# Phase 174 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `174-01` through `174-07` PLAN.md files.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing `vitest.config.ts` at repo root) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/notifications` |
| **Full suite command** | `npx vitest run tests/unit/notifications tests/unit/inngest tests/unit/whatsapp tests/unit/billing tests/unit/quota.test.ts` |
| **Estimated runtime** | ~15-20s quick (notifications dir); ~60-90s full sweep of touched subsystems |

---

## Sampling Rate

- **After every task commit:** run that task's own `<automated>` verify command (scoped to the touched file(s), ~5-15s).
- **After every plan (Wave):** `npx vitest run tests/unit/notifications` (~15-20s) — the choke point every plan in this phase touches or depends on.
- **After Wave 3 (the full sweep) completes:** `npx vitest run tests/unit/notifications tests/unit/inngest tests/unit/whatsapp tests/unit/billing tests/unit/quota.test.ts` + `npx tsc --noEmit -p tsconfig.ci.json`.
- **Max feedback latency:** ~20s per task/plan, ~90s for the phase-gate full sweep.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 174-01-01 | 01 | 1 | TNT-01 (carry-fwd a) | unit | `npx vitest run tests/unit/notifications/copy-context.test.ts` | ❌ W0 (created by this task) | ⬜ pending |
| 174-02-01 | 02 | 1 | TNT-01 (carry-fwd b) | unit | `npx vitest run tests/unit/notifications/email-digest.test.ts` | ✅ extend | ⬜ pending |
| 174-02-02 | 02 | 1 | TNT-01 (carry-fwd b) | unit | `npx vitest run tests/unit/inngest/notification-email-digest.test.ts` | ❌ W0 (created by this task) | ⬜ pending |
| 174-03-01 | 03 | 1 | TNT-02, TNT-03 | unit | `npx vitest run tests/unit/notifications/preferences.test.ts` | ✅ extend | ⬜ pending |
| 174-03-02 | 03 | 1 | TNT-03 | unit | `npx vitest run tests/unit/notifications/whatsapp-registry.test.ts` | ✅ extend | ⬜ pending |
| 174-04-01 | 04 | 2 | TNT-01 | unit | `npx vitest run tests/unit/notifications/dispatch.test.ts` | ✅ extend | ⬜ pending |
| 174-04-02 | 04 | 2 | TNT-03 | unit | `npx vitest run tests/unit/notifications/dispatch.test.ts tests/unit/notifications/whatsapp-channel.test.ts` | ✅ extend | ⬜ pending |
| 174-05-01 | 05 | 3 | TNT-01 | unit + structural | `npx vitest run tests/unit/quota.test.ts tests/unit/billing/credit-ledger.test.ts ...` + copyContext grep count | ✅ extend | ⬜ pending |
| 174-05-02 | 05 | 3 | TNT-01 | unit + structural | `npx vitest run tests/unit/notifications/event-sources.test.ts tests/unit/notifications` | ✅ extend | ⬜ pending |
| 174-06-01 | 06 | 3 | TNT-01 | unit + structural | `npx vitest run` (transcribe/analyze-photos suites) + copyContext grep count | ✅ extend | ⬜ pending |
| 174-06-02 | 06 | 3 | TNT-01 | unit + structural | `npx vitest run tests/unit/inngest tests/unit/notifications` + tsc | ✅ extend | ⬜ pending |
| 174-07-01 | 07 | 3 | TNT-01 | unit + structural | `npx vitest run tests/unit/whatsapp/*.test.ts tests/unit/notifications/event-sources.test.ts` | ✅ extend | ⬜ pending |
| 174-07-02 | 07 | 3 | TNT-01 | unit + structural | `npx vitest run tests/unit/notifications` + tsc + repo-wide sweep-completeness grep | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/unit/notifications/copy-context.test.ts` — net-new file, created and made GREEN within 174-01 Task 1 (idempotence proof against `copy.ts`'s own sparse-ctx defaults, all 17 EventTypes)
- [x] `tests/unit/inngest/notification-email-digest.test.ts` — net-new file (no prior test exercised this Inngest worker at all), created within 174-02 Task 2, testing the extracted pure `buildDigestItem()` helper
- [x] `tests/unit/notifications/email-digest.test.ts` extended (not replaced) within 174-02 Task 1 — new `preEscaped` cases appended
- [x] `tests/unit/notifications/preferences.test.ts` extended within 174-03 Task 1 — the D-15-lift regression cases (opted-in-now-true, non-opted-in-still-false)
- [x] `tests/unit/notifications/whatsapp-registry.test.ts` extended within 174-03 Task 2 — `expectedVariableCount` cases
- [x] `tests/unit/notifications/dispatch.test.ts` extended within 174-04 Tasks 1 and 2 — per-channel resolution + the mismatch-guard cases; ALSO requires a mechanical fix to every pre-existing `getApprovedTemplateForEvent`/`getTemplateForEvent` mock in this file to add `expectedVariableCount: 2` (documented explicitly in 174-04 Task 2's `<read_first>` — a known, planned-for regression risk, not a surprise)
- [x] `tests/unit/notifications/whatsapp-channel.test.ts` — same mechanical mock fix, within 174-04 Task 2
- [x] `tests/unit/notifications/event-sources.test.ts` extended across 174-05/174-07 — new `copyContext`-presence assertions for the connect-webhook / admin-billing / estimate-actions call sites it already covers
- No framework install needed — Vitest already configured.

---

## Hidden Regressions the Plan MUST Guard Against

- **`tests/unit/notifications/dispatch.test.ts`'s entire pre-Phase-174 suite** (the Phase-77/104/104.3/172 describe blocks) MUST stay green — 174-04 is explicitly instructed to treat any pre-existing test breakage as "the wiring touched something it shouldn't have, fix the wiring, not the test."
- **Adding `expectedVariableCount` to `NotificationTemplate` is a BREAKING mock-shape change for `dispatch.test.ts` and `whatsapp-channel.test.ts`** — every existing `getApprovedTemplateForEvent`/`getTemplateForEvent` mock in both files must be updated in the SAME task (174-04 Task 2) that introduces the guard, or the guard will silently refuse every WhatsApp send in the existing "send happens" tests (`variables.length (2) !== undefined` reads as a mismatch). This is called out explicitly in that task's `<read_first>` — verify it was actually done, not just planned.
- **`tests/unit/notifications/copy-tenant-neutrality.test.ts`** (the CREDITUI-04 guard: `admin.bonus_credits_granted` never renders a digit) MUST stay green — 174-01's `buildFullCopyContext` must NOT invent a `credits` default for that event (explicitly tested as a `<behavior>` case in 174-01 Task 1).
- **`lib/inngest/functions/notification-email-digest.ts`'s grouping/threshold/idempotency logic** (15-min window, >3-item grouping, `email_sent_at` marking) must remain byte-unmodified by 174-02 — only the `items.map(...)` line changes to call the new `buildDigestItem()`.
- **The 6 `ai_job.*`/`whatsapp.inbound` call sites swept in 174-06/174-07 remain functionally inert** (`_dropped` category, all channels false) — the sweep must not accidentally change `EVENT_CATEGORIES` or otherwise start delivering these.
- **`whatsapp_notification_templates`'s existing rows have `variables_schema` defaulting to `[]`** — after 174-03/174-04 ship, any ALREADY-APPROVED template row without a populated `variables_schema` will have every WhatsApp send silently refused (logged, not thrown) until an admin populates it. This is the INTENDED "safely dormant until approval + configuration exists" behavior, not a bug — but it means TNT-03 does not produce a single live WhatsApp send today even after this phase completes; the operational gate (Meta approval + `variables_schema` authoring) is unchanged.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| An admin edits a `notification_templates` row (e.g. `payment.received`, channel `in_app`) via direct SQL (Phase 173's editor UI is not yet executed) and the next real `payment.received` event renders the edited copy | TNT-01 | Requires a live Supabase row edit + triggering a real Stripe Connect test-mode webhook event against a real tenant company — the unit suite proves the WIRING, not a live end-to-end DB round trip | After deploy: `UPDATE notification_templates SET body = 'TEST: {{amountUSD}} for {{projectName}}' WHERE event_type='payment.received' AND channel='in_app'`, fire a Stripe test webhook, confirm the in-app notification shows the edited copy |
| A real WhatsApp proactive send after a tenant opts in AND an admin registers + Meta-approves an HSM template with a correctly-populated `variables_schema` | TNT-03 | Requires live Meta WhatsApp Business API approval (human/Meta review latency) + a live opted-in tenant phone number — explicitly out of this milestone's automated-test reach, flagged as the phase's own "Operational gate" in ROADMAP.md | After Meta approves a template and an admin sets `variables_schema` to match it: opt a test tenant into WhatsApp, trigger a mapped event (e.g. `estimate.accepted`), confirm delivery on the test device |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands (unit test run, several also chain a `node -e` structural grep-count check for the mechanical sweep plans where no dedicated behavioral test exists per call site)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task across all 7 plans has one)
- [x] Wave 0 covers all MISSING references (2 net-new test files: `copy-context.test.ts`, `notification-email-digest.test.ts` — both created within their owning task, not deferred)
- [x] No watch-mode flags anywhere
- [x] Feedback latency <20s per task, <90s for the phase-gate full sweep
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — awaiting execution.
