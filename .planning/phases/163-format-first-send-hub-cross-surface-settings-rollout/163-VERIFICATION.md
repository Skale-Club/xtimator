---
phase: 163-format-first-send-hub-cross-surface-settings-rollout
verified: 2026-07-08T21:26:00Z
status: human_needed
score: 6/6 must-haves verified (automated)
human_verification:
  - test: "Hub end-to-end with real credentials"
    expected: "Owner opens editor -> Send -> walks each format's actions (copy, open, email, SMS, WhatsApp, download); each delivery lands in estimate_deliveries with the correct {format, channel, provider}"
    why_human: "Requires seeded estimate + live Supabase/Twilio/Meta/Resend creds; not verifiable via unit tests"
  - test: "Cross-surface parity in real rendered output"
    expected: "Toggling each presentation_settings.sections.* in the gear panel produces identical visibility across Classic PDF / Modern PDF / Classic share / Modern share / Plain Text / WhatsApp"
    why_human: "Automated cross-surface test proves visibility gates fire; human confirms rendering looks right across all 6 surfaces (visual + copy fidelity)"
  - test: "Mobile hub UX at 360/390/430px"
    expected: "3 format cards stack cleanly; all buttons >= 44px touch target; Mark as Sent + LanguageFlagChip remain visible + accessible"
    why_human: "Touch-target ergonomics on real iOS Safari + Android Chrome; not testable via jsdom"
---

# Phase 163: Format-First Send Hub + Cross-Surface Settings Rollout Verification Report

**Phase Goal:** A format-first Send hub (Online Estimate / PDF / Plain Text) fully replaces the channel-first Email/SMS tabs and the separate Share & Export menu, and the Phase 161 settings resolver is wired into every remaining render/format path so a single presentation-settings toggle is honored identically everywhere a client can view the estimate.
**Verified:** 2026-07-08T21:26:00Z
**Status:** human_needed — all automated must-haves verified; three UAT items deferred per phase VALIDATION strategy.

## Goal Achievement

### Observable Truths (SENDHUB-XX)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SENDHUB-01 | Send opens a hub with 3 primary format cards; no channel-first Email/SMS tabs; no separate "Share & Export" menu | VERIFIED | `components/workspace/send/send-hub-dialog.tsx` lines 338/402/456 carry testids `send-hub-card-online-link|pdf|plain-text`; `estimate-tab.tsx:16,184` imports + mounts `<SendHubDialog>`; 5 legacy files deleted (see #SENDHUB-01 sweep); Wave 0 contract test 6/6 GREEN |
| SENDHUB-02 | PDF/Plain Text via SMS/WhatsApp falls back to the Online Estimate link (never `type:'document'`) | VERIFIED | `lib/whatsapp/send-estimate.ts:99-102` `effectiveDeliveryFormat` forces `share_link` when `params.format ∈ {pdf, plain_text}`; `type:'document'` sent ONLY inside `if (effectiveDeliveryFormat === 'pdf_attachment')` branch (line 120-129); Wave 0 fallback tests GREEN |
| SENDHUB-03 | `estimate_deliveries` records `format` + widened `channel` (adds copy/open/download/manual) + widened `provider` (adds `client`) | VERIFIED | `supabase/migrations/20260709000001_phase163_send_hub_delivery_schema.sql` adds nullable `format` + widens both CHECKs (dormant-first, no backfill); all 8 `.from('estimate_deliveries').insert({...})` payloads carry explicit `format:` key; migration-contract test 4/4 GREEN; delivery-insert-format test 4/4 GREEN |
| SENDHUB-04 | Resolver wired into every render/format path (6 surfaces) | VERIFIED | grep confirms `resolvePresentationSettings` imported + called in all 6 files (see table below); cross-surface structural-grep test D GREEN |
| SENDHUB-05 | Cross-surface parity for a single presentation-settings toggle (identical across 6 outputs) | VERIFIED | `tests/unit/estimate/presentation-settings-cross-surface.test.tsx` 4/4 GREEN (parity A + B + retrocompat C + structural grep D) |
| SENDHUB-06 | `Mark as Sent` + language selection remain in the hub as visually-subordinate secondary actions | VERIFIED | `send-hub-dialog.tsx:518-534` renders `Mark as sent` as ghost button in footer border-top divider; `LanguageFlagChip` imported at line 44 + rendered at line 324 in the header; `<Tabs>` import absent (verified by contract test) |

**Score:** 6/6 truths verified.

### Cross-Surface Resolver Rollout (6 renderers)

| Renderer | Resolver Import | Resolver Call | Status |
|----------|----------------|---------------|--------|
| `components/pdf/estimate-pdf.tsx` | line 18 | line 468 | WIRED |
| `components/pdf/estimate-pdf-modern.tsx` | line 18 | line 480 | WIRED |
| `components/share/estimate-document-modern.tsx` | line 8 | line 210 | WIRED |
| `components/workspace/estimate/estimate-document.tsx` | line 49 | line 1592 | WIRED (Phase 162 base + Phase 163 line-1602 gate close) |
| `lib/whatsapp/formatter.ts` | line 15 | line 148 | WIRED |
| `lib/utils/estimate-template.ts` | line 10 | line 100 | WIRED |

### Line-1602 Wrap (WRAP not REPLACE)

`components/workspace/estimate/estimate-document.tsx:1601-1614`:

```
1608:  const visibleSections = isEditable
1609:    ? data.sections
1610:    : isSectionVisible(resolvedSettings, 'sections')
1611:      ? data.sections
1612:          .map((s) => ({ ...s, items: s.items.filter((i) => i.description.trim() !== '') }))
1613:          .filter((s) => s.items.length > 0)
1614:      : []
```

- Existing `.filter((i) => i.description.trim() !== '')` empty-item filter PRESENT (line 1612).
- Wrapped by `isSectionVisible(resolvedSettings, 'sections')` ternary — NOT replaced.
- `isEditable` branch stays unwrapped (Phase 162 editor-usability precedent).

### W-1 Route Forwarding

`app/api/estimates/[id]/send-whatsapp/route.ts`:
- Line 17: interface field `format?: 'online_link' | 'pdf' | 'plain_text'`
- Line 51: `const format = (body.format ?? 'online_link')` + validation at line 52
- Line 139: `deliverEstimateViaWhatsApp({..., format})` forwards the field

### SENDHUB-02 WhatsApp Fallback

`lib/whatsapp/send-estimate.ts:99-102`:

```
99:  const effectiveDeliveryFormat: DeliveryFormat =
100:    (params.format === 'pdf' || params.format === 'plain_text')
101:      ? 'share_link'
102:      : deliveryFormat
```

- `type: 'document'` payload guarded by `if (effectiveDeliveryFormat === 'pdf_attachment')` (line 120) — for pdf/plain_text, `effectiveDeliveryFormat === 'share_link'` so the else branch (line 156-158) sends `type: 'text'` with the share link.

### markAsSentAction (6 side effects, order preserved)

`lib/actions/estimate.ts:733-804`:

| # | Side Effect | Line | Status |
|---|-------------|------|--------|
| 1 | `estimates.update({ sent_at, share_expires_at })` | 752-755 | PRESERVED |
| 2 | `projects.update({ status: 'sent' })` | 760-763 | PRESERVED |
| 3 | `estimate_activity.insert({event_type:'estimate_marked_sent',...})` | 766-772 | PRESERVED |
| 4 | `dispatchXphereSync(companyId, 'estimate.sent')` | 775 | PRESERVED |
| 5 | (Phase 163 ADDED) `estimate_deliveries.insert({channel:'manual', format:null, provider:'client', status:'sent'})` | 786-800 | ADDED |
| 6 | `revalidatePath(...)` | 802 | PRESERVED, still last |

The added 6th step lands AFTER the 4 pre-163 side effects but BEFORE `revalidatePath`, exactly as planned. Try/catch wrapper makes it non-fatal so a log-write failure never regresses mark-as-sent.

### estimate_deliveries INSERT payloads (all carry `format:`)

| File:Line | Channel | Format |
|-----------|---------|--------|
| `lib/whatsapp/send-estimate.ts:161` | whatsapp (failure) | `params.format ?? 'online_link'` |
| `lib/whatsapp/send-estimate.ts:186` | whatsapp (success) | `params.format ?? 'online_link'` |
| `app/api/estimates/[id]/send-sms/route.ts:132` | sms (failure) | `format` |
| `app/api/estimates/[id]/send-sms/route.ts:150` | sms (success) | `format` |
| `app/api/estimates/[id]/send/route.ts:205` | email (failure) | `format` |
| `app/api/estimates/[id]/send/route.ts:223` | email (success) | `format` |
| `lib/actions/estimate.ts:786` | manual | `null` |
| `lib/actions/estimate.ts:866` | copy/open/download | `input.format` |

All 8 sites carry explicit `format: <value>` (not shorthand), satisfying `/\bformat\s*:/`.

### Deletion Sweep (5 dead files gone)

- `components/workspace/send/send-dialog.tsx` — DELETED
- `components/workspace/send/send-form.tsx` — DELETED
- `components/workspace/send/send-actions-menu.tsx` — DELETED
- `components/workspace/send/send-tab.tsx` — DELETED
- `components/workspace/send/estimate-preview.tsx` — DELETED

Kebab-case sweep `grep -r 'send-dialog|send-form|send-actions-menu|send-tab|estimate-preview' components/ app/ lib/ tests/` returns **0 hits**.

Surviving `components/workspace/send/` tree = exactly 3 files: `language-flag-chip.tsx`, `plain-text-sheet.tsx`, `send-hub-dialog.tsx`.

### Hidden-Regression Tests

| Test File | Result |
|-----------|--------|
| `tests/unit/pdf/estimate-pdf-totals.test.tsx` | GREEN |
| `tests/unit/pdf/estimate-pdf-modern-totals.test.tsx` | GREEN |
| `tests/unit/whatsapp/formatter.test.ts` | GREEN |
| `tests/unit/utils/estimate-template.test.ts` | GREEN |

Aggregate: **4 test files, 36 tests, 36 passed, 0 failed** (`Duration 2.73s`).

### Phase 163 Wave 0 Tests

| Test File | Result |
|-----------|--------|
| `tests/unit/estimate/presentation-settings-cross-surface.test.tsx` | 4/4 GREEN |
| `tests/unit/estimate/delivery-insert-format.test.ts` | 4/4 GREEN |
| `tests/unit/db/phase163-migration-contract.test.ts` | 4/4 GREEN |
| `tests/unit/api/send-sms-format-fallback.test.ts` | GREEN + 2 todo |
| `tests/unit/whatsapp/send-estimate-format-fallback.test.ts` | GREEN + 2 todo |
| `tests/unit/workspace/send-hub-dialog.test.tsx` | 6/6 GREEN + 2 todo |

Aggregate: **6 test files, 21 passed, 6 todo, 0 failed** (`Duration 6.14s`).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SENDHUB-01 | 163-04 (build), 163-06 (deletion) | Hub with 3 format cards, no channel-first tabs, no Share & Export menu | SATISFIED | Contract test 6/6 GREEN; 5 legacy files deleted; grep sweep clean |
| SENDHUB-02 | 163-05 | PDF/Plain Text via SMS/WhatsApp falls back to share link | SATISFIED | `effectiveDeliveryFormat` branch present; `type:'document'` guarded; Wave 0 fallback tests GREEN |
| SENDHUB-03 | 163-02 (migration), 163-05 (INSERTs) | `estimate_deliveries.format` + widened channel + provider | SATISFIED | Migration DDL present; all 8 INSERT payloads carry `format:`; migration-contract test GREEN |
| SENDHUB-04 | 163-03 | Resolver in every render/format path (6 renderers) | SATISFIED | All 6 files import + call `resolvePresentationSettings`; structural-grep test D GREEN |
| SENDHUB-05 | 163-01 (RED), 163-03 (GREEN) | Cross-surface parity for single toggle | SATISFIED | `presentation-settings-cross-surface.test.tsx` 4/4 GREEN across all 6 surfaces |
| SENDHUB-06 | 163-04 | Mark as Sent + LanguageFlagChip subordinate secondary | SATISFIED | Ghost button in footer + language chip in header; contract test GREEN |

No orphaned requirement IDs. REQUIREMENTS.md map lists exactly SENDHUB-01..-06 for Phase 163 and all are marked Complete.

### Anti-Patterns Found

None. Wave 3 Task 3 confirmed `grep -c "placeholder(" components/workspace/send/send-hub-dialog.tsx` = 0; every button has a real handler; every send call reaches a real dispatcher; every INSERT payload carries `format`.

### Human Verification Required

1. **Hub end-to-end with real credentials**
   - Test: Owner opens editor -> Send -> walks each format card's actions (Copy URL, Open URL, Email, SMS, WhatsApp, Download PDF, Copy Plain Text).
   - Expected: Toast confirms each action; `estimate_deliveries` gains a row with the correct `{channel, format, provider}` triple (e.g. `{copy, online_link, client}`, `{download, pdf, client}`, `{email, plain_text, resend}`, `{whatsapp, pdf, meta}` with `type:'text'` not `type:'document'`, `{manual, null, client}` from Mark as Sent).
   - Why human: Requires seeded estimate + live Supabase/Twilio/Meta/Resend creds; unit tests mock the transport.

2. **Cross-surface parity end-to-end**
   - Test: Toggle each `presentation_settings.sections.*` in the gear panel; render Classic PDF, Modern PDF, Classic share page, Modern share page, Plain Text preview, WhatsApp formatted message.
   - Expected: All 6 surfaces reflect the same visibility state for every gated section (summary, sections, payment_terms, timeline, warranty_terms, notes, photos).
   - Why human: Automated test proves the visibility gates fire; human confirms rendered output looks right (typography, spacing, copy fidelity, empty-container handling).

3. **Mobile hub UX at 360/390/430px**
   - Test: Open hub in DevTools mobile emulation + real iOS Safari + Android Chrome at 360/390/430px viewports.
   - Expected: 3 format cards stack cleanly (single column on mobile, 3 columns on desktop); all buttons >= 44px touch target; Mark as Sent + LanguageFlagChip remain visible + accessible; no horizontal overflow.
   - Why human: Touch-target ergonomics on real devices — jsdom cannot measure computed touch geometry.

### Gaps Summary

None. All automated must-haves verified. Three UAT items remain per the phase VALIDATION strategy's Manual-Only Verifications table — these are the expected human-only checks for a UI + delivery-pipeline rework phase.

---

*Verified: 2026-07-08T21:26:00Z*
*Verifier: Claude (gsd-verifier)*
