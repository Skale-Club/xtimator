---
phase: 174
slug: tenant-cutover-whatsapp-reenable
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-21
revised: 2026-07-21
---

# Phase 174 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `174-01` through `174-07` PLAN.md files.
>
> **Revised** after plan-checker review: 3 BLOCKERs + 2 FLAGs addressed (see each item's note below). Summary: 174-01's idempotence oracle replaced with a genuine resolver-path proof (was tautological); 174-07 moved to Wave 4 (was racing 174-05 on a shared test file); 174-04 gained a `template-resolver.ts` title/subject text-mode fix + its own test file; the WhatsApp guard's dormancy claim is now stated honestly (no-op for the 5 static REGISTRY entries); 174-03 gained a stale-opt-in-row check step; 174-04 now explicitly depends on 174-02.

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
- **After Wave 3 AND Wave 4 (the full sweep) complete:** `npx vitest run tests/unit/notifications tests/unit/inngest tests/unit/whatsapp tests/unit/billing tests/unit/quota.test.ts` + `npx tsc --noEmit -p tsconfig.ci.json`.
- **Max feedback latency:** ~20s per task/plan, ~90s for the phase-gate full sweep.

---

## Wave Structure (revised — BLOCKER 2)

| Wave | Plans | Notes |
|------|-------|-------|
| 1 | 174-01, 174-02, 174-03 | Fully parallel — no shared files. |
| 2 | 174-04 | Depends on 174-01, 174-02, 174-03 (producer of `metadata.email_copy`, consumer of `buildFullCopyContext` + `expectedVariableCount`, owns the `template-resolver.ts` title-mode fix). |
| 3 | 174-05, 174-06 | Parallel — `174-05` (billing/quota) and `174-06` (AI-job Inngest) touch disjoint production files AND disjoint test files. |
| 4 | 174-07 | **Moved from Wave 3 (BLOCKER 2).** Depends on `174-04` AND `174-05` — both 174-05 and 174-07 extend `tests/unit/notifications/event-sources.test.ts`; running them in the same wave races on that shared file. Serializing 174-07 after 174-05 removes the race. 174-06 stays in Wave 3 since it touches no shared test file. |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 174-01-01 | 01 | 1 | TNT-01 (carry-fwd a) | unit | `npx vitest run tests/unit/notifications/copy-context.test.ts` | ❌ W0 (created by this task) | ⬜ pending |
| 174-02-01 | 02 | 1 | TNT-01 (carry-fwd b) | unit | `npx vitest run tests/unit/notifications/email-digest.test.ts` | ✅ extend | ⬜ pending |
| 174-02-02 | 02 | 1 | TNT-01 (carry-fwd b) | unit | `npx vitest run tests/unit/inngest/notification-email-digest.test.ts` | ❌ W0 (created by this task) | ⬜ pending |
| 174-03-01 | 03 | 1 | TNT-02, TNT-03 | unit + manual DB check | `npx vitest run tests/unit/notifications/preferences.test.ts` (+ documented stale-opt-in-row count, non-automatable) | ✅ extend | ⬜ pending |
| 174-03-02 | 03 | 1 | TNT-03 | unit | `npx vitest run tests/unit/notifications/whatsapp-registry.test.ts` | ✅ extend | ⬜ pending |
| 174-04-01 | 04 | 2 | TNT-01 | unit | `npx vitest run tests/unit/notifications/template-resolver.test.ts tests/unit/notifications/dispatch.test.ts` | ✅ extend | ⬜ pending |
| 174-04-02 | 04 | 2 | TNT-03 | unit | `npx vitest run tests/unit/notifications/dispatch.test.ts tests/unit/notifications/whatsapp-channel.test.ts` | ✅ extend | ⬜ pending |
| 174-05-01 | 05 | 3 | TNT-01 | unit + structural | `npx vitest run tests/unit/quota.test.ts tests/unit/billing/credit-ledger.test.ts ...` + copyContext grep count | ✅ extend | ⬜ pending |
| 174-05-02 | 05 | 3 | TNT-01 | unit + structural | `npx vitest run tests/unit/notifications/event-sources.test.ts tests/unit/notifications` | ✅ extend | ⬜ pending |
| 174-06-01 | 06 | 3 | TNT-01 | unit + structural | `npx vitest run` (transcribe/analyze-photos suites) + copyContext grep count | ✅ extend | ⬜ pending |
| 174-06-02 | 06 | 3 | TNT-01 | unit + structural | `npx vitest run tests/unit/inngest tests/unit/notifications` + tsc | ✅ extend | ⬜ pending |
| 174-07-01 | 07 | **4** | TNT-01 | unit + structural | `npx vitest run tests/unit/whatsapp/*.test.ts tests/unit/notifications/event-sources.test.ts` | ✅ extend (on top of 174-05's edits) | ⬜ pending |
| 174-07-02 | 07 | **4** | TNT-01 | unit + structural | `npx vitest run tests/unit/notifications` + tsc + repo-wide sweep-completeness grep | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/unit/notifications/copy-context.test.ts` — net-new file, created and made GREEN within 174-01 Task 1. **Revised oracle (BLOCKER 1):** proves `renderTemplate(EVENT_TEMPLATE_SEED[eventType].body/.title, buildFullCopyContext(eventType, {}), 'text')` equals `buildNotificationCopy(eventType, {}).body/.title` for all 17 EventTypes — a genuine resolver-render-path proof (reusing 172-03's proven seed-equivalence pattern) that fails on an omitted field, NOT a round-trip through `buildNotificationCopy` (which would tautologically pass regardless of what `buildFullCopyContext` produced, since `buildNotificationCopy` re-applies its own defaults on every call).
- [x] `tests/unit/notifications/template-resolver.test.ts` extended (not replaced) within 174-04 Task 1 — new case proving email-channel subject/title renders in TEXT mode while body stays HTML mode (FLAG 3 fix).
- [x] `tests/unit/inngest/notification-email-digest.test.ts` — net-new file (no prior test exercised this Inngest worker at all), created within 174-02 Task 2, testing the extracted pure `buildDigestItem()` helper.
- [x] `tests/unit/notifications/email-digest.test.ts` extended (not replaced) within 174-02 Task 1 — new `preEscaped` cases appended, SCOPED TO BODY ONLY (title is always escaped unconditionally — FLAG 3's downstream contract fix).
- [x] `tests/unit/notifications/preferences.test.ts` extended within 174-03 Task 1 — the D-15-lift regression cases (opted-in-now-true, non-opted-in-still-false).
- [x] `tests/unit/notifications/whatsapp-registry.test.ts` extended within 174-03 Task 2 — `expectedVariableCount` cases.
- [x] `tests/unit/notifications/dispatch.test.ts` extended within 174-04 Tasks 1 and 2 — per-channel resolution + the mismatch-guard cases; ALSO requires a mechanical fix to every pre-existing `getApprovedTemplateForEvent`/`getTemplateForEvent` mock in this file to add `expectedVariableCount: 2` (documented explicitly in 174-04 Task 2's `<read_first>` — a known, planned-for regression risk, not a surprise).
- [x] `tests/unit/notifications/whatsapp-channel.test.ts` — same mechanical mock fix, within 174-04 Task 2.
- [x] `tests/unit/notifications/event-sources.test.ts` extended across 174-05 (Wave 3) then 174-07 (Wave 4, serialized after 174-05 per BLOCKER 2) — new `copyContext`-presence assertions for the connect-webhook / admin-billing / estimate-actions call sites it already covers.
- No framework install needed — Vitest already configured.

---

## Hidden Regressions the Plan MUST Guard Against

- **`tests/unit/notifications/dispatch.test.ts`'s entire pre-Phase-174 suite** (the Phase-77/104/104.3/172 describe blocks) MUST stay green — 174-04 is explicitly instructed to treat any pre-existing test breakage as "the wiring touched something it shouldn't have, fix the wiring, not the test."
- **Adding `expectedVariableCount` to `NotificationTemplate` is a BREAKING mock-shape change for `dispatch.test.ts` and `whatsapp-channel.test.ts`** — every existing `getApprovedTemplateForEvent`/`getTemplateForEvent` mock in both files must be updated in the SAME task (174-04 Task 2) that introduces the guard, or the guard will silently refuse every WhatsApp send in the existing "send happens" tests (`variables.length (2) !== undefined` reads as a mismatch). This is called out explicitly in that task's `<read_first>` — verify it was actually done, not just planned.
- **The `template-resolver.ts` title/subject mode fix (174-04, FLAG 3) must not touch BODY's mode computation** — only the `renderedTitle` line's mode argument changes from the shared `mode` variable to the literal `'text'`. Verify via `template-resolver.test.ts`'s existing "HTML injection" test (which asserts BODY escaping for `channel='email'`) staying green byte-unmodified.
- **`DigestEmailItem.preEscaped` (174-02, FLAG 3 downstream) governs BODY only, never title** — `renderItem`'s `titleHtml` line must remain an UNCONDITIONAL `escapeHtml(item.title)` call with no `preEscaped` branch; only `bodyHtml` branches on the flag. A regression here (accidentally gating title too) would either double-escape a plain-text subject-derived title (if some future code path marks it preEscaped) or fail to escape a legitimately dangerous title.
- **`tests/unit/notifications/copy-tenant-neutrality.test.ts`** (the CREDITUI-04 guard: `admin.bonus_credits_granted` never renders a digit) MUST stay green — 174-01's `buildFullCopyContext` must NOT invent a `credits` default for that event (explicitly tested as a `<behavior>` case in 174-01 Task 1).
- **`lib/inngest/functions/notification-email-digest.ts`'s grouping/threshold/idempotency logic** (15-min window, >3-item grouping, `email_sent_at` marking) must remain byte-unmodified by 174-02 — only the `items.map(...)` line changes to call the new `buildDigestItem()`.
- **The 6 `ai_job.*`/`whatsapp.inbound` call sites swept in 174-06/174-07 remain functionally inert** (`_dropped` category, all channels false) — the sweep must not accidentally change `EVENT_CATEGORIES` or otherwise start delivering these.
- **174-05 and 174-07 both edit `tests/unit/notifications/event-sources.test.ts` (BLOCKER 2)** — 174-07 is now Wave 4 with an explicit `depends_on: ["174-04", "174-05"]`. If execute-phase ever runs these out of order or in parallel despite the dependency, that is itself a defect in the execution tooling, not this plan — the plan-level ordering is the guard.
- **Dormancy rationale, corrected (FLAG 4 — do NOT restate the old framing anywhere, including in SUMMARYs):** TNT-03's actual safety layers, honestly stated:
  1. **Meta's own approval gate** is the real backstop against an unapproved/misconfigured custom template going live — `getApprovedTemplateForEvent` only returns a DB row when `status='approved'`; an admin cannot fake this from inside the app.
  2. **The `whatsapp_opt_in_at` consent gate** (untouched by this phase) still requires an explicit per-tenant opt-in timestamp. 174-03 Task 1 adds a read-only check for stale (pre-D-15) rows with this already set — if any exist, lifting D-15 makes them live immediately, gated only by the category toggle + a valid approved template. This is a KNOWN, documented fact after 174-03 ships (not an assumption).
  3. **The `expectedVariableCount` guard (174-03/174-04)** genuinely protects ONLY a DB-approved row whose admin-authored `variables_schema` doesn't match the projector's output (refuses + logs). It is a STRUCTURAL NO-OP for the 5 static `REGISTRY` fallback entries (`estimate.accepted`, `estimate.declined`, `payment.received`, `quota.exhausted`, `trial.expiring_3d`) — their `expectedVariableCount` is hardcoded to `2`, which always equals `titleBodyVars`'s own fixed 2-element output. Do NOT claim this guard makes TNT-03 "safely dormant" for those 5 events — it doesn't add any dormancy there; layers 1 and 2 above are what matters for them.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| An admin edits a `notification_templates` row (e.g. `payment.received`, channel `in_app`) via direct SQL (Phase 173's editor UI is not yet executed) and the next real `payment.received` event renders the edited copy | TNT-01 | Requires a live Supabase row edit + triggering a real Stripe Connect test-mode webhook event against a real tenant company — the unit suite proves the WIRING, not a live end-to-end DB round trip | After deploy: `UPDATE notification_templates SET body = 'TEST: {{amountUSD}} for {{projectName}}' WHERE event_type='payment.received' AND channel='in_app'`, fire a Stripe test webhook, confirm the in-app notification shows the edited copy |
| The stale-opt-in-row count (174-03 Task 1) | TNT-03 | Requires a live read against production `notification_preferences` — not something a unit test can assert (the count is a fact about live data, not code behavior) | Run the documented read-only query against prod (or the relevant environment) before/during 174-03's execution; record the count in `174-03-SUMMARY.md` regardless of value |
| A real WhatsApp proactive send after a tenant opts in AND an admin registers + Meta-approves an HSM template with a correctly-populated `variables_schema` | TNT-03 | Requires live Meta WhatsApp Business API approval (human/Meta review latency) + a live opted-in tenant phone number — explicitly out of this milestone's automated-test reach, flagged as the phase's own "Operational gate" in ROADMAP.md | After Meta approves a template and an admin sets `variables_schema` to match it: opt a test tenant into WhatsApp, trigger a mapped event (e.g. `estimate.accepted`), confirm delivery on the test device |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands (unit test run, several also chain a `node -e` structural grep-count check for the mechanical sweep plans where no dedicated behavioral test exists per call site)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task across all 7 plans has one)
- [x] Wave 0 covers all MISSING references (2 net-new test files: `copy-context.test.ts`, `notification-email-digest.test.ts` — both created within their owning task, not deferred)
- [x] No watch-mode flags anywhere
- [x] Feedback latency <20s per task, <90s for the phase-gate full sweep
- [x] `nyquist_compliant: true` set in frontmatter
- [x] Revision (plan-checker BLOCKERs/FLAGs) applied: idempotence oracle fixed (BLOCKER 1), wave race resolved (BLOCKER 2), email subject mode fixed (FLAG 3), dormancy framing corrected + stale-opt-in check added (FLAG 4), explicit 174-04→174-02 dependency (FLAG 5)

**Approval:** pending — awaiting execution.
