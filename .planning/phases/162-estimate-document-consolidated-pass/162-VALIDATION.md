---
phase: 162
slug: estimate-document-consolidated-pass
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-08
---

# Phase 162 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `162-RESEARCH.md` ("Validation Architecture" section).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `^4.1.4` + `@testing-library/react` `^16.3.2` (unit/component) + `@playwright/test` `^1.59.1` (visual/e2e) |
| **Config file** | `vitest.config.ts` (unit) + `playwright.config.ts` (e2e) |
| **Quick run command** | `npx vitest run tests/unit/components/presentation-settings-panel.test.tsx tests/unit/clients/client-picker.test.tsx tests/unit/estimate/inline-project-name.test.tsx tests/unit/estimate/document-bill-to.test.tsx tests/unit/estimate/document-alignment.test.tsx tests/unit/estimate/mobile-line-item.test.tsx` |
| **Full suite command** | `npm test` (unit) + `npm run test:e2e -- tests/e2e/visual/share.spec.ts` (visual, on demand) |
| **Estimated runtime** | ~15s unit; ~90s e2e (share visual) — visual only re-run when 3a alignment ships |

---

## Sampling Rate

- **After every task commit:** Run the phase's quick command (above). Latency <20s.
- **After every plan wave:** Run `npm test` (full unit). Latency ~90s.
- **Before `/gsd:verify-work`:** Full suite must be green.
- **Max feedback latency:** 20s per task, 90s per wave.

---

## Per-Task Verification Map

> Rows are keyed to the DOCUX-01..07 requirements + the per-plan concrete acceptance criteria. Plans (162-01..N) will resolve `Task ID` / `Plan` / `Wave` when the planner emits them; the target Test Type / Command / File Exists columns are locked here.

| Req | Behavior | Test Type | Automated Command | File Exists |
|-----|----------|-----------|-------------------|-------------|
| DOCUX-01 | Gear icon opens PresentationSettingsPanel (Popover ≥768px, Sheet <768px) | unit (RTL, matchMedia mock) | `npx vitest run tests/unit/components/presentation-settings-panel.test.tsx -t "responsive branch"` | ❌ W0 |
| DOCUX-01 | Panel toggle dispatches ONLY `UPDATE_PRESENTATION_SETTINGS` (never UPDATE_TAX_RATE/UPDATE_DISCOUNT/UPDATE_DEPOSIT/recalculate) — GUARD-03 | unit (static grep) | `test -z "$(grep -E 'UPDATE_TAX_RATE\|UPDATE_DISCOUNT\|UPDATE_DEPOSIT\|recalculate' components/workspace/estimate/presentation-settings-panel.tsx)"` | ❌ W0 |
| DOCUX-01 | PRESENT-05 notice renders when `sent_at` OR `viewed_at` non-null | unit (RTL) | `npx vitest run tests/unit/components/presentation-settings-panel.test.tsx -t "sent or viewed"` | ❌ W0 |
| DOCUX-02 | Bill To pencil hidden by default, revealed on hover/focus of the block, opens ClientPicker Popover | unit (RTL) | `npx vitest run tests/unit/estimate/document-bill-to.test.tsx -t "pencil hover"` | ❌ W0 |
| DOCUX-02 | Selecting a client in the popover dispatches `linkProjectToClient` (mocked) | unit (RTL, mock server action) | `npx vitest run tests/unit/estimate/document-bill-to.test.tsx -t "linkProjectToClient"` | ❌ W0 |
| DOCUX-02 | Unlink footer button in `variant='billTo'` calls `unlinkProjectFromClient` | unit (RTL, mock server action) | `npx vitest run tests/unit/clients/client-picker.test.tsx -t "unlink"` | ❌ W0 |
| DOCUX-03 | Grep-verifiable: NO `LinkClientInline`/`LinkClientButton`/`LinkClientCard` references outside `components/clients/client-picker.tsx` | unit (static grep) | `test -z "$(grep -rE 'LinkClientInline\|LinkClientButton\|LinkClientCard' components/ app/ lib/ \| grep -v 'client-picker.tsx')"` | ❌ W0 |
| DOCUX-03 | `<ClientPicker variant="button">` / `variant="card">` / `variant="inline">` / `variant="billTo">` all render | unit (RTL) | `npx vitest run tests/unit/clients/client-picker.test.tsx` | ❌ W0 |
| DOCUX-04 | `InlineProjectName` DOM contains `border-b` and NOT `decoration-dotted` | unit (RTL class assertion) | `npx vitest run tests/unit/estimate/inline-project-name.test.tsx -t "solid underline"` | ❌ W0 |
| DOCUX-04 | Empty submit / >200 char submit / server error each surfaces toast + preserves edit-mode + reverts draft on error | unit (RTL, mock toast + mock action) | `npx vitest run tests/unit/estimate/inline-project-name.test.tsx` | ❌ W0 |
| DOCUX-05 | Section-scoped surfaces align to `px-6 sm:px-10` (not `px-3`) | unit (RTL class assertion) | `npx vitest run tests/unit/estimate/document-alignment.test.tsx -t "section padding"` | ❌ W0 |
| DOCUX-05 | `EstimateDocument mode="view"` DOM snapshot stable post-alignment | unit (RTL `toMatchSnapshot`) | `npx vitest run tests/unit/estimate/document-alignment.test.tsx -t "view mode DOM"` | ❌ W0 |
| DOCUX-05 | Visual: 3 viewports (mobile/tablet/desktop) × 3 languages (en/pt/es) = 9 share-page baselines (intentionally regenerated) | e2e visual | `npx playwright test tests/e2e/visual/share.spec.ts` | ⚠️ manual review; baseline regen = intentional Phase 162 artifact |
| DOCUX-06 | Mobile line-item row does NOT wrap in a `<Card variant="glass">`; uses `INLINE_INPUT_CLS` transparent inputs | unit (RTL class assertion) | `npx vitest run tests/unit/estimate/mobile-line-item.test.tsx` | ❌ W0 |
| DOCUX-06 | Touch targets preserved: `min-h-[44px]` on interactive containers | unit (RTL class assertion) | `npx vitest run tests/unit/estimate/mobile-line-item.test.tsx -t "touch targets"` | ❌ W0 |
| DOCUX-06 | 360/390/430px visual UAT — no clipping, no touch regression | e2e visual OR manual | `npx playwright test tests/e2e/visual/workspace.spec.ts` | ⚠️ MANUAL (visual UAT) |
| DOCUX-07 | `section-card.tsx` + `item-row.tsx` files do not exist | unit (static file check) | `test ! -f components/workspace/estimate/section-card.tsx && test ! -f components/workspace/estimate/item-row.tsx` | ❌ W0 |
| DOCUX-07 | Grep: NO `section-card` / `item-row` string in `components/`, `app/`, `lib/`, `tests/` (excluding archive backups) | unit (static grep) | `test -z "$(grep -rE 'section-card\|item-row' components/ app/ lib/ tests/ \| grep -v '\.deleted\|\.bak')"` | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 is the test-scaffolding wave — creates each empty/stub test file so downstream plans can drive them RED→GREEN.

- [ ] `tests/unit/components/presentation-settings-panel.test.tsx` — stubs for DOCUX-01
- [ ] `tests/unit/clients/client-picker.test.tsx` — stubs for DOCUX-02/DOCUX-03
- [ ] `tests/unit/estimate/document-bill-to.test.tsx` — stubs for DOCUX-02
- [ ] `tests/unit/estimate/inline-project-name.test.tsx` — stubs for DOCUX-04
- [ ] `tests/unit/estimate/document-alignment.test.tsx` — stubs for DOCUX-05 (`toMatchSnapshot` baseline captured after 3a alignment pass)
- [ ] `tests/unit/estimate/mobile-line-item.test.tsx` — stubs for DOCUX-06
- [ ] `tests/e2e/visual/share.spec.ts` — existing; baselines intentionally regenerated during 3a plan

*Framework already installed — no `npm install` needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Alignment pass — visual check across languages at 3 viewports | DOCUX-05 | Pixel-fidelity impossible to grep; playwright baselines are regenerated intentionally in this phase | Open share page for a seeded estimate in en / pt / es at 360 / 768 / 1440 px; visually confirm no accidental offset/clipping. |
| Mobile line-item editor at 360 / 390 / 430 px viewports | DOCUX-06 | Touch-target ergonomics + text-clipping are human-eye evaluations | Open estimate editor at each viewport in iOS Safari / Android Chrome (or Chrome DevTools device toolbar). Confirm each row: no clipping, ≥44px tap targets, no glass-card wrapper, matches desktop table language. |
| Bill To pencil + client-picker end-to-end | DOCUX-02 | Requires live estimate + real client search | Owner opens an estimate with a client → hovers Bill To → sees pencil → clicks → sees ClientPicker Popover → searches / switches / unlinks → confirms Bill To updates without page reload. |
| Gear icon + settings panel end-to-end | DOCUX-01 | Requires live editor + tax/discount/deposit override interaction | Owner opens editor → sees Gear icon on LEFT of pill (`[Gear] Photos ... Send`) → clicks → panel opens (Popover desktop / Sheet mobile) → toggles each control → confirms server saves via next page reload (state persists). |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency <20s per task
- [ ] `nyquist_compliant: true` set in frontmatter (flip after gsd-planner emits plans)

**Approval:** pending — awaiting `gsd-planner` output. Once plans emit Wave 0 stubs + Wave 1+ task IDs, flip `nyquist_compliant: true` and `wave_0_complete: true` at plan-time.
