---
phase: 163
slug: format-first-send-hub-cross-surface-settings-rollout
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-08
---

# Phase 163 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `163-RESEARCH.md` ("Validation Architecture" section).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `^4.1.4` + `@testing-library/react` `^16.3.2` (unit/component) + jsdom |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/estimate/presentation-settings-cross-surface.test.tsx tests/unit/estimate/delivery-insert-format.test.ts` |
| **Full suite command** | `npm test` (unit) |
| **Estimated runtime** | ~10s quick; ~90s full unit |

---

## Sampling Rate

- **Per task commit:** quick command above (~10s)
- **Per wave merge:** `npx vitest run tests/unit/estimate tests/unit/pdf tests/unit/whatsapp tests/unit/utils/estimate-template.test.ts tests/unit/workspace` (~30s)
- **Phase gate:** `npm test` full unit sweep before verification
- **Max feedback latency:** 20s per task, 90s per wave.

---

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File Exists |
|-----|----------|-----------|-------------------|-------------|
| SENDHUB-01 | Send opens hub with 3 format cards (Online Estimate/PDF/Plain Text); no channel-first tabs, no "Share & Export" menu | integration (RTL) | `npx vitest run tests/unit/workspace/send-hub-dialog.test.tsx` | ❌ W0 |
| SENDHUB-02 | SMS `format=pdf`/`plain_text` → link body (byte-identical to `format=online_link`) | integration (mock Twilio) | `npx vitest run tests/unit/api/send-sms-format-fallback.test.ts` | ❌ W0 |
| SENDHUB-02 | WhatsApp same fallback semantics — no attachment attempt for pdf/plain_text | integration (mock Meta) | `npx vitest run tests/unit/whatsapp/send-estimate-format-fallback.test.ts` | ❌ W0 |
| SENDHUB-03 | Every `estimate_deliveries` INSERT payload includes `format` field | unit (static grep) | `npx vitest run tests/unit/estimate/delivery-insert-format.test.ts` | ❌ W0 |
| SENDHUB-03 | Migration adds `format` column + widens `channel` CHECK to include copy/open/download/manual + widens `provider` CHECK to include `client` | unit (migration contract) | `npx vitest run tests/unit/db/phase163-migration-contract.test.ts` | ❌ W0 |
| SENDHUB-04 | All 6 renderers import `resolvePresentationSettings`; each function gates section visibility on the resolver | unit (structural grep + PDF tree-walk) | `npx vitest run tests/unit/estimate/presentation-settings-cross-surface.test.tsx` | ❌ W0 |
| SENDHUB-05 | Single `presentation_settings.sections.sections = false` toggle hides item descriptions across ALL 6 surfaces; `null` retrocompat = byte-identical to today | unit (JSX render + PDF tree-walk + string) | (same file as SENDHUB-04) | ❌ W0 |
| SENDHUB-06 | Hub renders `<Mark as Sent>` (calls `markAsSentAction`) + `<LanguageFlagChip>` visible | integration (RTL, mock action) | `npx vitest run tests/unit/workspace/send-hub-mark-as-sent.test.tsx` (or folded into SENDHUB-01 test) | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/estimate/_pdf-text-walker.ts` — extract `collectTextNodes`/`flattenText` from `tests/unit/pdf/estimate-pdf-totals.test.tsx:22-51` (shared helper for cross-surface test)
- [ ] `tests/unit/estimate/presentation-settings-cross-surface.test.tsx` — covers SENDHUB-04 + SENDHUB-05
- [ ] `tests/unit/estimate/delivery-insert-format.test.ts` — static grep for `format:` in every `estimate_deliveries.insert({...})`
- [ ] `tests/unit/db/phase163-migration-contract.test.ts` — parses new migration; asserts columns + CHECK widenings
- [ ] `tests/unit/api/send-sms-format-fallback.test.ts` — SMS byte-identical body across all 3 formats
- [ ] `tests/unit/whatsapp/send-estimate-format-fallback.test.ts` — WhatsApp: `type: 'text'` share-link body for pdf/plain_text (NOT `type: 'document'`)
- [ ] `tests/unit/workspace/send-hub-dialog.test.tsx` — SENDHUB-01 + SENDHUB-06 (may fold into one file)

*Framework already installed — no `npm install` needed.*

---

## Hidden Regressions the Plan MUST Guard Against

- **Classic PDF byte-identity for `presentation_settings: null`** — `tests/unit/pdf/estimate-pdf-totals.test.tsx` MUST stay green.
- **Modern PDF byte-identity** — `tests/unit/pdf/estimate-pdf-modern-totals.test.tsx` MUST stay green.
- **WhatsApp formatter test** — `tests/unit/whatsapp/formatter.test.ts` MUST stay green with new nullable trailing `presentation_settings?` arg.
- **Plain-text template test** — `tests/unit/utils/estimate-template.test.ts` MUST stay green with `buildItemsBreakdown`'s new nullable second arg.
- **`markAsSentAction`'s 5 side effects** (sent_at, share_expires_at, projects.status, estimate_activity, Xphere sync, revalidatePath) MUST all still fire — Phase 163 ADDS an `estimate_deliveries` insert, does NOT remove or reorder.
- **Classic renderer's Phase 162 gates** (summary/payment_terms/timeline/warranty_terms/notes/photos) MUST stay wired — the cross-surface test exercises this.
- **`estimate-document.tsx:1602` line-items block** — MUST wrap (not replace) the existing empty-item filter with `isSectionVisible(resolvedSettings, 'sections')`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Hub end-to-end with real client | SENDHUB-01/02/03/06 | Requires seeded estimate + live Supabase/Twilio/Meta creds | Owner opens editor, clicks Send, walks each format's actions (copy, open, email, SMS, WhatsApp, download), confirms deliveries logged to `estimate_deliveries` with correct `format`+`channel`. |
| Cross-surface parity end-to-end | SENDHUB-04/SENDHUB-05 | Automated test proves visibility, but human confirms rendering "looks right" across all 6 surfaces | Toggle each `presentation_settings.sections.*` in the gear panel, verify each of: PDF download / Online share / Plain Text preview / WhatsApp message all reflect the same visibility state. |
| Mobile hub UX | SENDHUB-01/06 | Touch-target ergonomics on real iOS Safari / Android Chrome | Open hub at 360/390/430px; confirm 3 format cards stack cleanly; buttons ≥44px; `Mark as Sent` + LanguageFlagChip visible + accessible. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency <20s per task
- [ ] `nyquist_compliant: true` set in frontmatter (flip after gsd-planner emits plans)

**Approval:** pending — awaiting `gsd-planner` output.
