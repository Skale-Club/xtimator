---
phase: 163-format-first-send-hub-cross-surface-settings-rollout
plan: 05
subsystem: delivery-wiring
tags: [send-hub, delivery-actions, estimate_deliveries, whatsapp-fallback, format-first, sendhub-02, sendhub-03]

# Dependency graph
requires:
  - phase: 163-02
    provides: `format` column + widened `channel` (copy/open/download/manual) + widened `provider` ('client') on `estimate_deliveries`
  - phase: 163-03
    provides: `formatEstimateForWhatsApp(..., presentation_settings?)` trailing arg + `buildItemsBreakdown(estimate, resolvedSettings?)` widened
  - phase: 163-04
    provides: SendHubDialog scaffolding + placeholder onClick handlers to replace
provides:
  - All 6 existing `estimate_deliveries` INSERT payloads carry the widened `format` field (email/SMS/WhatsApp; success + failure branches)
  - WhatsApp dispatcher `effectiveDeliveryFormat` branch: forces `share_link` when `params.format ∈ {pdf, plain_text}` (SENDHUB-02 contract)
  - W-1 fix: WhatsApp API route accepts `format` on request body and forwards it into `deliverEstimateViaWhatsApp(..., format)` -- without this, the fallback branch above is dead-lettered at the transport boundary
  - `markAsSentAction` gains a 6th side effect: inserts `{channel:'manual', format:null, provider:'client', status:'sent'}` into `estimate_deliveries` (the 5 existing side effects fire in the same order)
  - New `logDeliveryAction({estimateId, format, channel})` server action for copy/open/download client-side actions -- non-throwing, provider:'client'
  - SendHubDialog: every placeholder onClick replaced with a real handler (Copy URL / Open URL / Download PDF / Copy Plain Text / Email / SMS / WhatsApp per format); every send POST body carries `format`
  - PlainTextSheet's Copy button now also fires `logDeliveryAction({format:'plain_text', channel:'copy'})` fire-and-forget
  - Wave 0 fallback + delivery-insert-format tests transition RED -> GREEN across all 3 files
affects:
  - 163-06-PLAN.md (deletion sweep: send-dialog.tsx, send-form.tsx, send-actions-menu.tsx, send-tab.tsx, estimate-preview.tsx all remain safe to delete; plain-text-sheet.tsx's Copy handler now depends on logDeliveryAction but the sheet itself stays -- retire decision defers to 163-06)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Explicit `format: format` in `estimate_deliveries` INSERT payloads (over `{format}` shorthand): the static-grep audit test (`tests/unit/estimate/delivery-insert-format.test.ts`) enforces `\\bformat\\s*:/`. Shorthand doesn't match. Explicit key/value form is the enforced convention across every INSERT site."
    - "Object-arg send handlers: `sendEmail({format, label})` (not positional args) so every button onClick surfaces `format: 'online_link' | 'pdf' | 'plain_text'` as an explicit literal in the JSX. Makes RTL smoke tests trivial and static-grep audits precise."
    - "Non-throwing delivery-log fire-and-forget: `logDeliveryAction` swallows every failure with console.error + return. Callers use `void logDeliveryAction(...)` so a log-write hiccup never crosses back into the UX (the copy already succeeded / the tab already opened / the PDF is downloading)."
    - "Effective-delivery-format wrapper (SENDHUB-02): `effectiveDeliveryFormat = (params.format === 'pdf' || 'plain_text') ? 'share_link' : deliveryFormat`. Swap-in point at line 84 (right after `deliveryFormat` resolution). Downstream branches read `effectiveDeliveryFormat`; the account-wide `deliveryFormat` variable stays live for telemetry/logging (dispatcher still knows what the account WANTED, even if the hub forced share_link)."

key-files:
  created: []
  modified:
    - app/api/estimates/[id]/send/route.ts
    - app/api/estimates/[id]/send-sms/route.ts
    - app/api/estimates/[id]/send-whatsapp/route.ts
    - lib/whatsapp/send-estimate.ts
    - lib/actions/estimate.ts
    - components/workspace/send/send-hub-dialog.tsx
    - components/workspace/send/plain-text-sheet.tsx

key-decisions:
  - "Explicit `format: format` in every `estimate_deliveries` INSERT payload -- shorthand `{format}` doesn't satisfy the audit test's `/\\bformat\\s*:/` regex. Convention is consistent across all 6 INSERT sites so no future refactor accidentally regresses to shorthand and slips past CI."
  - "Send handlers accept `{format, label}` (object) not `(format, label)` (positional). Every button onClick becomes an explicit `format: 'xxx'` literal in the JSX -- 13 matches in the hub file vs 4 with positional. The plan required >=6 for the grep gate; the object-arg refactor also makes future SendHubDialog RTL smoke tests trivial."
  - "WhatsApp dispatcher pulls `presentation_settings` in the same SELECT that already fetches all the formatter's fields. The formatted_text branch calls formatEstimateForWhatsApp with the presentation_settings arg (cast-with-fallback mirrors components/share/estimate-view.tsx:157-161). No separate query, no schema change."
  - "logDeliveryAction narrow-guards the input at the action boundary even though callers are TypeScript-typed. Server actions accept browser-shaped payloads and any TS-invariant assumption breaks under a hand-crafted POST. Invalid inputs return early with console.error -- non-throwing preserves the fire-and-forget contract."
  - "markAsSentAction's delivery insert lands BEFORE `revalidatePath` (per the plan text) so the revalidated view sees the new row. The 5 existing side effects (sent_at update, projects.status='sent', estimate_activity insert, Xphere sync) fire in the SAME order they did in 162 -- the delivery insert is strictly additive."
  - "PDF card's Download PDF fires logDeliveryAction BEFORE window.open. Rationale: an interrupted/errored download still records the intent. The `?deliveryLog=true` query param on the PDF route is a signal for a follow-up plan to self-log on the route side; today the client-side call is authoritative."
  - "Recipient sourcing: hub reads clientEmail/clientPhone props from the linked client. When null, a clear toast ('No email on file for this client' / 'No phone on file for this client') aborts the action. A modal-input flow can come later -- the SENDHUB-01 requirement is met when the happy-path button DOES the delivery."

patterns-established:
  - "Every new `estimate_deliveries.insert(...)` payload MUST use explicit `format: <value>` (not shorthand). The delivery-insert-format audit test's regex enforces it across all 4 sources (send/route.ts, send-sms/route.ts, lib/whatsapp/send-estimate.ts, lib/actions/estimate.ts); any 5th source added later fails CI if it uses shorthand."
  - "`effectiveDeliveryFormat` is the new SoT for WhatsApp branch selection. Any future dispatcher change reads `effectiveDeliveryFormat`, not `deliveryFormat`. The plain `deliveryFormat` var stays live for telemetry only."
  - "Server actions that log to `estimate_deliveries` on user-triggered client actions (copy/open/download) are named `logDeliveryAction` (singular). Not `insertDelivery` -- the intent is client-side telemetry, not a delivery send."

requirements-completed: [SENDHUB-02, SENDHUB-03]

# Metrics
duration: 16m 03s
completed: 2026-07-09
---

# Phase 163 Plan 05: Delivery-Action Wiring + WhatsApp Fallback Contract Summary

**Delivery-action end-to-end landed: every hub button now hits a real route or server action; every `estimate_deliveries` INSERT carries the widened `format` field; WhatsApp routes forward `format` all the way to `effectiveDeliveryFormat` so PDF / Plain Text ALWAYS fall back to a share_link body (never a `type: 'document'` payload); `markAsSentAction` gains a 6th delivery-log step without touching its 5 existing side effects; `logDeliveryAction` covers copy/open/download client-side telemetry. All 4 Wave 0 test scaffolds (delivery-insert-format, send-sms-format-fallback, send-estimate-format-fallback, send-hub-dialog contract) transition RED -> GREEN; hidden-regression sweep clean at 767/767.**

## Performance

- **Duration:** 16m 03s
- **Started:** 2026-07-09T00:35:05Z
- **Completed:** 2026-07-09T00:51:08Z
- **Tasks:** 3
- **Files modified:** 7 (0 created, 7 modified)

## Accomplishments

- **Task 1 (`13fb98fc`)** — Widened 4 backend files with the `format` field end-to-end:
  - `app/api/estimates/[id]/send/route.ts`: `SendRequestBody` interface adds `format?`; local const validates + defaults to `'online_link'`; both INSERT sites (191 failure + 208 success) now carry explicit `format: format`.
  - `app/api/estimates/[id]/send-sms/route.ts`: same shape. SMS body unchanged (already link-only). Both INSERT sites (119 + 136) carry `format`.
  - `app/api/estimates/[id]/send-whatsapp/route.ts` (**W-1 fix**): `SendWhatsAppRequestBody` interface extended; local const validates + defaults; `deliverEstimateViaWhatsApp({..., format})` call at line ~127 forwards the field.
  - `lib/whatsapp/send-estimate.ts`: `deliverEstimateViaWhatsApp` params gains `format?: SendFormat | null`; SELECT now pulls `presentation_settings`; new `effectiveDeliveryFormat` local at line 84 forces `share_link` for pdf/plain_text; all 3 downstream branches (`pdf_attachment` / `formatted_text` / else) read `effectiveDeliveryFormat`; `formatEstimateForWhatsApp` gets `presentation_settings` via cast-with-fallback (SENDHUB-04 formatted_text branch); both INSERT sites (123 + 147) carry `format: params.format ?? 'online_link'`.
- **Task 2 (`5dad5da1`)** — Extended `markAsSentAction` at `lib/actions/estimate.ts:733` with a 6th step (insert into `estimate_deliveries` with `{channel:'manual', format:null, provider:'client', status:'sent'}`) sequenced AFTER the 5 existing side effects (sent_at update, projects.status='sent', estimate_activity insert, Xphere sync) but BEFORE `revalidatePath`. Non-fatal try/catch so a log-write failure never regresses mark-as-sent. Added new `logDeliveryAction({estimateId, format, channel})` server action for `copy | open | download` client-side actions. Narrow-guards the input (server actions accept browser-shaped payloads); non-throwing; provider:'client'; verifies the estimate belongs to the caller's company (RLS also enforces).
- **Task 3 (`68c8a445`)** — Rewrote `components/workspace/send/send-hub-dialog.tsx` to replace every `placeholder(...)` onClick with a real handler:
  - **Online Estimate card**: Copy URL / Open URL now ALSO call `logDeliveryAction` fire-and-forget with `format:'online_link'` + `channel:'copy'|'open'`. Email/SMS/WhatsApp POST to the widened routes with `format:'online_link'` in the JSON body.
  - **PDF card**: Download PDF fires `logDeliveryAction({format:'pdf', channel:'download'})` BEFORE opening `/api/estimates/[id]/pdf?deliveryLog=true`. Email/SMS/WhatsApp POST with `format:'pdf'` — server-side fallback (Task 1) handles the byte-identical share-link delivery.
  - **Plain Text card**: Copy uses the SAME recipe as PlainTextSheet (resolvePresentationSettings + buildItemsBreakdown + resolveTemplate) then calls `logDeliveryAction({format:'plain_text', channel:'copy'})`. Email/SMS/WhatsApp POST with `format:'plain_text'`.
  - Refactored send handlers to `{format, label}` object args so every button onClick surfaces an explicit `format: 'xxx'` literal in the JSX (13 matches vs 4 with positional args) — makes RTL smoke tests trivial and satisfies the plan's ≥6 grep gate.
  - Recipient sourcing: `clientEmail` / `clientPhone` from props; null-check aborts with a clear toast.
  - Plus `plain-text-sheet.tsx`: the Copy button now also fires `logDeliveryAction({format:'plain_text', channel:'copy'})` after the clipboard write; failure swallowed silently (the copy already succeeded).
- **Wave 0 tests all transition RED -> GREEN:**
  - `tests/unit/estimate/delivery-insert-format.test.ts`: 4/4 audited files carry `format:` in every `estimate_deliveries.insert({...})` payload -> GREEN.
  - `tests/unit/api/send-sms-format-fallback.test.ts`: `format` present in send-sms route source -> GREEN.
  - `tests/unit/whatsapp/send-estimate-format-fallback.test.ts`: `format?:` + `effectiveDeliveryFormat` + `params.format === 'pdf'/'plain_text'` all matched -> GREEN.
  - `tests/unit/workspace/send-hub-dialog.test.tsx`: 6/6 static-grep assertions GREEN + 2 `it.todo` for future RTL smoke.
- **Hidden-regression sweep all GREEN (767 tests across 103 files):** `estimate-pdf-totals` + `estimate-pdf-modern-totals` (byte-identity fixtures), `whatsapp/formatter` (new nullable trailing arg + existing signature callers), `utils/estimate-template` (new nullable resolvedSettings arg), `presentation-settings-cross-surface` (4/4 across all 6 surfaces), `phase163-migration-contract` (4/4 dormant-first invariants), classic + modern share document tests. `markAsSentAction`'s 5 side effects untouched.
- **Typecheck clean:** `npx tsc --noEmit -p tsconfig.ci.json` exits 0 across all three commits.
- **No secret literals:** gitleaks pre-commit hook clean on every commit.

## Task Commits

1. **Task 1: Widen email/SMS/WhatsApp routes + dispatcher with format param + fallback** — `13fb98fc` (feat)
2. **Task 2: Extend markAsSentAction as 6th side effect + add logDeliveryAction** — `5dad5da1` (feat)
3. **Task 3: Wire SendHubDialog placeholders to routes + actions** — `68c8a445` (feat)

## Files Created/Modified

**Modified (7):**

- `app/api/estimates/[id]/send/route.ts` — `SendRequestBody` extended; `format` local var validated + defaulted; both INSERT payloads (191 failure + 208 success) carry explicit `format: format`.
- `app/api/estimates/[id]/send-sms/route.ts` — same shape; SMS body construction unchanged (already link-only across all 3 formats).
- `app/api/estimates/[id]/send-whatsapp/route.ts` — W-1 fix: interface widened, local const validated, `deliverEstimateViaWhatsApp({..., format})` forwarded.
- `lib/whatsapp/send-estimate.ts` — params interface widened with `format?: SendFormat | null`; new `SendFormat` export; SELECT now pulls `presentation_settings`; new `effectiveDeliveryFormat` local; 3 downstream branches swap to `effectiveDeliveryFormat`; `formatEstimateForWhatsApp` call in the formatted_text branch adds `presentation_settings` (cast-with-fallback); both INSERT sites carry `format: params.format ?? 'online_link'`.
- `lib/actions/estimate.ts` — `markAsSentAction` gains a 6th step (non-fatal `estimate_deliveries` insert); new `logDeliveryAction({estimateId, format, channel})` server action for copy/open/download.
- `components/workspace/send/send-hub-dialog.tsx` — every `placeholder(...)` onClick replaced with a real handler; send handlers take `{format, label}` object args so every button surfaces an explicit `format: 'xxx'` literal; Copy URL / Open URL / Download PDF / Copy Plain Text also fire `logDeliveryAction`.
- `components/workspace/send/plain-text-sheet.tsx` — imports `logDeliveryAction`; Copy button fires `logDeliveryAction({format:'plain_text', channel:'copy'})` fire-and-forget after clipboard write.

## Decisions Made

- **Explicit `format: format` in `estimate_deliveries` INSERT payloads.** The delivery-insert-format audit test (`tests/unit/estimate/delivery-insert-format.test.ts`) enforces `/\bformat\s*:/`. Shorthand `{format}` doesn't match. Converted all 6 INSERT sites to explicit key/value form. Convention documented in the summary's patterns-established.
- **Object-arg send handlers.** `sendEmail({format, label})` (not positional) so every button onClick surfaces `format: 'online_link' | 'pdf' | 'plain_text'` as an explicit JSX literal. 13 matches vs 4 with positional; well above the plan's ≥6 grep gate; RTL smoke tests can grep the JSX for `format: '\w+'` to find every send binding.
- **WhatsApp dispatcher pulls presentation_settings in the same SELECT** that already fetches the formatter's fields. The formatted_text branch passes it to `formatEstimateForWhatsApp` (cast-with-fallback mirrors `components/share/estimate-view.tsx:157-161`). No separate query, no schema change.
- **`logDeliveryAction` narrow-guards input at the action boundary.** Server actions accept browser-shaped payloads; a TS-typed caller cannot enforce runtime invariants on a hand-crafted POST. Invalid inputs return early with `console.error` — non-throwing preserves the fire-and-forget contract.
- **`markAsSentAction` insert lands BEFORE `revalidatePath`.** So the revalidated view sees the new row. The 5 existing side effects (sent_at update, projects.status='sent', estimate_activity insert, Xphere sync) fire in the SAME order.
- **PDF card's Download PDF fires logDeliveryAction BEFORE window.open.** An interrupted/errored download still records the intent. The `?deliveryLog=true` query param on the PDF route is a signal for a follow-up plan to self-log on the route side; today the client-side call is authoritative.
- **Recipient sourcing = clientEmail/clientPhone props with null-check toast.** A modal-input flow can come later; SENDHUB-01 is met when the happy-path button DOES the delivery.
- **`effectiveDeliveryFormat` swap-in doesn't delete `deliveryFormat`.** The account-wide preference stays live for telemetry — the dispatcher still knows what the account WANTED, even if the hub forced share_link. Any future logging/analytics can distinguish "account preferred pdf, hub forced share_link" from "account preferred share_link, hub sent share_link".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Object-property shorthand `{format}` doesn't satisfy the delivery-insert-format audit test**

- **Found during:** Task 1 verification (initial run showed 2 FAILs in `delivery-insert-format.test.ts`).
- **Issue:** The audit test's regex is `/\bformat\s*:/` — property-value shorthand (`{format}`) matches `\bformat\b` but NOT `\bformat\s*:`. First-pass code used shorthand at every INSERT site; test failed for send-sms/route.ts and would have failed for the other 3 too if not caught.
- **Fix:** Converted all 6 `estimate_deliveries.insert(...)` payloads to explicit `format: format`. Applies to: email failure (send/route.ts:191), email success (send/route.ts:208), SMS failure (send-sms/route.ts:119), SMS success (send-sms/route.ts:136), WhatsApp failure (send-estimate.ts:123 via `params.format ?? 'online_link'`), WhatsApp success (send-estimate.ts:147 same). markAsSentAction's insert uses `format: null` and logDeliveryAction's uses `format: input.format` — both already explicit.
- **Files modified:** `app/api/estimates/[id]/send/route.ts`, `app/api/estimates/[id]/send-sms/route.ts`.
- **Verification:** All 4 audited files GREEN in `tests/unit/estimate/delivery-insert-format.test.ts`.
- **Committed in:** Task 1 commit `13fb98fc` (fix rolled into the same commit as the primary edit).

**2. [Rule 3 - Blocking] Plan's acceptance grep (`format:\\s*'online_link'\\|'pdf'\\|'plain_text'` >= 6) required object-arg send handlers**

- **Found during:** Task 3 verification (initial positional-arg version returned 4 matches, below the ≥6 gate).
- **Issue:** With positional args (`sendEmail(format, label)`), the format value appears in the button onClick as a bare string (`sendEmail('online_link', 'Email link')`) — no `format:` key/value pair. Static grep for `format:\s*'...'` couldn't count these.
- **Fix:** Refactored send handlers to `{format, label}` object args. Each button onClick becomes `void sendEmail({ format: 'online_link', label: 'Email link' })` — an explicit `format: 'xxx'` literal. Final count: 13 matches in the hub file, comfortably above the ≥6 gate.
- **Files modified:** `components/workspace/send/send-hub-dialog.tsx` (9 button onClicks + 3 handler signatures).
- **Verification:** Grep returns 13; SendHubDialog contract test (`tests/unit/workspace/send-hub-dialog.test.tsx`) 6/6 GREEN.
- **Committed in:** Task 3 commit `68c8a445` (rolled into the primary edit).

**3. [Rule 3 - Blocking] Snapshot line-ending churn on document-alignment.test.tsx.snap**

- **Found during:** Task 3 verification sweep (vitest rewrote the snapshot with LF -> CRLF).
- **Issue:** Same known Windows line-ending churn seen in 163-03 and 163-04. vitest normalizes line endings; on Windows git treats LF snapshot content as needing conversion. The Task 3 file diff would have included a snapshot with no substantive change.
- **Fix:** `git checkout --` on the snapshot before committing, so the Task 3 commit stays scoped to the two real files (send-hub-dialog.tsx + plain-text-sheet.tsx).
- **Files modified:** none (snapshot restored to HEAD).
- **Verification:** `git status` clean of the snapshot before commit; PDF/document-alignment tests still GREEN in the full sweep.
- **Committed in:** N/A (avoided via restore).

---

**Total deviations:** 3 auto-fixed (1 bug [Rule 1], 2 blocking [Rule 3]).
**Impact on plan:** All fixes are surgical and preserve intent. The shorthand -> explicit format-property conversion is now a documented convention; the object-arg handler refactor is a strict improvement in test-friendliness; the snapshot churn is a known Windows-only issue previously observed in 163-03/163-04.

## Issues Encountered

- **Windows LF -> CRLF snapshot rewrite** (see Deviation #3 above). Restored via `git checkout --`; commit clean.
- **Windows line-ending warnings on staging** (`LF will be replaced by CRLF`) on every `git add` — cosmetic, no action needed.

## Known Stubs

None. Every hub button is wired to a real handler; every send call reaches a real dispatcher; every INSERT payload carries the widened `format` field. The `?deliveryLog=true` query param on the PDF route is a signal for a future plan to self-log on the route side, but the client-side `logDeliveryAction` call in the hub is authoritative today — the row lands whether or not the route self-logs.

## User Setup Required

**No environment variables, secrets, or dashboard configuration required for this plan.** The 20260709000001 migration (from 163-02) must be applied to any environment where the new INSERT payloads land — but Local Supabase runs it idempotently and the CI/CD ladder (GitHub Actions → GHCR → Coolify) picks it up on the next deploy.

**Optional owner UAT to run in staging:**

- Open a project's estimate → click Send → verify all 3 cards render with the expected button set.
- Copy URL / Open URL: verify a toast + a new `estimate_deliveries` row with `{channel:'copy'|'open', format:'online_link', provider:'client', status:'sent'}`.
- Download PDF: verify a new tab opens with the branded PDF AND a `{channel:'download', format:'pdf', provider:'client'}` row lands.
- Email (Online / PDF / Plain Text): verify Resend fires + a `{channel:'email', format:<choice>, provider:'resend'}` row lands.
- SMS (Online / PDF / Plain Text): verify Twilio fires with a link-only body BYTE-IDENTICAL across all 3 formats + a `{channel:'sms', format:<choice>, provider:'twilio'}` row lands.
- WhatsApp: with account configured for `pdf_attachment`, pick "PDF via WhatsApp" — verify Meta gets a `type:'text'` payload with the share link (NOT `type:'document'`) + a `{channel:'whatsapp', format:'pdf', provider:'meta'}` row lands. This is the SENDHUB-02 fallback contract.
- Mark as Sent: verify all 5 pre-163 side effects fire (sent_at update, projects.status='sent', estimate_activity 'estimate_marked_sent', Xphere sync, revalidatePath) AND a new `{channel:'manual', format:null, provider:'client', status:'sent'}` row lands.

## Next Phase Readiness

- **163-05 (this plan) complete.** SENDHUB-02 + SENDHUB-03 requirements met end-to-end. Every INSERT carries `format`; WhatsApp fallback contract honoured at the transport boundary; markAsSentAction gains its 6th delivery-log side effect without disturbing the 5 existing ones; client-side copy/open/download logged via logDeliveryAction.
- **163-06 (deletion sweep)** — unblocked. `send-dialog.tsx`, `send-form.tsx`, `send-actions-menu.tsx`, `send-tab.tsx`, `estimate-preview.tsx` all remain zero-external-consumer per 163-04's verification. Plan 06 grep-verifies + deletes.
- **PlainTextSheet stays.** 163-06 may revisit whether the sheet's editor UI folds into the hub, but its current signature (Copy button now fires `logDeliveryAction`) is aligned with the hub's model. No structural rework needed.
- **No blockers.**

## Self-Check: PASSED

Verified via absolute-path existence + git-log grep + vitest sweep + tsc + grep counts:

- FOUND: `C:/Users/Vanildo/Dev/xtimator/app/api/estimates/[id]/send/route.ts` modified (Task 1)
- FOUND: `C:/Users/Vanildo/Dev/xtimator/app/api/estimates/[id]/send-sms/route.ts` modified (Task 1)
- FOUND: `C:/Users/Vanildo/Dev/xtimator/app/api/estimates/[id]/send-whatsapp/route.ts` modified (Task 1)
- FOUND: `C:/Users/Vanildo/Dev/xtimator/lib/whatsapp/send-estimate.ts` modified (Task 1)
- FOUND: `C:/Users/Vanildo/Dev/xtimator/lib/actions/estimate.ts` modified (Task 2)
- FOUND: `C:/Users/Vanildo/Dev/xtimator/components/workspace/send/send-hub-dialog.tsx` modified (Task 3)
- FOUND: `C:/Users/Vanildo/Dev/xtimator/components/workspace/send/plain-text-sheet.tsx` modified (Task 3)
- FOUND: commit `13fb98fc` (Task 1) in `git log`
- FOUND: commit `5dad5da1` (Task 2) in `git log`
- FOUND: commit `68c8a445` (Task 3) in `git log`
- FOUND: `npx vitest run tests/unit/estimate/delivery-insert-format.test.ts` = 4/4 GREEN
- FOUND: `npx vitest run tests/unit/api/send-sms-format-fallback.test.ts` = 1 assertion GREEN + 2 it.todo
- FOUND: `npx vitest run tests/unit/whatsapp/send-estimate-format-fallback.test.ts` = 2 assertions GREEN + 2 it.todo
- FOUND: `npx vitest run tests/unit/workspace/send-hub-dialog.test.tsx` = 6/6 GREEN + 2 it.todo
- FOUND: Full sweep `tests/unit/workspace/ tests/unit/estimate/ tests/unit/pdf/ tests/unit/whatsapp/ tests/unit/utils/estimate-template.test.ts tests/unit/api/ tests/unit/actions/ tests/unit/db/` = 767 passed / 18 todo / 0 failed
- FOUND: `npx tsc --noEmit -p tsconfig.ci.json` exit 0
- FOUND: `grep -c "placeholder(" components/workspace/send/send-hub-dialog.tsx` = 0
- FOUND: `grep -c "logDeliveryAction" components/workspace/send/send-hub-dialog.tsx` = 9
- FOUND: `grep -Ec "fetch.*api/estimates.*send" components/workspace/send/send-hub-dialog.tsx` = 3
- FOUND: `grep -Ec "format:\s*'(online_link|pdf|plain_text)'" components/workspace/send/send-hub-dialog.tsx` = 13
- FOUND: `grep -c "logDeliveryAction" components/workspace/send/plain-text-sheet.tsx` = 2
- FOUND: `grep -c "effectiveDeliveryFormat" lib/whatsapp/send-estimate.ts` = 4
- FOUND: `grep -c "params\.format" lib/whatsapp/send-estimate.ts` = 3
- FOUND: `grep -c "channel: 'manual'" lib/actions/estimate.ts` = 2 (comment + insert)
- FOUND: `grep -c "provider: 'client'" lib/actions/estimate.ts` = 3
- FOUND: `grep -c "estimate_deliveries" lib/actions/estimate.ts` = 4
- FOUND: gitleaks pre-commit hook: `no leaks found` on all 3 commits
- FOUND: hidden-regression `i.description.trim()` filter still present in `components/workspace/estimate/estimate-document.tsx` (WRAPPED not REPLACED, per 163-03's convention)

---
*Phase: 163-format-first-send-hub-cross-surface-settings-rollout*
*Completed: 2026-07-09*
