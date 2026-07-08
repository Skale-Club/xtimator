# Phase 163: Format-First Send Hub & Cross-Surface Settings Rollout - Context

**Gathered:** 2026-07-08
**Status:** Ready for planning
**Mode:** Autonomous (owner unreachable per no-checkpoint-interruptions memory; ROADMAP goal + success criteria treated as spec, everything else = Claude's Discretion)

<domain>
## Phase Boundary

Two coordinated deliverables that must ship together because they share the same seam (Send-time render selection):

1. **Format-first Send hub UI** — replace the channel-first Email/SMS tabs + the separate "Share & Export" menu with a single Send hub organized by FORMAT: **Online Estimate** (default), **PDF**, **Plain Text**. Each format exposes its own delivery actions (copy / open / email / SMS / WhatsApp / download) as applicable to it. `Mark as Sent` + language selection stay as secondary actions, visually subordinate to the three primary format choices.

2. **Cross-surface settings rollout** — wire Phase 161's `resolvePresentationSettings()` + `isSectionVisible()` into every remaining renderer/formatter path so ONE presentation-settings toggle produces identical section visibility across all six output surfaces: **classic PDF**, **modern PDF**, **classic share page**, **modern share page**, **plain-text template**, **WhatsApp formatter**. Proven by a dedicated cross-surface verification test — not just editor preview parity.

Requirements in scope: SENDHUB-01, SENDHUB-02, SENDHUB-03, SENDHUB-04, SENDHUB-05, SENDHUB-06.

Non-goals (deferred to future milestones):
- New attachment-delivery channels — PDF/Plain-Text over SMS/WhatsApp falls back to the Online Estimate link (SENDHUB-02, explicit).
- Any changes to `lib/estimate/presentation-settings.ts` (Phase 161 resolver is frozen).
- Any changes to `estimate-document.tsx`'s in-editor visibility gate (Phase 162 already resolved this via the gear panel).
- Send-time edits to the estimate itself (this is a hub for choosing format + delivery, not an editor).

</domain>

<decisions>
## Implementation Decisions

### Locked by ROADMAP (non-negotiable)

- **Three primary format choices**: Online Estimate (default) / PDF / Plain Text. Nothing else at top level.
- **Old surfaces GONE**: channel-first Email + SMS tabs, separate "Share & Export" menu — deleted, not hidden.
- **Fallback rule for non-online formats over messenger channels**: SMS / WhatsApp deliveries for PDF or Plain Text ship the Online Estimate URL instead of an attachment payload (SENDHUB-02, explicit no-new-channel).
- **Cross-surface parity is testable**: a dedicated integration/verification test proves toggling a single presentation-settings option produces identical section visibility across all 6 output surfaces (SENDHUB-04). Editor preview parity is not sufficient evidence.
- **estimate_deliveries widening**: every send/copy/open/download records `format ∈ {online_link, pdf, plain_text}` AND widened `channel ∈ {email, sms, whatsapp, copy, open, download, manual}`. Column shape decisions (single new column vs enum widening) resolved during research.
- **Secondary actions**: `Mark as Sent` + language selection stay accessible in the hub but must be visually subordinate to the three format choices (not gated behind an overflow menu — just visually secondary).

### Claude's Discretion (autonomously chosen)

- **Hub layout**: three format cards laid horizontally on desktop, stacked on mobile, each card as a self-contained action group. Alternative (tabbed segment control) rejected — cards make each format's delivery actions individually discoverable without a click.
- **Default format**: Online Estimate (matches SENDHUB-01 "default" language + the friendly-URL surface Phase 160 landed).
- **Copy actions**: reuse the existing `navigator.clipboard.writeText` pattern; toast on success/error.
- **PDF download**: reuse existing `@react-pdf/renderer` server route (already in the codebase per Phase spec).
- **Migration for `estimate_deliveries.format`**: additive-nullable column (mirrors Phase 161's dormant-first migration pattern), no DEFAULT — existing rows read as legacy/unknown.
- **Cross-surface resolver call site**: each renderer imports `resolvePresentationSettings` at the boundary where it constructs its section list (top of the render function). No renderer duplicates the logic; no renderer skips it. The verification test greps for the import in each of the 6 files.
- **WhatsApp formatter**: the current formatter is a pure text function — pipe presentation_settings into it as a new nullable arg, defaulting to `null` (= today's behavior). No formatter signature explosion.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 161 resolver** (`lib/estimate/presentation-settings.ts`): `resolvePresentationSettings(settings)` + `isSectionVisible(resolved, key)` + `hasEstimateBeenSentOrViewed(sent_at, viewed_at)`. Every renderer's ONE source of truth for visibility + PRESENT-05 sent/viewed state.
- **Phase 160 friendly URL** (`lib/estimate/public-url.ts` + `buildEstimatePublicPath()`): the Online Estimate tab's URL surface. Already backfilled + verified.
- **Phase 162 `presentation-settings-panel.tsx`**: the writer side — hub only READS `presentation_settings`, never mutates it.
- **Existing send-time infrastructure**: whatever routes/actions currently handle Email/SMS delivery — the research pass will inventory them exhaustively.
- **`estimate_deliveries` table**: exists; needs a `format` column addition + `channel` enum widening.

### Established Patterns
- **Dormant-first migrations** (Phase 129/161 precedent): additive-nullable columns; existing rows carry the "today's behavior" semantics; no DEFAULT; no data-migration script.
- **Cast-with-fallback destructuring** in readers when the query type may lag the column (Phase 161 initState pattern).
- **`resolvePresentationSettings` at the render boundary** (Phase 162 estimate-document.tsx precedent): called once at the top of the render function, threaded into every conditional.

### Integration Points
- **Editor `Send` button** currently opens the old channel-first dialog. Replace whatever component that is with `<SendHubDialog>`.
- **Server actions**: existing Email/SMS delivery endpoints stay — they just get invoked with a new `format` param and log deliveries with the widened schema.
- **6 renderer files**: exact paths resolved during research (candidates: `components/pdf/estimate-pdf.tsx` + `components/pdf/estimate-pdf-modern.tsx` + share-page components + `lib/estimate/plain-text-template.ts` + `lib/whatsapp/format-estimate.ts`, but research must confirm the actual file layout).

</code_context>

<specifics>
## Specific Ideas

- The verification test for SENDHUB-04 should render each of the 6 surfaces with an estimate whose `presentation_settings.sections.timeline = false`, then grep the output for the timeline value string. All 6 must return "not found" — proven identically, not per-surface asserted.
- Sub-step order: (a) migration + estimate_deliveries schema; (b) resolver rollout across the 6 renderers with cross-surface test; (c) SendHubDialog UI + delivery-action wiring; (d) delete old channel-first surfaces. Ordering isn't ROADMAP-locked but this order minimizes half-shipped states.
- Deletion sweep at the end: grep for old dialog/menu component names must return zero external references (mirrors the Phase 162 client-picker consolidation acceptance pattern).

</specifics>

<deferred>
## Deferred Ideas

- Native attachment delivery for SMS/WhatsApp (SENDHUB-02 explicitly punts this — always fallback to link).
- Rich delivery analytics beyond the current schema (row count, open/view tracking) — out of scope.
- Any renderer redesign — this phase wires the resolver in, doesn't redesign PDFs or share pages.
- Any changes to the Phase 161 resolver module — frozen.

</deferred>
