# Phase 163: Format-First Send Hub & Cross-Surface Settings Rollout — Research

**Researched:** 2026-07-08
**Domain:** UI rework (dialog composition) + cross-file resolver rollout + additive DB migration
**Confidence:** HIGH (all findings verified by direct file:line evidence in the repo)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Three primary format choices:** Online Estimate (default) / PDF / Plain Text. Nothing else at top level.
- **Old surfaces GONE:** channel-first Email + SMS tabs, separate "Share & Export" menu — deleted, not hidden.
- **Fallback rule for non-online formats over messenger channels:** SMS / WhatsApp deliveries for PDF or Plain Text ship the Online Estimate URL instead of an attachment payload (SENDHUB-02, explicit no-new-channel).
- **Cross-surface parity is testable:** a dedicated integration/verification test proves toggling a single presentation-settings option produces identical section visibility across all 6 output surfaces (SENDHUB-04). Editor preview parity is not sufficient evidence.
- **`estimate_deliveries` widening:** every send/copy/open/download records `format ∈ {online_link, pdf, plain_text}` AND widened `channel ∈ {email, sms, whatsapp, copy, open, download, manual}`. Column shape decisions (single new column vs enum widening) resolved during research.
- **Secondary actions:** `Mark as Sent` + language selection stay accessible in the hub but must be visually subordinate to the three format choices (not gated behind an overflow menu — just visually secondary).

### Claude's Discretion

- **Hub layout:** three format cards laid horizontally on desktop, stacked on mobile; each card as a self-contained action group. Tabbed segment control rejected — cards make each format's delivery actions individually discoverable without a click.
- **Default format:** Online Estimate (matches SENDHUB-01 "default" language + the friendly-URL surface Phase 160 landed).
- **Copy actions:** reuse the existing `navigator.clipboard.writeText` pattern; toast on success/error.
- **PDF download:** reuse existing `@react-pdf/renderer` server route (already in the codebase per Phase spec).
- **Migration for `estimate_deliveries.format`:** additive-nullable column (mirrors Phase 161's dormant-first migration pattern), no DEFAULT — existing rows read as legacy/unknown.
- **Cross-surface resolver call site:** each renderer imports `resolvePresentationSettings` at the boundary where it constructs its section list (top of the render function). No renderer duplicates the logic; no renderer skips it. The verification test greps for the import in each of the 6 files.
- **WhatsApp formatter:** the current formatter is a pure text function — pipe `presentation_settings` into it as a new nullable arg, defaulting to `null` (= today's behavior). No formatter signature explosion.

### Deferred Ideas (OUT OF SCOPE)

- Native attachment delivery for SMS/WhatsApp (SENDHUB-02 explicitly punts this — always fallback to link).
- Rich delivery analytics beyond the current schema (row count, open/view tracking) — out of scope.
- Any renderer redesign — this phase wires the resolver in, doesn't redesign PDFs or share pages.
- Any changes to the Phase 161 resolver module — frozen.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SENDHUB-01 | Send opens a hub organized around three primary formats (Online Estimate/PDF/Plain Text) with per-format delivery actions; old channel-first Email/SMS tabs + separate Share & Export menu gone | Q1: current Send button + dialog + tabs + menu locations; Q7: deletion sweep — every dead file listed with grep evidence |
| SENDHUB-02 | Sending PDF or Plain Text via SMS/WhatsApp falls back to the Online Estimate link — no new attachment channel | Q4: current SMS route already ships link only; WhatsApp route respects a `deliveryFormat` gate + already falls back to `share_link` on failure — hub passes explicit `format` param and server forces link when `format !== 'online_link'` |
| SENDHUB-03 | `estimate_deliveries` records `format ∈ {online_link, pdf, plain_text}` AND widened `channel ∈ {email, sms, whatsapp, copy, open, download, manual}` | Q3: 3 files × 6 INSERT sites enumerated; existing DROP+ADD-CHECK-CONSTRAINT precedent (`20260526000005_phase81_whatsapp_delivery_channel.sql`) is the exact migration pattern |
| SENDHUB-04 | The PRESENT-04 resolver is wired into all 6 render/format paths (classic PDF, modern PDF, classic share, modern share, plain-text template, WhatsApp formatter) | Q2: all 6 file paths + entry functions + resolver-usage status + insertion-point line numbers |
| SENDHUB-05 | Cross-surface verification test proves identical section visibility across all 6 surfaces for a single toggle — not just editor preview | Q6: existing test conventions + concrete test skeleton + suggested file path; PDF walk-the-tree helper already in `tests/unit/pdf/estimate-pdf-totals.test.tsx` |
| SENDHUB-06 | `Mark as Sent` + language selection remain available in the hub as secondary actions, visually subordinate to the three primary format choices | Q5: `markAsSentAction` (`lib/actions/estimate.ts:733`) + `LanguageFlagChip` (display-only today; there is no picker) preserved and re-rendered in the hub footer |
</phase_requirements>

## Summary

Phase 163 has three deliverables that share one dialog seam: (a) replace the channel-first `<SendDialog>` (`components/workspace/send/send-dialog.tsx`) with a **format-first** `<SendHubDialog>` mounted from the SAME `estimate-tab.tsx` `sendOpen` state slot; (b) call `resolvePresentationSettings()` + `isSectionVisible()` at the top of the 5 renderers/formatters that don't yet call it (classic share already does); (c) widen `estimate_deliveries` via a dormant-first migration adding a nullable `format TEXT` column + a DROP-and-re-ADD `channel` CHECK constraint including `copy | open | download | manual`.

The load-bearing risks are: (1) three of the 5 needing-wiring renderers (classic PDF, modern PDF, WhatsApp formatter) take an `EstimateWithSections` — not the classic-share `EstimateDocumentData` — so `presentation_settings` reads via a defensive cast, mirroring `estimate-view.tsx:157-161`'s cast-with-fallback pattern; (2) `PlainText` + `WhatsApp` today do NOT emit `timeline`/`payment_terms`/`warranty`/`notes` — a naïve "hide timeline in all 6 surfaces" test passes trivially for them, so the cross-surface test must gate on `sections` (line-items) which every surface DOES emit; (3) the classic renderer's line-items block (`estimate-document.tsx:1602`) is not currently gated by `isSectionVisible(resolvedSettings, 'sections')` — closing this gap is part of the cross-surface rollout, not a scope-creep.

**Primary recommendation:** ship the phase in the plan-order documented in CONTEXT.md § Specific Ideas — (a) migration + `estimate_deliveries.format` column, (b) resolver rollout across the 6 renderers with cross-surface test as gate, (c) `<SendHubDialog>` UI + delivery-action wiring, (d) deletion sweep of old channel-first surfaces — because (a) is dormant-first (no UI change), (b) has its own gate independent of UI, (c) can only ship after (b), and (d) has zero external references once (c) lands.

## Standard Stack

### Core (all already in the codebase — no new deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.6 | App Router + server actions + API routes | Existing framework; hub dialog is client-mounted from `estimate-tab.tsx`, delivery actions call existing routes (`/api/estimates/[id]/send`, `/send-sms`, `/send-whatsapp`, `/pdf`) |
| `@react-pdf/renderer` | 4.4.0 | PDF generation (Classic + Modern templates) | Existing; server-only render in `/api/estimates/[id]/pdf/route.ts`; unit tests walk the JSX tree collecting `<Text>` nodes (see `tests/unit/pdf/estimate-pdf-totals.test.tsx`) |
| `vitest` | 4.1.4 | Test runner (unit + integration) | Existing; jsdom env; 2800+ tests already in-suite |
| `@testing-library/react` | 16.3.2 | React render + textContent assertions | Existing; standard for JSX renderer tests (classic + modern share pages) |
| `react-hook-form` + `zod` | 7.72 + 4.3 | Form validation inside per-format delivery actions | Existing (used by current `<SendForm>`); hub reuses same form primitives |
| `sonner` (`toast`) | already imported | Toast on copy/download/send success + error | Existing (`toast.success` / `toast.error` in every send call site) |

### Supporting (existing repo modules — pinned by Phase 160/161/162)

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `lib/estimate/presentation-settings.ts` (Phase 161) | `resolvePresentationSettings()` + `isSectionVisible()` + `hasEstimateBeenSentOrViewed()` | Every renderer's ONE call at the top of its render function |
| `lib/estimate/public-url.ts` (Phase 160) | `buildEstimatePublicPath()` — friendly URL | Online Estimate tab's Copy/Open URL + SMS/WhatsApp fallback body |
| `components/workspace/estimate/presentation-settings-panel.tsx` (Phase 162) | Reader only — hub reads `state.presentation_settings`, never writes it | The hub imports NONE of this file's writer surface |
| `lib/actions/estimate.ts::markAsSentAction` | Sets `sent_at` + `share_expires_at` + activity log | The hub's `Mark as Sent` button re-uses this action verbatim |
| `lib/whatsapp/formatter.ts::formatEstimateForWhatsApp` | Pure text formatter for WhatsApp bodies | Gets a new nullable `presentation_settings` arg (Q6, discretion) |
| `lib/utils/estimate-template.ts::resolveTemplate` + `buildItemsBreakdown` | Pure plain-text template | Gets a new nullable `presentation_settings` arg on `buildItemsBreakdown` (the only place sections are iterated) |

**Installation:** none — every dependency listed above is already in `package.json`. No new packages.

## Runtime State Inventory

> Rename/refactor category. Not fully applicable (this phase is a UI rework + resolver rollout + additive migration, not a rename), but flagged categories checked anyway:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `estimates.presentation_settings` (JSONB, dormant-first, added by Phase 161 migration `20260708000002_phase161_presentation_settings.sql`) — existing rows have NULL and resolve to today's behavior via `resolvePresentationSettings(null)`. `estimate_deliveries` rows written pre-Phase-163 will have `format = NULL` (legacy/unknown). | Additive-nullable, no data migration script; NULL rows keep working (row-level check omits `format`). |
| Live service config | None — this phase touches no external service configuration. Twilio/Resend/Meta credentials in `platform_integrations` unchanged. WhatsApp `company_whatsapp.delivery_format` (existing enum `share_link | formatted_text | pdf_attachment`) unchanged — the new `estimate_deliveries.format` is a distinct concept (owner's format choice at Send time, not the company's account-wide preference). | None. |
| OS-registered state | None — no cron / task scheduler / systemd unit references `send-dialog`, `send-form`, `send-actions-menu`, or `plain-text-sheet`. | None. |
| Secrets and env vars | None — no env var references these components. `RESEND_API_KEY` / `TWILIO_*` / `META_*` come from `getIntegrationKey('resend')` / `getTwilioConfig()` / `getWhatsAppAccountStatus()` — none change. | None. |
| Build artifacts / installed packages | None — TypeScript source only; no compiled artifacts carry component names. | None. |

**Canonical question:** After the deletion sweep (send-dialog.tsx, send-form.tsx, send-actions-menu.tsx, and the already-dead send-tab.tsx + estimate-preview.tsx), does anything runtime-cached still reference them? Answer: **no** — grep confirms every consumer is either self-referential or replaceable inside the same commit.

## Environment Availability

Skipped — Phase 163 is code + additive migration only. No external services or CLI tools are required at plan-time beyond what's already running (Supabase local via `supabase/migrations/`; tests via `pnpm test`).

## Architecture Patterns

### 1. Current Send surface (SENDHUB-01, SENDHUB-05)

**Editor-side flow (unchanged by Phase 163):**

- `components/workspace/estimate/estimate-floating-actions.tsx:80` — the `<Send>` `<Button>` inside the sticky pill.
- `components/workspace/estimate/estimate-editor.tsx:270-273` (`handleSend`) — saves-if-dirty, then calls `onSend?.()`.
- `components/workspace/estimate/estimate-tab.tsx:71` — owns `const [sendOpen, setSendOpen] = useState(false)` (mirrors `settingsOpen` at `estimate-editor.tsx:216` and the parent-owned `photosOpen`).
- `estimate-tab.tsx:161` — `onSend={() => setSendOpen(true)}`.
- `estimate-tab.tsx:163-175` — renders `<SendDialog open={sendOpen} onOpenChange={setSendOpen} ...>` as a sibling of `<EstimateEditor>`.

**Current dialog tabs / actions (all inside `<SendDialog>`):**

- `components/workspace/send/send-dialog.tsx:32-103` — outer `<Dialog>` shell.
- `send-dialog.tsx:63-73` — top-right `<SendActionsMenu>` = the "Share & Export" dropdown (Copy Share Link, Download PDF, Copy Plain Text, Edit message…) → this is the "separate Share & Export menu" CONTEXT.md calls out to delete. Ownership is IN the dialog header — NOT a separate menu bar elsewhere. `send-actions-menu.tsx:112` renders the literal text `Share & Export`.
- `send-dialog.tsx:79-88` — `<SendForm>` = channel-first `<Tabs>` with Email + SMS `<TabsTrigger>`s (`send-form.tsx:152-289`), plus `Mark as Sent` at the bottom (`send-form.tsx:298-306`).
- `send-dialog.tsx:91-100` + `send-actions-menu.tsx:139` — `<PlainTextSheet>` opened via `onOpenEditor` from the dropdown's `Edit message…` item.
- `LanguageFlagChip` (display-only, no picker) at `send-dialog.tsx:61` — imported from `./estimate-preview` (a shared local module).

**Hub state-ownership pattern (recommended):** the new `<SendHubDialog>` should keep `sendOpen` state in `estimate-tab.tsx` **exactly where it lives today** (line 71) — this mirrors the Phase 162 `photosOpen`/`settingsOpen` pattern. No new state slot. The hub is a drop-in replacement for `<SendDialog>` at the `estimate-tab.tsx:163-175` slot.

### 2. Six render/format surfaces (SENDHUB-04)

| # | Surface | File | Entry | Signature accepts | Uses resolver today? | Natural insertion point (line) |
|---|---------|------|-------|-------------------|----------------------|--------------------------------|
| 1 | Classic PDF | `components/pdf/estimate-pdf.tsx` | `export default function EstimatePDF({...}: EstimatePDFProps)` (**line 450**) | `EstimateWithSections` via `estimate` prop | **NO** | Top of function body — right after `const brandColor = ...` at line 460, before rendering. Read `estimate.presentation_settings` via cast: `const resolvedSettings = resolvePresentationSettings((estimate as { presentation_settings?: unknown }).presentation_settings)` |
| 2 | Modern PDF | `components/pdf/estimate-pdf-modern.tsx` | `export default function EstimatePDFModern({...}: EstimatePDFProps)` (**line 462**) | `EstimateWithSections` via `estimate` prop | **NO** | Same shape as Classic PDF — top of function body, before `const brandColor = ...` (line 472). |
| 3 | Classic share page | `components/workspace/estimate/estimate-document.tsx` | `EstimateDocument` (view mode branch) — receives `data: EstimateDocumentData` which carries `presentation_settings` on the interface (**line 373**) | `EstimateDocumentData` | **YES** — line 1592 (`const resolvedSettings = resolvePresentationSettings(data.presentation_settings)`) | Nothing to insert; **but** the line-items block at line 1602 is NOT currently gated on `isSectionVisible(resolvedSettings, 'sections')` — Phase 163 must add this gate to make SENDHUB-04's `sections`-based cross-surface test meaningful. |
| 4 | Modern share page | `components/share/estimate-document-modern.tsx` | `export function EstimateDocumentModern({data, ...}: EstimateDocumentModernProps)` (**line 191**) | `EstimateDocumentData` (same interface as Classic) — already has `presentation_settings` field | **NO** — currently uses ad hoc `data.summary != null` / `data.timeline != null` checks (lines 347, 496, 506, 516, 526) — the exact "settings-drift" antipattern PRESENT-04 was designed to prevent | Top of function body — before `const lang = ...` at line 202. Then each `data.<field> != null` → `isSectionVisible(resolvedSettings, '<key>') && data.<field> != null`. Also add gate on `visibleSections` (line 218). |
| 5 | Plain-text template | `lib/utils/estimate-template.ts` | `resolveTemplate(template, data)` (**line 51**) + `buildItemsBreakdown(estimate)` (**line 85**) | `TemplateData` (pre-computed strings) + `EstimateWithSections` | **NO** — but functionally: only the section iterator in `buildItemsBreakdown` touches sections; `resolveTemplate` only handles greeting/opener/closer/signature. | Extend `buildItemsBreakdown(estimate, resolvedSettings?)` with an optional resolvedSettings arg at line 85; gate the section filter (line 87) on `isSectionVisible(resolvedSettings ?? resolvePresentationSettings(null), 'sections')`. Callers (`send-actions-menu.tsx:91`, `plain-text-sheet.tsx:48`) pass `resolvePresentationSettings(estimate.presentation_settings)`. |
| 6 | WhatsApp formatter | `lib/whatsapp/formatter.ts` | `formatEstimateForWhatsApp(estimate, clientName, companyName, responsibleName?, companyWebsite?)` (**line 123**) | `FormatterEstimate` (structural type, not `Estimate`) | **NO** | Add a new nullable trailing arg `presentation_settings?: PresentationSettings \| null` at line 128; resolve at line 131; gate `for (const section of estimate.sections)` at line 141 on `isSectionVisible(resolved, 'sections')`; gate any future `payment_terms` / `timeline` emission (currently absent) at their insertion sites. **Signature widening only — no formatter-signature explosion** (per CONTEXT.md discretion). |

**Critical nuance for the cross-surface test:** because plain-text (`estimate-template.ts`) and WhatsApp (`formatter.ts`) do **NOT** emit `payment_terms`/`timeline`/`warranty_terms`/`notes` today, a hidden-timeline test passes trivially for them — the assertion `expect(output).not.toContain('SECRET_TIMELINE')` succeeds without any resolver call. The strongest cross-surface toggle is **`sections`** (line-items) because every one of the 6 surfaces iterates `estimate.sections` and emits each item's `description`. Use **item description text** as the SECRET_STRING for the cross-surface parity test.

### 3. `estimate_deliveries` schema (SENDHUB-03)

**Current schema (`supabase/migrations/20260519000003_estimate_deliveries.sql`):**

```sql
CREATE TABLE estimate_deliveries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id         UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  channel             TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),  -- widened by 20260526000005
  recipient_email     TEXT,
  recipient_phone     TEXT,
  subject             TEXT,
  provider            TEXT NOT NULL CHECK (provider IN ('resend', 'twilio', 'meta')),
  provider_message_id TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
  error_message       TEXT,
  sent_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The `channel` CHECK was widened once already by `20260526000005_phase81_whatsapp_delivery_channel.sql` — that migration is the exact DROP-CONSTRAINT + ADD-CONSTRAINT precedent Phase 163 mirrors.

**Proposed additions (new migration file — recommended name: `supabase/migrations/20260709000001_phase163_send_hub_delivery_schema.sql`):**

```sql
-- Phase 163 (SENDHUB-03): widen estimate_deliveries for the format-first Send hub.
-- Dormant-first: format is nullable + no DEFAULT — existing rows read as legacy/unknown.
-- Channel enum re-widened (DROP + ADD, mirrors 20260526000005_phase81_whatsapp_delivery_channel.sql).

-- 1. NEW column: which FORMAT the owner sent (independent of transport channel).
ALTER TABLE estimate_deliveries
  ADD COLUMN IF NOT EXISTS format TEXT
  CHECK (format IN ('online_link', 'pdf', 'plain_text') OR format IS NULL);

COMMENT ON COLUMN estimate_deliveries.format IS
  'Phase 163 (SENDHUB-03). Send-hub format choice: online_link | pdf | plain_text. NULL = legacy/pre-Phase-163 row.';

-- 2. WIDEN channel enum: add copy | open | download | manual alongside email | sms | whatsapp.
ALTER TABLE estimate_deliveries
  DROP CONSTRAINT IF EXISTS estimate_deliveries_channel_check;
ALTER TABLE estimate_deliveries
  ADD CONSTRAINT estimate_deliveries_channel_check
  CHECK (channel IN ('email', 'sms', 'whatsapp', 'copy', 'open', 'download', 'manual'));
```

**Insertion sites to update (6 INSERTs across 3 files — every one MUST write `format` + valid `channel`):**

| File | Line | Currently writes | Add |
|------|------|------------------|-----|
| `app/api/estimates/[id]/send/route.ts` | 191 (email failure) | `channel: 'email'` | `format: <request.format>` (default `'online_link'` if body doesn't carry it — retrocompat, but hub always passes it) |
| `app/api/estimates/[id]/send/route.ts` | 208 (email success) | `channel: 'email'` | same |
| `app/api/estimates/[id]/send-sms/route.ts` | 119 (sms failure) | `channel: 'sms'` | `format: <request.format>` — when body has `format ∈ {'pdf', 'plain_text'}` the route STILL sends the link (byte-identical delivery today), just records the owner's choice |
| `app/api/estimates/[id]/send-sms/route.ts` | 136 (sms success) | `channel: 'sms'` | same |
| `lib/whatsapp/send-estimate.ts` | 123 (whatsapp failure) | `channel: 'whatsapp'` | `format: <params.format>` (new param on `deliverEstimateViaWhatsApp`); when `format !== 'online_link'` the function forces `share_link` behavior regardless of `accountStatus.deliveryFormat` (implements SENDHUB-02 fallback) |
| `lib/whatsapp/send-estimate.ts` | 147 (whatsapp success) | `channel: 'whatsapp'` | same |

**New insertion sites Phase 163 adds** (for `copy | open | download | manual` — these actions currently do NOT hit any delivery-logging route):

- **Copy Online Estimate URL** → client-side `navigator.clipboard.writeText` (currently in `send-actions-menu.tsx:76`) — needs a new server action `logCopyDelivery({estimateId, format: 'online_link' | 'pdf' | 'plain_text'})` that INSERTs `{channel: 'copy', format, provider: null}`. Provider is not a not-null field but existing schema requires it — so either (a) allow `provider = NULL` for these channels (schema change), or (b) use a sentinel `provider: 'client'` (less invasive). **Recommendation: option (b)** — the migration keeps `provider NOT NULL`, and we widen the provider CHECK to include `'client'` alongside `'resend' | 'twilio' | 'meta'`.
- **Open Online Estimate URL** → same: `channel: 'open'`, `provider: 'client'`.
- **Download PDF** → new server action or extend `/api/estimates/[id]/pdf/route.ts` GET to also insert a delivery row on successful fetch: `{channel: 'download', format: 'pdf', provider: 'client'}`.
- **Copy Plain Text** → `{channel: 'copy', format: 'plain_text', provider: 'client'}`.
- **Mark as Sent** (existing) → widen `markAsSentAction` to ALSO insert `{channel: 'manual', format: null, provider: 'client', status: 'sent', sent_at: now}` — currently it only writes an `estimate_activity` row (`lib/actions/estimate.ts:766-772`), no `estimate_deliveries` row. Phase 163 fills this gap.

**Recommended migration addition (single new file, on top of the above):**

```sql
-- 3. WIDEN provider enum: add 'client' for copy/open/download/manual actions
--    that don't go through a network provider.
ALTER TABLE estimate_deliveries
  DROP CONSTRAINT IF EXISTS estimate_deliveries_provider_check;
ALTER TABLE estimate_deliveries
  ADD CONSTRAINT estimate_deliveries_provider_check
  CHECK (provider IN ('resend', 'twilio', 'meta', 'client'));
```

### 4. SMS/WhatsApp fallback for non-online formats (SENDHUB-02)

**SMS (`app/api/estimates/[id]/send-sms/route.ts`):** ALREADY link-only today — line 104-110 builds `shareUrl` via `buildEstimatePublicPath` and injects it into `smsBody`. There is no PDF-attachment code path for SMS. **Minimum change:** add `format` to the request body schema; the route otherwise behaves identically. This is a metadata-only change.

**WhatsApp (`lib/whatsapp/send-estimate.ts`):** has an existing 3-way switch on `deliveryFormat` (line 91-120) — `pdf_attachment` tries a PDF, `formatted_text` sends the formatted body, else share_link. It ALREADY falls back to `share_link` on PDF failure (line 110-113). **Minimum change:**

```ts
// Force the hub's fallback contract: PDF/Plain Text over WhatsApp = share_link only.
const effectiveDeliveryFormat: DeliveryFormat =
  (params.format === 'pdf' || params.format === 'plain_text')
    ? 'share_link'
    : deliveryFormat
```

Insert this at `lib/whatsapp/send-estimate.ts:70` (right after `deliveryFormat` resolution). All downstream branches (`pdf_attachment`, `formatted_text`, else) read `effectiveDeliveryFormat` instead. The `formatEstimateForWhatsApp` path for `formatted_text` is preserved for the case when `format === 'online_link'` AND the account is configured `formatted_text` — this is the ONLY path where the WhatsApp formatter is called, and it also receives the new `presentation_settings` arg per Q2.

**No new dispatcher needed.** Both SMS and WhatsApp keep their per-channel routes — the hub is thin: it calls the same routes with a new `format` field in the body.

### 5. `Mark as Sent` + language selection (SENDHUB-06)

**`Mark as Sent`:**
- Current location: bottom of `<SendForm>` — `components/workspace/send/send-form.tsx:298-306` (button) + `send-form.tsx:133-147` (handler).
- Server action: `markAsSentAction` at `lib/actions/estimate.ts:733-778` — sets `sent_at = now`, `share_expires_at = shareLinkExpiryFromNow()`, updates `projects.status = 'sent'`, inserts `estimate_activity {event_type: 'estimate_marked_sent', metadata: {marked_manually: true}}`, fires Xphere sync, revalidates path.
- Phase 163 preservation: the hub renders a `<Mark as Sent>` button in a subordinate "footer" row (below the 3 format cards). The button binding stays identical — same `markAsSentAction(estimateId)` call, same toast. Phase 163's ONLY delta is: the action ALSO inserts an `estimate_deliveries` row with `{channel: 'manual', format: null, provider: 'client', status: 'sent'}` (see SENDHUB-03 above).

**Language selection:**
- Current UI: `<LanguageFlagChip lang={estimate.language} />` at `send-dialog.tsx:61` — **display-only**. There is NO picker anywhere in the Send dialog or the wider editor that mutates `estimate.language` — grep for `setLanguage|UPDATE_LANGUAGE|change_language` returns zero matches inside `components/workspace/estimate/` or `components/workspace/send/`. The language is set at generation time (`lib/services/generate-estimate.ts`) and reset by regeneration.
- Phase 163 preservation: keep the `<LanguageFlagChip>` visible in the hub header (mirrors `send-dialog.tsx:61`). It's already a shared component — but `estimate-preview.tsx` becomes dead code after this phase's deletion sweep, so **re-home `LanguageFlagChip`** into a small shared module — recommended: `components/workspace/send/language-flag-chip.tsx` (a 30-line dedicated file) OR fold it into the new `<SendHubDialog>` file — Claude's Discretion.

If SENDHUB-06 needs a real language PICKER (not a chip), that's out of research scope — CONTEXT.md's "Claude's Discretion" doesn't request a picker; owner's language locking happens at generation time; a picker would require a `regenerateInLanguage` server action that doesn't exist today. **Recommendation: chip only, no picker.** Flag this explicitly to the planner: if the owner wants a picker, that's a scope expansion beyond CONTEXT.md and should be a separate SEED/deferral.

### 6. Cross-surface verification test (SENDHUB-04, SENDHUB-05)

**Existing test conventions:**

- vitest 4.1.4 + `describe`/`it`/`expect` (see `tests/unit/estimate/presentation-settings.test.ts`).
- `@react-pdf/renderer` output tested via **walking the returned React element tree** — call the PDF component as a plain function, collect every `<Text>` primitive's children into a flat string array via depth-first traversal. Full working helper is at `tests/unit/pdf/estimate-pdf-totals.test.tsx:22-51` (`collectTextNodes` + `flattenText` + `renderTexts`). **Extract to a shared module** so both PDF variants + the cross-surface test can reuse it. Recommended: `tests/unit/estimate/_pdf-text-walker.ts` (underscore prefix signals not-a-test-file).
- `@testing-library/react` for JSX share pages: `render(<Component ... />)` + `container.textContent` for full-text-substring assertions (or `queryByText` for individual elements).
- Plain text + WhatsApp: `expect(output).toContain(...)` / `expect(output).not.toContain(...)` — see `tests/unit/whatsapp/formatter.test.ts` and `tests/unit/utils/estimate-template.test.ts` for pattern.
- No snapshot testing is used in this codebase for the renderers (confirmed by grep: no `*.snap` files under `components/`).

**Recommended test file:** `tests/unit/estimate/presentation-settings-cross-surface.test.tsx`

(Mirrors the neighbor `presentation-settings.test.ts`; `.tsx` because it renders `<EstimateDocument>`/`<EstimateDocumentModern>`.)

**Test skeleton (single-file, one `describe`, two `it`s — one for `sections` hide, one for `summary` hide):**

```typescript
// tests/unit/estimate/presentation-settings-cross-surface.test.tsx
// SENDHUB-04/-05: prove the PRESENT-04 resolver is wired identically into all
// 6 render/format surfaces. Toggling a SINGLE presentation-settings option
// hides the corresponding content across every surface, byte-for-substring-
// identically. No editor-preview assertion — this is downstream of the editor.

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'
import { EstimateDocument } from '@/components/workspace/estimate/estimate-document'
import { EstimateDocumentModern } from '@/components/share/estimate-document-modern'
import { buildItemsBreakdown, resolveTemplate } from '@/lib/utils/estimate-template'
import { formatEstimateForWhatsApp } from '@/lib/whatsapp/formatter'
import { resolvePresentationSettings } from '@/lib/estimate/presentation-settings'
import { collectTextNodes, flattenText } from './_pdf-text-walker' // extracted helper
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { PresentationSettings } from '@/lib/estimate/presentation-settings'

const SECRET_ITEM_DESCRIPTION = 'CROSS_SURFACE_ITEM_DESC_XYZ_98723'
const SECRET_SUMMARY = 'CROSS_SURFACE_SUMMARY_XYZ_98724'

function baseEstimate(overrides: Partial<EstimateWithSections> = {}): EstimateWithSections {
  return {
    id: 'est-1', project_id: 'p-1', company_id: 'c-1', currency_code: 'USD',
    version: 1, estimate_seq: 1, estimate_number: null, estimate_date: null,
    is_current: true, share_token: 'tok', public_slug_token: null, status: 'sent',
    language: 'en', summary: SECRET_SUMMARY, notes: null, timeline: null,
    payment_terms: null, warranty_terms: null,
    subtotal: 1000, discount_type: null, discount_value: 0, discount_amount: 0,
    tax_rate: 0, tax_amount: 0, total: 1000,
    deposit_type: 'none', deposit_value: null, balance_due: null,
    sent_at: null, viewed_at: null, responded_at: null, client_response: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    presentation_settings: null,
    sections: [{
      id: 'sec-1', estimate_id: 'est-1', company_id: 'c-1',
      title: 'Labor', sort_order: 1, subtotal: 1000,
      items: [{
        id: 'i-1', section_id: 'sec-1', company_id: 'c-1',
        description: SECRET_ITEM_DESCRIPTION,
        quantity: 1, unit: null, unit_price: 1000, total: 1000, sort_order: 1,
        price_source: null,
      }],
    }],
    attachedPhotos: [],
    ...overrides,
  }
}

// Returns the concatenated text of ALL 6 surfaces for a given estimate.
function renderAllSurfaces(estimate: EstimateWithSections): {
  classicPdf: string; modernPdf: string
  classicShare: string; modernShare: string
  plainText: string; whatsapp: string
} {
  const company = { name: 'Acme', owner_name: null, phone: null, email: null,
    website: null, address: null, city: null, state: null, zip: null,
    logo_url: null, brand_primary_color: null }
  const resolved = resolvePresentationSettings(estimate.presentation_settings)

  // 1. Classic PDF — walk element tree
  const classicPdfBuf: string[] = []
  collectTextNodes(EstimatePDF({ estimate, company, client: null,
    projectName: 'Test', projectType: null, language: 'en' }), classicPdfBuf)

  // 2. Modern PDF
  const modernPdfBuf: string[] = []
  collectTextNodes(EstimatePDFModern({ estimate, company, client: null,
    projectName: 'Test', projectType: null, language: 'en' }), modernPdfBuf)

  // 3. Classic share (JSX) — build EstimateDocumentData from estimate
  const documentData = toDocumentData(estimate) // see below
  const classic = render(
    <EstimateDocument mode="view" data={documentData} company={company}
      client={null} projectName="Test" projectType={null}
      language="en" estimateVersion={1} estimateSeq={1}
      estimateCreatedAt="2026-01-01T00:00:00Z" />
  )

  // 4. Modern share (JSX)
  const modern = render(
    <EstimateDocumentModern data={documentData} company={company}
      client={null} projectName="Test" projectType={null}
      language="en" estimateVersion={1} estimateSeq={1}
      estimateCreatedAt="2026-01-01T00:00:00Z" />
  )

  // 5. Plain-text
  const items = buildItemsBreakdown(estimate, resolved)
  const plainText = resolveTemplate(
    { greeting: null, opener: null, closer: null, signature: null },
    { client_name: 'Alice', company_name: 'Acme', owner_name: 'Bob',
      total: '$1,000.00', items_breakdown: items }
  )

  // 6. WhatsApp
  const whatsapp = formatEstimateForWhatsApp(
    estimate as unknown as FormatterEstimate, 'Alice', 'Acme', 'Bob', null,
    estimate.presentation_settings
  )

  return {
    classicPdf: classicPdfBuf.join(' '),
    modernPdf: modernPdfBuf.join(' '),
    classicShare: classic.container.textContent ?? '',
    modernShare: modern.container.textContent ?? '',
    plainText,
    whatsapp,
  }
}

describe('SENDHUB-04/-05: presentation-settings cross-surface parity', () => {
  it('when sections.sections = false, the item description is absent from ALL 6 surfaces', () => {
    const est = baseEstimate({
      presentation_settings: { sections: { sections: false } },
    })
    const out = renderAllSurfaces(est)

    expect(out.classicPdf).not.toContain(SECRET_ITEM_DESCRIPTION)
    expect(out.modernPdf).not.toContain(SECRET_ITEM_DESCRIPTION)
    expect(out.classicShare).not.toContain(SECRET_ITEM_DESCRIPTION)
    expect(out.modernShare).not.toContain(SECRET_ITEM_DESCRIPTION)
    expect(out.plainText).not.toContain(SECRET_ITEM_DESCRIPTION)
    expect(out.whatsapp).not.toContain(SECRET_ITEM_DESCRIPTION)
  })

  it('when sections.summary = false, the summary text is absent from ALL 6 surfaces', () => {
    // NOTE: plain-text/WhatsApp don't emit summary today — assertion is trivially true.
    // Still asserted for parity: if a future change adds summary emission, it stays gated.
    const est = baseEstimate({
      presentation_settings: { sections: { summary: false } },
    })
    const out = renderAllSurfaces(est)

    expect(out.classicPdf).not.toContain(SECRET_SUMMARY)
    expect(out.modernPdf).not.toContain(SECRET_SUMMARY)
    expect(out.classicShare).not.toContain(SECRET_SUMMARY)
    expect(out.modernShare).not.toContain(SECRET_SUMMARY)
    expect(out.plainText).not.toContain(SECRET_SUMMARY)
    expect(out.whatsapp).not.toContain(SECRET_SUMMARY)
  })

  it('retrocompat: presentation_settings = null → the item description IS emitted by all 6 surfaces (byte-identical to today)', () => {
    const est = baseEstimate({ presentation_settings: null })
    const out = renderAllSurfaces(est)

    expect(out.classicPdf).toContain(SECRET_ITEM_DESCRIPTION)
    expect(out.modernPdf).toContain(SECRET_ITEM_DESCRIPTION)
    expect(out.classicShare).toContain(SECRET_ITEM_DESCRIPTION)
    expect(out.modernShare).toContain(SECRET_ITEM_DESCRIPTION)
    expect(out.plainText).toContain(SECRET_ITEM_DESCRIPTION)
    expect(out.whatsapp).toContain(SECRET_ITEM_DESCRIPTION)
  })
})
```

**+ a static grep test** (mirroring `presentation-settings.test.ts:131-134`'s `GUARD-03 static boundary` idiom) that fails-fast when a renderer omits the resolver import:

```typescript
it('structural: all 6 render/format sources import resolvePresentationSettings', () => {
  const sources = [
    'components/pdf/estimate-pdf.tsx',
    'components/pdf/estimate-pdf-modern.tsx',
    'components/workspace/estimate/estimate-document.tsx',
    'components/share/estimate-document-modern.tsx',
    'lib/utils/estimate-template.ts',
    'lib/whatsapp/formatter.ts',
  ]
  for (const path of sources) {
    const source = readFileSync(path, 'utf8')
    expect(source, `${path} must import resolvePresentationSettings`).toContain('resolvePresentationSettings')
  }
})
```

This is the SENDHUB-04 "test greps for the import in each of the 6 files" acceptance criterion from CONTEXT.md § Claude's Discretion.

### 7. Deletion sweep (Q7)

Once `<SendHubDialog>` ships, these files become dead. Grep evidence collected 2026-07-08:

| File | External refs (excluding self + `.claude/worktrees/`) | Verdict |
|------|--------------------------------------------------------|---------|
| `components/workspace/send/send-dialog.tsx` | 1 — `components/workspace/estimate/estimate-tab.tsx:13` (`import { SendDialog }`) | **DELETE** — the estimate-tab import gets rewritten to `<SendHubDialog>` in the same PR |
| `components/workspace/send/send-form.tsx` | 2 — `send-dialog.tsx:11` + `send-tab.tsx:7` (both dying with this phase) | **DELETE** |
| `components/workspace/send/send-actions-menu.tsx` | 2 — `send-dialog.tsx:12` + `send-tab.tsx:8` (both dying) | **DELETE** |
| `components/workspace/send/send-tab.tsx` | **0** — the `SendTab` export is imported nowhere (grep confirms: only self-file match) | **DELETE (already dead code)** — an unrelated cleanup this phase can bundle |
| `components/workspace/send/estimate-preview.tsx` | Two exports: `EstimatePreview` used only by `send-tab.tsx` (dying); `LanguageFlagChip` used by `send-dialog.tsx:14` (dying) + `send-tab.tsx:6` (dying) | **DELETE** — but relocate `LanguageFlagChip` first: either fold it into the new hub or into a new tiny `components/workspace/send/language-flag-chip.tsx`. `components/share/estimate-view.tsx:37` has a DIFFERENT `LanguageFlagChip` (separate copy for shared-view surface) — do not touch. |
| `components/workspace/send/plain-text-sheet.tsx` | 2 — `send-dialog.tsx:13` + `send-tab.tsx:9` (both dying) | **REUSE OR DELETE** — the "Edit message…" `<Sheet>` is a natural fit for the "Edit Plain Text" secondary action inside the Plain Text format card. Recommendation: **keep and rewire** — its API surface (`onOpenChange`, `estimate`, `clientName`, `companyName`, `ownerName`, `estimateTemplate`) is a clean seam; add a `presentation_settings` prop and pass it through to `resolveTemplate`/`buildItemsBreakdown`. Alternative: delete and rebuild inside the hub — Claude's Discretion. |

**Grep verification commands** the plan-checker should re-run at delivery time:

```bash
# All 5 dead files must have 0 external references:
grep -rn 'SendDialog\|SendForm\|SendActionsMenu\|SendTab\|EstimatePreview\b' \
     components/ app/ lib/ tests/ \
     | grep -v '\.claude/worktrees/' | grep -v ':send-'
```

All 6 render sources must import the resolver — the structural grep test above enforces this.

### 8. Established Codebase Patterns

- **Dormant-first migrations** (Phase 129/161 precedent): additive-nullable JSONB or additive column; existing rows carry the "today's behavior" semantics; no DEFAULT; no data-migration script. Phase 163's `format` column and channel/provider CHECK widening follow this exactly.
- **Cast-with-fallback destructuring in readers** when the query type may lag the column (Phase 161 pattern) — every renderer that takes `EstimateWithSections` reads `presentation_settings` via `(estimate as { presentation_settings?: unknown }).presentation_settings` — the classic share reader already does this at `estimate-view.tsx:157-161`. Copy this exact idiom into the PDF renderers.
- **`resolvePresentationSettings` at the render boundary** — one call at the top of the render function, threaded into every conditional (Phase 162 `estimate-document.tsx:1592` precedent). Do NOT resolve inside a loop or a subcomponent — one call, one seam.
- **`buildEstimatePublicPath` at the URL boundary** — Phase 160 already migrated every share-URL construction site to this builder. Hub reuses it for the Online Estimate URL — no inline `/estimate/${share_token}` construction anywhere.
- **State-ownership pattern** — dialog open/close state lives ONE level above the dialog (`estimate-tab.tsx` owns `sendOpen`; `estimate-editor.tsx` owns `settingsOpen`; parent owns `photosOpen`). Follow this for `<SendHubDialog>`.
- **Delivery-row insertion** — every route logs one row per network call (failure OR success) via `svc.from('estimate_deliveries').insert({...})`. Phase 163 keeps this shape, just adds `format` field and expands the set of channels that log.

### Anti-Patterns to Avoid

- **Do NOT add a `format` field to `<SendForm>`'s existing tab structure and call it done.** The whole tab structure is being replaced — a hybrid state (format field inside a channel-first tab layout) is a half-shipped state per CONTEXT.md's Sub-step order guidance.
- **Do NOT resolve `presentation_settings` inside `<Tabs>` / per-section renderers.** One call, at the top of the render function — never a scoped per-block call. Otherwise a second renderer added later can skip it and re-introduce settings-drift.
- **Do NOT add native attachment delivery for SMS.** SENDHUB-02 punts this; the hub records `format: 'pdf'` on the SMS row but the wire delivery is still a link.
- **Do NOT touch `estimate-document.tsx`'s Phase 162 gear panel or reducer.** The hub reads `state.presentation_settings`, never mutates it — CONTEXT.md is explicit.
- **Do NOT invent a new `plain_text` delivery-format enum branch in `company_whatsapp.delivery_format`.** That column is a company-wide DEFAULT — the hub's `format` is a per-send OVERRIDE and lives on `estimate_deliveries`, not `company_whatsapp`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Section-visibility resolution | Ad hoc `data.field != null` checks | `resolvePresentationSettings(...)` + `isSectionVisible(resolved, key)` from `lib/estimate/presentation-settings.ts` | Settings-drift is the milestone's #1 structural risk (PRESENT-04 exists to prevent this) |
| Friendly URL construction | Inline `/estimate/${company.slug}/${projectSlug}-${token}` | `buildEstimatePublicPath({slug, name}, {id, public_slug_token, share_token})` from `lib/estimate/public-url.ts` | PUBURL-04 sweep test guards against regression |
| PDF rendering | New `<html>-to-PDF` pipeline | Existing `@react-pdf/renderer` route `/api/estimates/[id]/pdf/route.ts` | Already ships; supports Classic + Modern via `PDF_TEMPLATE_COMPONENTS` registry |
| Clipboard writes | Custom clipboard shim / execCommand | `navigator.clipboard.writeText(...)` — same pattern as `send-actions-menu.tsx:77` | Works in every modern browser inside iOS Safari + Android Chrome per project constraints |
| Delivery logging | New `deliveries` table | Existing `estimate_deliveries` widened per SENDHUB-03 | Established schema + insert sites + audit trail |
| Mark-as-sent state mutation | Direct DB write from the client | `markAsSentAction(estimateId)` server action at `lib/actions/estimate.ts:733` | RLS + activity log + share-link expiry refresh + Xphere sync all bundled |
| Sheet/Popover primitives | Custom modal | shadcn/ui `<Dialog>` / `<Sheet>` / `<Popover>` — same primitives as `presentation-settings-panel.tsx` | Consistency; accessibility (title/description sr-only pattern already established) |

**Key insight:** Every part of Phase 163 rewires or reuses an existing seam. There is no new infrastructure to build. The failure mode is skipping the resolver in ONE of the 6 renderers — that's what the structural grep test in SENDHUB-05 exists to catch.

## Common Pitfalls

### Pitfall 1: cross-surface test that passes trivially
**What goes wrong:** picking a hidden section that plain-text + WhatsApp don't currently emit (e.g., `timeline`, `payment_terms`, `warranty`, `notes`) → the `expect(output).not.toContain(...)` assertion passes without any resolver call in those formatters, hiding a real gap.
**Why it happens:** plain-text (`lib/utils/estimate-template.ts`) has only greeting/opener/items/closer/signature — no terms/timeline blocks. WhatsApp (`lib/whatsapp/formatter.ts`) has greeting/sections/totals/deposit/closing — same story.
**How to avoid:** use `sections` (line-items) as the SECRET-string toggle — every one of the 6 surfaces DOES emit item descriptions today. Bonus: add the additional structural grep test (all 6 files import `resolvePresentationSettings`) — that catches a missing resolver even when the runtime assertion passes trivially.
**Warning signs:** the "hidden" test passes but you can't point to a line in each formatter where the resolver was actually consulted.

### Pitfall 2: classic renderer's line-items block isn't gated on `sections`
**What goes wrong:** even though the classic share page already imports `resolvePresentationSettings` (Phase 162), the `visibleSections` variable at `estimate-document.tsx:1602` is derived only from empty-items filtering — it does NOT check `isSectionVisible(resolvedSettings, 'sections')`. So toggling "Line Sections" off in the gear panel doesn't actually hide the line-items block in the editor view or share page.
**Why it happens:** Phase 162 wired the resolver in but only for `summary`, `payment_terms`, `timeline`, `warranty_terms`, `notes`, `photos` — the `sections` key is a defined `SectionKey` on the resolver, the panel offers the toggle (`presentation-settings-panel.tsx:68` includes `'sections'` in `SECTION_ORDER`), but the classic renderer doesn't consume it. This is a real Phase 162 gap.
**How to avoid:** Phase 163 must close this gap in ALL 6 renderers as part of the resolver rollout. The cross-surface test above (Pitfall 1's `sections`-based test case) will fail if any renderer doesn't gate the line-items block.
**Warning signs:** the SENDHUB-04 test fails on `classicShare`/`classicPdf`/`modernPdf`/`modernShare` for the `sections.sections = false` case — that's the gap surfacing.

### Pitfall 3: byte-identity retrocompat for NULL `presentation_settings`
**What goes wrong:** naïvely changing a renderer's condition from `data.foo != null && (...)` to `isSectionVisible(resolved, 'foo') && data.foo != null && (...)` — but the `visibleSections` derivation or a header/footer element shifts by a whitespace character, breaking byte-identity for existing PDFs / share pages.
**Why it happens:** any addition of a JSX comment, a re-formatted conditional, or a moved variable declaration can nudge the rendered output. The test suite doesn't do byte-comparison of the PDF output, but the DOM/element tree structure matters for regression testing.
**How to avoid:** add a `retrocompat` case to the cross-surface test (see Pitfall 1's third `it`) that asserts the SECRET item description IS present when `presentation_settings = null` — this proves the byte-identity contract per Phase 162's own precedent (`estimate-view.tsx:157-161` comment).
**Warning signs:** the retrocompat test fails but the "hidden" tests pass — a resolver call is running even when it shouldn't be affecting the output.

### Pitfall 4: WhatsApp formatter signature explosion
**What goes wrong:** adding one `presentation_settings` positional arg to `formatEstimateForWhatsApp` puts it AFTER `companyWebsite`, so every caller must now write `formatEstimateForWhatsApp(est, name, co, owner, site, settings)`. Later phases add another arg and the signature is 8+ positionals long.
**Why it happens:** additive positional args on a 5-arg function.
**How to avoid:** either (a) add the settings as a trailing OPTIONAL `presentation_settings?: PresentationSettings | null` (CONTEXT.md discretion — recommended), (b) migrate the signature to a single options object `formatEstimateForWhatsApp(estimate, opts: {clientName?, companyName?, responsibleName?, companyWebsite?, presentationSettings?})`. Option (a) is a smaller change and matches CONTEXT.md's "no signature explosion" guidance.
**Warning signs:** the formatter's arg list has 6+ positional args.

### Pitfall 5: `estimate_deliveries` write sites forgotten
**What goes wrong:** the migration ships, the hub UI ships, but 2 of the 6 existing INSERT sites still write rows without `format` — for a while every WhatsApp send row has `format = NULL` even when the owner picked "PDF" in the hub.
**Why it happens:** 6 INSERT sites across 3 files is easy to miss one.
**How to avoid:** the plan MUST enumerate all 6 sites (this document does at Q3). Add a static test (grep) that fails when any `.from('estimate_deliveries').insert({...})` payload doesn't include a `format:` key. Recommended location: `tests/unit/estimate/delivery-insert-format.test.ts` — grep for `\.from\('estimate_deliveries'\)\.insert` across the 3 source files and assert the surrounding object contains `format:`.
**Warning signs:** a live delivery row exists with `channel: 'whatsapp'` but `format IS NULL` after the phase ships.

### Pitfall 6: pre-Phase-163 `estimate_deliveries` rows break the `format` NOT NULL contract
**What goes wrong:** later someone tries to add `NOT NULL` to `format`, but existing rows are NULL and the constraint fails.
**Why it happens:** dormant-first migration by design leaves existing rows at NULL.
**How to avoid:** never add `NOT NULL` to `format` — it's a permanent nullable column. If a future phase needs to distinguish "unknown" from "explicit online_link", read `NULL` as legacy and treat it semantically as "unknown". The CHECK constraint `CHECK (format IN ('online_link', 'pdf', 'plain_text') OR format IS NULL)` documents this contract.
**Warning signs:** a future PR adding `SET NOT NULL` on `format` fails migration or requires backfilling.

## Code Examples

### 1. Resolver call at the top of a renderer (Modern share pattern for Phase 163)

```tsx
// components/share/estimate-document-modern.tsx (Phase 163 edit — top of function)
import { resolvePresentationSettings, isSectionVisible } from '@/lib/estimate/presentation-settings'

export function EstimateDocumentModern({data, ...}: EstimateDocumentModernProps) {
  const resolvedSettings = resolvePresentationSettings(data.presentation_settings) // ← ONE call
  const lang = (language ?? 'en') as EstimateLanguage
  // ...existing code...

  const visibleSections = isSectionVisible(resolvedSettings, 'sections')             // ← NEW gate
    ? data.sections
        .map((s) => ({ ...s, items: s.items.filter((i) => i.description.trim() !== '') }))
        .filter((s) => s.items.length > 0)
    : []                                                                            // ← hide all sections when toggled off

  // then, everywhere `data.summary != null` etc.:
  {isSectionVisible(resolvedSettings, 'summary') && data.summary != null && (
    <div>...</div>
  )}
}
```

### 2. Cast-with-fallback in a renderer that takes `EstimateWithSections` (Classic PDF pattern)

```tsx
// components/pdf/estimate-pdf.tsx (Phase 163 edit — top of EstimatePDF)
import { resolvePresentationSettings, isSectionVisible } from '@/lib/estimate/presentation-settings'

export default function EstimatePDF({estimate, ...}: EstimatePDFProps) {
  // Cast-with-fallback — mirrors components/share/estimate-view.tsx:157-161
  const resolvedSettings = resolvePresentationSettings(
    (estimate as { presentation_settings?: unknown }).presentation_settings
  )
  const brandColor = company.brand_primary_color ?? SYSTEM_COLORS.primary
  // ...

  // Section list gate (mirrors estimate-document.tsx pattern):
  const visibleSections = isSectionVisible(resolvedSettings, 'sections')
    ? estimate.sections
        .map((section) => ({...section, items: section.items.filter((i) => i.description.trim() !== '')}))
        .filter((section) => section.items.length > 0)
    : []

  // Terms block per-key gates:
  {isSectionVisible(resolvedSettings, 'payment_terms') && estimate.payment_terms && (
    <>...</>
  )}
}
```

### 3. Migration file (SENDHUB-03)

Full recommended file body — see § 3 above. Reference migration for the DROP+ADD-CONSTRAINT pattern is `supabase/migrations/20260526000005_phase81_whatsapp_delivery_channel.sql` (17 lines total).

### 4. WhatsApp force-share-link fallback (SENDHUB-02)

```typescript
// lib/whatsapp/send-estimate.ts (Phase 163 edit — after line 70)
type SendFormat = 'online_link' | 'pdf' | 'plain_text'

export async function deliverEstimateViaWhatsApp(params: {
  svc: SupabaseClient
  estimateId: string
  companyId: string
  toPhone: string
  clientId?: string | null
  clientName?: string | null
  customMessage?: string | null
  format?: SendFormat | null   // ← NEW, defaults to 'online_link' at call site
}): Promise<DeliverEstimateResult> {
  // ...existing code up through line 70...
  const deliveryFormat = (accountStatus.deliveryFormat ?? 'share_link') as DeliveryFormat

  // SENDHUB-02: PDF or Plain Text over WhatsApp ALWAYS falls back to the share link.
  // Byte-identical to today's `share_link` behavior; the company's account-wide
  // `pdf_attachment`/`formatted_text` preference is honored ONLY for the online_link format.
  const effectiveDeliveryFormat: DeliveryFormat =
    (params.format === 'pdf' || params.format === 'plain_text')
      ? 'share_link'
      : deliveryFormat

  // then swap every `deliveryFormat` → `effectiveDeliveryFormat` in the 3-way branch.
  // The two INSERT sites (line 123 + line 147) also get:  format: params.format ?? 'online_link'
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Channel-first Send tabs (Email / SMS / WhatsApp) | Format-first Send hub (Online Estimate / PDF / Plain Text) with per-format actions | Phase 163 (this phase) | Removes settings-drift risk; matches owner mental model ("what do I want to send" > "how do I send") |
| Ad-hoc `data.foo != null` checks in each renderer | `resolvePresentationSettings(...)` + `isSectionVisible(resolved, key)` at renderer boundary | Phase 161 defined it; Phase 162 wired 1 renderer; Phase 163 wires the remaining 5 | ONE source of truth for section visibility across all 6 output surfaces |
| Inline `/estimate/${share_token}` URL construction | `buildEstimatePublicPath({slug, name}, {id, public_slug_token, share_token})` | Phase 160 (all call sites migrated) | Friendly URLs everywhere; single builder audited by sweep test |
| Destructive `toggleField()` clears content when hidden | Non-destructive `presentation_settings.sections.<key> = false` preserves content | Phase 161 (replaced Phase 162 gear panel writer) | Owners can hide+re-show without losing generated content |
| Per-send delivery format on WhatsApp only (via `company_whatsapp.delivery_format`) | Per-send format explicit on `estimate_deliveries.format` (independent of transport channel) | Phase 163 | Every action (copy/open/download/send/manual) audited with format context |

**Deprecated / dead code confirmed by this research:**
- `components/workspace/send/send-tab.tsx` — already unreferenced anywhere in prod code; can be deleted independently
- `components/workspace/send/estimate-preview.tsx::EstimatePreview` — only imported by dead `send-tab.tsx`
- `components/workspace/send/estimate-preview.tsx::LanguageFlagChip` — used by living `send-dialog.tsx`; needs re-home before deletion

## Open Questions

1. **Provider = `'client'` sentinel vs. `provider NULL`.**
   - What we know: current schema has `provider TEXT NOT NULL CHECK (provider IN ('resend', 'twilio', 'meta'))`. Copy/open/download/manual actions don't go through a network provider.
   - What's unclear: is a `'client'` sentinel value semantically cleaner, or is `provider NULL` more honest? A NULL constraint change requires an extra `ALTER TABLE`.
   - Recommendation: **use `'client'` sentinel** (widen CHECK), skip the `SET NOT NULL DROP` — smaller migration, backward-compatible with any dashboard/query that assumes provider is always non-null. Ratified as part of Phase 163 discretion.

2. **PDF download logging.**
   - What we know: `/api/estimates/[id]/pdf/route.ts` currently does NOT insert any `estimate_deliveries` row. It's a GET endpoint that streams bytes.
   - What's unclear: should the GET insert on every fetch (including the owner's own preview), or only when hit from the hub with an explicit `?from=hub` query param?
   - Recommendation: add a `?deliveryLog=true` (or similar) query param — the hub sets it, the owner's ad-hoc `/api/estimates/[id]/pdf` fetch (if such a flow exists) doesn't. This keeps preview fetches unlogged and hub deliveries logged. Planner's discretion — either shape works.

3. **`Copy Online Estimate URL` action + owner's own `share_expires_at` handling.**
   - What we know: `markAsSentAction` and the send routes refresh `share_expires_at` via `shareLinkExpiryFromNow()`. A copy action doesn't SEND anything — but if the copied link expires quickly, the client can't open it.
   - What's unclear: should copying the URL refresh `share_expires_at` too, or only actual sends?
   - Recommendation: **do not refresh** on copy — copy is a passive action; expiry is refreshed only when a delivery is confirmed to have gone out (Phase 160/162 precedent). If owners complain, add later.

4. **`LanguageFlagChip` re-homing.**
   - What we know: currently lives in `estimate-preview.tsx` (dying file); there's a DIFFERENT copy inside `estimate-view.tsx:37` for the shared-view surface.
   - What's unclear: should Phase 163 consolidate the two copies into `components/i18n/language-flag-chip.tsx`, or just move the send-side copy?
   - Recommendation: **move only the send-side copy** into `components/workspace/send/language-flag-chip.tsx` (or fold into the hub file directly). Consolidation with the shared-view copy is a separate refactor — the two components have slightly different styling (`border-[var(--glass-border)]` vs `border-border/50`).

## Project Constraints (from CLAUDE.md)

- **Tech Stack:** Next.js 14+ (App Router — already on 16.2.6), TypeScript strict, Tailwind, shadcn/ui, Zustand or React Context, react-hook-form + zod. **All Phase 163 code must stay within this stack.**
- **Database:** Supabase PostgreSQL with RLS on all tables. Phase 163's migration keeps `estimate_deliveries`'s existing RLS policies unchanged.
- **PDF:** `@react-pdf/renderer` server-side. Confirmed 4.4.0 in use.
- **Mobile:** every hub interaction must work on iOS Safari + Android Chrome — copy actions rely on `navigator.clipboard.writeText` which requires HTTPS (fine, prod is HTTPS).
- **Security:** service role key never exposed to browser; all AI calls server-side. Phase 163 doesn't invoke any AI. All `estimate_deliveries` inserts use `requireServiceClient()` (already the pattern in the 3 existing routes) — do not switch to the browser client.
- **Secret handling (CRITICAL):** never commit secrets — no `whsec_` / `sk_` / `rk_` / `sb_secret_` / `sk-ant-` / `sk-proj-` / `re_` values in code, planning docs, or examples. Phase 163's plans + docs use placeholders only. The pre-commit `gitleaks` hook enforces this.
- **GSD workflow enforcement:** file edits happen through a GSD command; Phase 163 executes through `/gsd:execute-phase 163`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 + @testing-library/react 16.3.2 + jsdom |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm test -- tests/unit/estimate/presentation-settings-cross-surface` (or `npx vitest run tests/unit/estimate/presentation-settings-cross-surface`) |
| Full suite command | `pnpm test` (runs `vitest run`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SENDHUB-01 | Send opens a hub with 3 format cards (Online Estimate/PDF/Plain Text); no channel-first tabs, no Share & Export menu | integration (JSX render with `@testing-library/react`) | `pnpm test -- tests/unit/workspace/send-hub-dialog.test.tsx` | ❌ Wave 0 — new file |
| SENDHUB-02 | POST /send-sms with `{format: 'pdf'}` or `{format: 'plain_text'}` still delivers the share link (byte-identical body vs `{format: 'online_link'}`); WhatsApp same behavior | integration (mock Twilio/Meta client, assert body of `sendSms` / `sendWhatsAppMessage`) | `pnpm test -- tests/unit/api/send-sms-format-fallback.test.ts` `pnpm test -- tests/unit/whatsapp/send-estimate-format-fallback.test.ts` | ❌ Wave 0 — new files |
| SENDHUB-03 | Every `estimate_deliveries` INSERT payload includes `format` field; migration adds column + widens channel + provider CHECK | unit (static grep-based, similar to `presentation-settings.test.ts:131-134`) + migration-contract | `pnpm test -- tests/unit/estimate/delivery-insert-format.test.ts` `pnpm test -- tests/unit/db/phase163-migration-contract.test.ts` | ❌ Wave 0 — new files |
| SENDHUB-04 | All 6 renderers import `resolvePresentationSettings`; each function gates section visibility on the resolver's output | unit (structural grep + JSX render + PDF tree-walk) | `pnpm test -- tests/unit/estimate/presentation-settings-cross-surface.test.tsx` | ❌ Wave 0 — new file (extract `_pdf-text-walker.ts` helper too) |
| SENDHUB-05 | Single `presentation_settings.sections.sections = false` toggle hides item descriptions across ALL 6 surfaces; `null` retrocompat keeps today's behavior byte-identical | unit (JSX render + PDF tree-walk + string) | `pnpm test -- tests/unit/estimate/presentation-settings-cross-surface.test.tsx` | ❌ Wave 0 — new file (SAME file as SENDHUB-04) |
| SENDHUB-06 | Hub renders `<Mark as Sent>` button that calls `markAsSentAction`; `<LanguageFlagChip>` visible in hub | integration (JSX render, assert button + chip present; mock the server action, assert it's called) | `pnpm test -- tests/unit/workspace/send-hub-mark-as-sent.test.tsx` | ❌ Wave 0 — new file (may fold into SENDHUB-01 test) |

### Sampling Rate
- **Per task commit:** `pnpm test -- tests/unit/estimate/presentation-settings-cross-surface.test.tsx tests/unit/estimate/delivery-insert-format.test.ts` (fast: < 5 s)
- **Per wave merge:** `pnpm test -- tests/unit/estimate/ tests/unit/pdf/ tests/unit/whatsapp/ tests/unit/utils/estimate-template.test.ts tests/unit/workspace/` (all send/render-adjacent tests)
- **Phase gate:** `pnpm test` (full suite green) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/estimate/_pdf-text-walker.ts` — extract `collectTextNodes` + `flattenText` from `tests/unit/pdf/estimate-pdf-totals.test.tsx:22-51`; shared helper for cross-surface test AND future PDF tests
- [ ] `tests/unit/estimate/presentation-settings-cross-surface.test.tsx` — covers SENDHUB-04 + SENDHUB-05 (3 `it`s: hidden-sections, hidden-summary, retrocompat + a 4th structural grep test)
- [ ] `tests/unit/estimate/delivery-insert-format.test.ts` — static grep test asserting every `estimate_deliveries.insert({...})` payload in the codebase includes a `format:` field (covers SENDHUB-03 static gate)
- [ ] `tests/unit/db/phase163-migration-contract.test.ts` — parses the new migration file, asserts `format` column added + `channel` CHECK widened to include copy/open/download/manual + `provider` CHECK widened to include `client` (mirrors Phase 160's Plan 01 migration-contract test)
- [ ] `tests/unit/api/send-sms-format-fallback.test.ts` — mock Twilio, POST `/send-sms {format: 'pdf'}` and `{format: 'online_link'}`, assert the SMS body is byte-identical (both are share-link URLs)
- [ ] `tests/unit/whatsapp/send-estimate-format-fallback.test.ts` — mock Meta send, call `deliverEstimateViaWhatsApp({format: 'pdf', ...})` when `accountStatus.deliveryFormat = 'pdf_attachment'`, assert the outbound message is a `type: 'text'` share-link body (NOT a `type: 'document'` PDF)
- [ ] `tests/unit/workspace/send-hub-dialog.test.tsx` — SENDHUB-01 + SENDHUB-06 combined: render `<SendHubDialog open ...>`, assert 3 format cards, no `<Tabs>` / no "Share & Export" text, `<Mark as Sent>` present + wired, `<LanguageFlagChip>` present

**Hidden regressions the plan MUST guard against:**

- **Classic PDF byte-identity for pre-Phase-163 estimates with `presentation_settings: null`.** The 3rd `it` (retrocompat) in the cross-surface test covers this — the item description MUST still appear.
- **Existing PDF tests (`tests/unit/pdf/estimate-pdf-totals.test.tsx` + `estimate-pdf-modern-totals.test.tsx`) must stay green.** They use `presentation_settings: null` (line 116 of the classic test) — retrocompat contract enforced. Phase 163 changes to those files that break the tree walk fail here first.
- **Existing WhatsApp formatter test (`tests/unit/whatsapp/formatter.test.ts`) must stay green** with the new signature (nullable trailing `presentation_settings?` arg — existing calls omit it, get `null`, resolve to defaults).
- **Existing plain-text template test (`tests/unit/utils/estimate-template.test.ts`) must stay green** with `buildItemsBreakdown`'s new nullable second arg — existing calls omit it, resolve to defaults.
- **Existing WhatsApp `send-estimate` test (`tests/unit/whatsapp/send-route.test.ts`) must stay green** with the new nullable `format` param on `deliverEstimateViaWhatsApp` — existing calls omit it, get `undefined`, treated as `'online_link'`.
- **The classic share renderer's Phase 162 gates (summary/payment_terms/timeline/warranty_terms/notes/photos) must stay wired.** The cross-surface test's `sections.summary = false` case exercises this.
- **`markAsSentAction`'s existing behavior (sent_at, share_expires_at, projects.status, estimate_activity, Xphere sync, revalidatePath).** Phase 163 ADDS an `estimate_deliveries` insert — it does NOT remove or reorder any existing side-effect. A dedicated regression test asserting all 5 side effects still fire is prudent.
- **`estimate-document.tsx:1602`'s existing empty-item filtering.** Adding the `isSectionVisible(resolvedSettings, 'sections')` gate must PRESERVE the empty-item filter — this is a wrap, not a replacement.

## Sources

### Primary (HIGH confidence — direct source file evidence)

- `.planning/phases/163-format-first-send-hub-cross-surface-settings-rollout/163-CONTEXT.md` — locked decisions + discretion boundaries
- `.planning/REQUIREMENTS.md` — SENDHUB-01..06 acceptance criteria + milestone locks
- `.planning/ROADMAP.md` § Phase 163 (lines 2568-2583) — goal + success criteria
- `lib/estimate/presentation-settings.ts` (Phase 161, frozen) — resolver contract
- `lib/estimate/public-url.ts` (Phase 160, frozen) — friendly URL contract
- `components/workspace/estimate/presentation-settings-panel.tsx` (Phase 162) — writer surface
- `components/workspace/estimate/estimate-tab.tsx:71,161-175` — dialog state ownership
- `components/workspace/estimate/estimate-floating-actions.tsx:80` — Send button
- `components/workspace/estimate/estimate-editor.tsx:270-273` — Send handler
- `components/workspace/send/send-dialog.tsx` — current dialog shell
- `components/workspace/send/send-form.tsx` — current channel-first tabs
- `components/workspace/send/send-actions-menu.tsx:112` — "Share & Export" dropdown text
- `components/workspace/send/send-tab.tsx` — CONFIRMED-DEAD file
- `components/workspace/send/estimate-preview.tsx` — dying file + LanguageFlagChip
- `components/workspace/send/plain-text-sheet.tsx` — reusable in new hub
- `components/pdf/estimate-pdf.tsx:450` — EstimatePDF entry
- `components/pdf/estimate-pdf-modern.tsx:462` — EstimatePDFModern entry
- `components/share/estimate-document-modern.tsx:191` — Modern share entry
- `components/workspace/estimate/estimate-document.tsx:1592,1602-1606,1819,1936,1949,1961,1974,1990` — Classic share resolver call sites + un-gated line-items block
- `components/share/estimate-view.tsx:157-161,194-198` — cast-with-fallback pattern precedent + templateId resolution
- `lib/whatsapp/formatter.ts:123,131,141` — WhatsApp entry + language + section loop
- `lib/whatsapp/send-estimate.ts:70,91-120,123,147` — WhatsApp dispatcher + PDF fallback + INSERT sites
- `lib/utils/estimate-template.ts:51,85,87` — plain-text template entry + `buildItemsBreakdown` section filter
- `lib/actions/estimate.ts:733-778` — markAsSentAction
- `app/api/estimates/[id]/send/route.ts:191,208` — email INSERT sites
- `app/api/estimates/[id]/send-sms/route.ts:104-110,119,136` — SMS INSERT sites + already-link-only body
- `app/api/estimates/[id]/send-whatsapp/route.ts` — WhatsApp route dispatch shell
- `app/api/estimates/[id]/pdf/route.ts:20-23,95` — PDF template registry map
- `supabase/migrations/20260519000003_estimate_deliveries.sql` — base schema
- `supabase/migrations/20260526000005_phase81_whatsapp_delivery_channel.sql` — DROP+ADD CHECK precedent
- `supabase/migrations/20260708000002_phase161_presentation_settings.sql` — dormant-first JSONB precedent
- `tests/unit/pdf/estimate-pdf-totals.test.tsx:22-77` — PDF tree-walker helper
- `tests/unit/estimate/presentation-settings.test.ts:131-134` — GUARD-03 static-boundary grep idiom
- `tests/unit/whatsapp/formatter.test.ts` — string-formatter testing pattern
- `vitest.config.ts` + `package.json` — test infrastructure

### Secondary (MEDIUM confidence — inferred from context)

- Phase 162's byte-identity retrocompat concern (referenced in the phase's own SUMMARY files) — treated as a load-bearing invariant Phase 163 must not break
- The `provider = 'client'` sentinel is a Claude-recommendation, not a codebase precedent — recommended over `NULL` because it stays inside the existing NOT NULL contract

### Tertiary (LOW confidence — none for this phase)

All findings are grounded in direct source file evidence; no LOW-confidence items.

## Metadata

**Confidence breakdown:**
- Send-surface inventory (Q1): HIGH — every file:line verified directly.
- 6-renderer inventory (Q2): HIGH — every file:line + entry function + insertion point confirmed by direct read.
- `estimate_deliveries` schema (Q3): HIGH — base migration + widening precedent + 6 INSERT sites all verified.
- SMS/WhatsApp fallback (Q4): HIGH — routes read; SMS is already link-only; WhatsApp has explicit fallback branch.
- Mark as Sent + language (Q5): HIGH — server action read; grep confirms no language picker exists today.
- Cross-surface test (Q6): HIGH — existing patterns identified; skeleton designed against real signatures.
- Deletion sweep (Q7): HIGH — grep evidence for each file; SendTab confirmed dead independently.
- Nyquist Validation (Q8): HIGH — test framework + assertion patterns identified; Wave 0 gaps enumerated.

**Research date:** 2026-07-08
**Valid until:** 2026-08-08 (30 days — the codebase is under continuous phase-work; renderers and delivery insert sites may shift after later phases land)
