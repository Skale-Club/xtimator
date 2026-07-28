# Architecture Research — v4.23 Unified Estimate Document Engine

**Domain:** Integration research (subsequent milestone) — unifying Xtimator's estimate webview + PDF rendering into one shared document engine, plus a new paginated editable editor mode.
**Researched:** 2026-07-27
**Confidence:** HIGH — every claim below is grounded by reading the actual files (paths + line evidence cited throughout), not inferred from the milestone description. Two places where the milestone's own framing is corrected by the code are called out explicitly.

## Correction to the milestone framing (read this first)

PROJECT.md's v4.23 section says the PDF must copy the webview's "signature block (signed estimates currently produce PDFs indistinguishable from unsigned ones)". **The webview does not render a signature block either.** Grepped the entire `components/` and `lib/` trees for `signature_data`/`signer_name`/`estimate_signatures` outside the sign-flow itself (`components/share/estimate-view.tsx`'s `SignaturePad` capture UI and `app/api/estimates/[id]/sign/route.ts`'s insert) — **zero renderers** display the drawn signature (`estimate_signatures.signature_data`, a base64 PNG), the signer name, or the signed date anywhere. Post-acceptance, `estimate-view.tsx:443-454` shows only a generic "Estimate Accepted ... on {date}" message with no signature image. So this is **net-new functionality for both surfaces**, not a "copy an existing webview feature into the PDF" task. Plan accordingly — it needs new data plumbing (see Q1/Q3) in addition to new rendering.

Second correction: photo captions are not "resolved but silently dropped" only in the PDF — the **webview also never displays caption text**, it only sets it as `alt={photo.caption ?? ''}` (`components/workspace/estimate/estimate-document.tsx:1546`, `components/share/estimate-document-modern.tsx:568`). The PDF route (`app/api/estimates/[id]/pdf/route.ts:127-132`) already resolves and passes `{ url, caption }` per photo, but neither `components/pdf/estimate-pdf.tsx` nor `estimate-pdf-modern.tsx` reads `photo.caption` in JSX — only `photo.url`. So captions need to be added to **all four** surfaces, with the webview equally lacking it today.

## System Overview — current state (before this milestone)

```
                         ┌────────────────────────────┐
                         │ lib/estimate/templates/     │
                         │ registry.ts (classic|modern)│  ← already shared, keep
                         └──────────────┬───────────────┘
                                        │ templateId
              ┌─────────────────────────┼─────────────────────────┐
              ▼                                                   ▼
   WEBVIEW (components/share/estimate-view.tsx, next/dynamic)     PDF (app/api/estimates/[id]/pdf/route.ts,
              │                                                    PDF_TEMPLATE_COMPONENTS map)
   ┌──────────┴──────────┐                              ┌──────────┴──────────┐
   │ estimate-document.tsx│                              │ estimate-pdf.tsx     │  Classic
   │ (Classic, mode=view/ │                              │ (~860 lines)         │
   │  edit — 2038 lines)  │                              └──────────────────────┘
   ├───────────────────────┤                             ┌──────────────────────┐
   │ estimate-document-    │                              │ estimate-pdf-modern  │  Modern
   │ modern.tsx (view-only,│                              │ .tsx (~862 lines)    │
   │  579 lines)           │                              └──────────────────────┘
   └───────────────────────┘
        ▲ ZERO shared layout/label/format code with the PDF column.
        Each of the 4 files independently defines: label map, formatAddress(),
        formatDate()+DATE_LOCALE, and its own section/totals JSX.

   ALREADY SHARED across all 4 (do not touch, keep as-is):
   lib/money/currency.ts (formatMoney), lib/color/contrast.ts
   (ensureReadableOnWhite/readableTextColor), lib/estimate/deposit-display.ts
   (deriveDepositDisplay — locked order Subtotal→Discount→Tax→Total→Deposit→
   BalanceDue), lib/estimate/presentation-settings.ts (resolvePresentationSettings/
   isSectionVisible — the ONE section-visibility gate all 4 files already call).

   SEND PATHS THAT BYPASS THE REGISTRY ENTIRELY (confirmed by grep, zero matches
   for the registry/snapshot symbols in either file):
   app/api/estimates/[id]/send/route.ts:7,192        → hardcoded `EstimatePDF` (Classic)
   lib/whatsapp/pdf-delivery.ts:15,48                 → hardcoded `EstimatePDF` (Classic)
   Neither loads `loadLatestSignedSnapshot`/`applySignedSnapshot` — both violate
   TRUST-01 (render live rows even after a snapshot-freezing signature exists).
   app/api/estimates/[id]/pdf/route.ts already does both correctly (lines 22-25
   template registry map, lines 60-66 snapshot load+apply) — the send paths just
   need to copy that existing, already-proven pattern.
```

## Q1 — Shared "document model + design tokens + labels" module

### What exists today (the 4 independent copies)

| Concern | Classic webview<br>`components/workspace/estimate/estimate-document.tsx` | Modern webview<br>`components/share/estimate-document-modern.tsx` | Classic PDF<br>`components/pdf/estimate-pdf.tsx` | Modern PDF<br>`components/pdf/estimate-pdf-modern.tsx` |
|---|---|---|---|---|
| Label map | `DOC_LABELS` (L63-196), full edit+view superset (incl. `discountNone`, `depositPct`, `addItem`, etc.) | `DOC_LABELS` (L66-142), a **view-only trimmed subset** — file's own comment (L36-37) says "trimmed to only the keys this view-only document renders" | `PDF_LABELS` (L57-142) | `PDF_LABELS` (L60-145) — **byte-identical** to Classic PDF's map (confirmed diff) |
| `formatAddress()` | L414-427 | L155-168 (comment L151-153: "duplicated verbatim... small, self-contained") | L198-215 | L201-218 — same body as Classic PDF |
| `formatDate()` + `DATE_LOCALE` | L429-441 (has the local-midnight `T00:00:00` normalization fix) | L144-148, L170-177 (lacks the local-midnight fix) | L144-148, L217-224 | same as Classic PDF |
| Design tokens (colors/fonts/spacing) | inline Tailwind classes + `SYSTEM_COLORS`/brand-color computed via `ensureReadableOnWhite`/`readableTextColor` | same mechanism, different Tailwind classes (serif, hairlines) | `StyleSheet.create()` object literal, Helvetica, brand-fill headers (L226-452) | separate `StyleSheet.create()` object literal, Times-Roman, hairline headers (L229-464) — no shared source with Classic PDF's numbers |
| Data model type | `EstimateDocumentData`/`DocumentCompany`/`DocumentClient`/`DocumentItem`/`DocumentSection`/`DocumentPhoto` (exported, L266-374) | imports the same types from `estimate-document.tsx` (type-only import, L12-16) — good precedent, reuse this pattern | `EstimatePDFProps` wrapping `EstimateWithSections` (`lib/queries/estimate.ts`) + local `CompanyInfo`/`ClientInfo` (L158-196) | same shape, separately declared (L161-199) |

**No `lib/estimate/document/` (or similar) module exists yet** — greenfield extraction, not a rename of something that's half-there.

### Recommended module: `lib/estimate/document/`

New files (all new, pure, no React/react-pdf import so both renderer families can use them):

- **`lib/estimate/document/model.ts`** — the canonical `DocumentModel` type. Should be a superset of today's `EstimateDocumentData` (webview) that also covers what the PDF route already resolves server-side (`preparedBy`, per-photo `{url, caption}`) plus the two genuinely new fields: a `signature` block (`signerName`, `signedAt`, `signatureImageDataUrl`) and nothing else new — everything else (sections/items/totals/terms) is already structurally identical across all 4 files. Keep `EstimateDocumentData` as a type alias/subset of `DocumentModel` rather than rewriting `estimate-editor.tsx`'s `stateToDocumentData()` — minimizes blast radius.
- **`lib/estimate/document/labels.ts`** — one canonical label record, a union of all 3 current label sets (edit-mode extras from Classic webview's `DOC_LABELS`, plus PDF-only `page`/`of`/`preparedBy`, plus new `signedBy`/`signedOn`/`photoCaption`-adjacent keys if needed). Both webview files and both PDF files import from here; each keeps only the keys it renders (unused keys are harmless).
- **`lib/estimate/document/format.ts`** — single `formatAddress()`, single `formatDate()` + `DATE_LOCALE`. **Use the Classic webview's version** (`estimate-document.tsx:429-441`) as the source of truth — it's the only one of the 4 with the local-midnight `T00:00:00` normalization fix; the other 3 copies are missing it and are a latent timezone bug for date-only strings.
- **`lib/estimate/document/tokens.ts`** — `Record<EstimateTemplateId, DesignTokens>` (keyed off the **existing** `EstimateTemplateId` from `lib/estimate/templates/registry.ts` — do not invent a second id enum). `DesignTokens` must be plain values (hex colors, point/px numbers, font family strings) — **not Tailwind class strings** — because `@react-pdf/renderer`'s `StyleSheet.create()` cannot consume Tailwind at all; the webview then either maps token values to inline `style={}` (as it already does for `brandColor`/`brandText` today) or through a small resolver. This is the only design that lets one token source feed both a Tailwind-class-based DOM tree and a `StyleSheet.create()` object.

### Exhaustive parity checklist — what the PDF (and, per the corrections above, in two cases the webview too) must gain

| Element | Classic webview | Modern webview | Classic PDF | Modern PDF | Action needed |
|---|---|---|---|---|---|
| Signature block (image + signer + date) | **Missing** | **Missing** | **Missing** | **Missing** | **New everywhere.** Data source: `estimate_signatures.signer_name`/`signature_data`/`signed_at`, currently only read by `lib/queries/share.ts:loadLatestSignedSnapshot()` (which selects `signed_content`/`signed_total`, NOT the display fields) and `app/api/estimates/[id]/sign/route.ts` (insert). Needs a new/extended query. |
| Photo caption text | Alt-text only (L1546) | Alt-text only (L568) | Not rendered (data present, JSX ignores it) | Not rendered (data present, JSX ignores it) | **New everywhere.** No new data plumbing needed — `caption` is already threaded through `DocumentPhoto`/`app/api/estimates/[id]/pdf/route.ts:127-132`. |
| Estimate Terms (`company.estimate_terms_enabled/text`) | Rendered **outside** the document card, as a sibling `<Card>` in `components/share/estimate-view.tsx:322-336` (applies to both templates since it's in the page wrapper, not the doc component) | same (page wrapper) | Rendered **inside** `termsSection`, `estimate-pdf.tsx:783-792` | Rendered **inside** `termsSection`, `estimate-pdf-modern.tsx:784-792` | Structural divergence, not a missing-feature gap — content is present everywhere. Decide once: does Estimate Terms belong inside `DocumentModel`'s terms block, or stay a page-level wrapper concern? Recommend keeping it a page-level concern (webview) mirrored by a terms-block append (PDF) — avoids moving it into the new paginated flow unnecessarily. |
| "Prepared by" (staff/owner name) | **Missing** (no equivalent field in `EstimateDocumentData`) | **Missing** | Present, `estimate-pdf.tsx:842-847` | Present, `estimate-pdf-modern.tsx:843-848` | PDF-only today. Not explicitly required by the milestone's parity list — flag as an open scope question rather than assume it must be added to webview. |
| Section header / item table / mobile cards / section subtotal | Present | Present | Present (single fixed-width table, no responsive concept — PDF has no viewport) | Present | Already structurally parallel across all 4 — formalize into the shared model's section-block shape but no missing content. |
| Totals order (Subtotal→Discount→Tax→Total→Deposit→BalanceDue) | Present, `DocumentTotals` (L991-1255) | Present (L450-507) | Present (L708-772), comment literally states the locked order | Present (L714-773), same locked order | Already consistent via `deriveDepositDisplay` — no gap, keep as-is. |
| Section-visibility gating | `isSectionVisible(resolvedSettings, ...)` throughout | same | same | same | Already the single shared gate (`lib/estimate/presentation-settings.ts`) — do not duplicate, extend its `SectionKey` union only if signature/captions need independent visibility toggles (open product question, not required by the milestone text). |

### What stays untouched

`lib/estimate/templates/registry.ts`, `lib/estimate/presentation-settings.ts`, `lib/money/currency.ts`, `lib/color/contrast.ts`, `lib/estimate/deposit-display.ts`, `lib/estimate/compute-totals.ts` (GUARD-03 math — the document engine only ever *reads* persisted totals, never recomputes; no changes belong here at all).

## Q2 — Where the pagination engine lives, and its contract

### Location

`lib/estimate/pagination/` — matches the existing `lib/estimate/*` module convention (`compute-totals.ts`, `presentation-settings.ts`, `deposit-display.ts`, `templates/registry.ts` all live flat under `lib/estimate/`). Confirmed via repo-wide grep that **no pagination code of any kind exists yet** — the ~24 files matching `pagination` are all unrelated (admin table pagination, MCP list pagination). This is greenfield.

### Why this can't be one trivial shared function — and what the real contract is

`@react-pdf/renderer` and the DOM are different layout engines with fundamentally different measurement mechanisms:

- **DOM (paginated editor mode)**: block heights can be measured for real, live, against actually-mounted elements (`ResizeObserver`/`getBoundingClientRect()`), at the existing 816px/1056px US-Letter proxy the codebase already established (`min-h-[1056px]`/`max-w-[816px]`, Quick-260718-p3v, `estimate-document.tsx:1663-1670`, `estimate-editor.tsx:714-715`).
- **react-pdf (server-side, Alpine container per PROJECT.md)**: there is no cheap way to pre-measure real DOM text wrapping before render. react-pdf itself already does implicit reflow via `wrap`/`fixed`/`break` — but that's exactly what the milestone wants to REPLACE with one deterministic rule engine, because implicit reflow can't be told "never split a line item" or "keep section header with its first row" in a way that's guaranteed to match the DOM preview's breaks.

**Conclusion: byte-identical pixel output between the two engines was never actually achievable** (they use different fonts — Helvetica/Times-Roman built-ins in react-pdf vs. the DOM's system `font-sans`/serif stack — so text wraps differently regardless). The real, achievable contract is: **the same deterministic RULES, applied to each engine's own best-effort block-height measurements.**

### Proposed contract

```ts
// lib/estimate/pagination/types.ts
interface PageBlock {
  id: string
  kind: 'section-header' | 'item-row' | 'section-subtotal' | 'totals'
      | 'terms-block' | 'photos-grid' | 'signature-block'
  height: number          // normalized unit (points); SUPPLIED by the caller's
                           // measurement provider — this module never measures anything itself
  keepWithNext?: boolean    // e.g. section-header keeps with its first item-row
  keepWithPrevious?: boolean // e.g. section-subtotal keeps with its section's last row
  groupId?: string          // rows sharing a groupId avoid an orphaned header at a page bottom
}

interface PageConstraints {
  pageHeight: number       // same normalized unit as block.height
  headerHeight: number     // repeated per-page chrome (react-pdf `fixed` header / DOM sticky page header)
  footerHeight: number
}

function computePageBreaks(blocks: PageBlock[], constraints: PageConstraints): PageAssignment[]
```

- **`lib/estimate/pagination/engine.ts`** — the pure `computePageBreaks()` rule engine (never split a line item, section header keeps with first row, subtotal keeps with last row, totals/photos/signature blocks are atomic). Zero DOM/react-pdf dependency — trivially unit-testable with plain fixtures. **This is the single deterministic module the milestone asks for.**
- **`lib/estimate/pagination/blocks-from-model.ts`** — `DocumentModel` → `PageBlock[]` **without heights** (structure only; heights are always injected by the caller).
- **`lib/estimate/pagination/measure-dom.ts`** — client-only measurement provider (`ResizeObserver` against the mounted, currently-unpaginated DOM tree) feeding `engine.ts`.
- **`lib/estimate/pagination/measure-pdf.ts`** — server-only measurement provider using constant/estimated heights derived from `lib/estimate/document/tokens.ts`'s point sizes (row height, header height, subtotal footer height are fixed per template; multi-line description wrapping is estimated via a column-width ÷ average-glyph-width heuristic — avoid pulling in a canvas/text-measurement native dependency, which is fragile to build on the Alpine container PROJECT.md flags). Feeds `engine.ts`, whose output then drives explicit `break` props on react-pdf `View`s — replacing react-pdf's implicit reflow rather than layering on top of it.

Both the DOM paginated preview and the react-pdf renderer call the **same** `computePageBreaks()` with **different** measurement providers. That's the mechanism that lets "the two mirror each other."

## Q3 — How the two PDF templates and two webview docs restructure

### New

| File | Purpose |
|---|---|
| `lib/estimate/document/model.ts`, `labels.ts`, `format.ts`, `tokens.ts` | Shared model/labels/formatters/tokens (Q1) |
| `lib/estimate/pagination/types.ts`, `engine.ts`, `blocks-from-model.ts`, `measure-dom.ts`, `measure-pdf.ts` | Pagination engine + measurement providers (Q2) |
| A signature-display data helper (e.g. `lib/queries/share.ts` addition or a new `lib/estimate/signature-display.ts`) | Resolves `estimate_signatures.signer_name`/`signature_data`/`signed_at` for both the webview and PDF, mirroring how `deriveDepositDisplay` is the one shared read-seam for deposit data |
| A shared signature-block renderer per family (one React component for webview, one react-pdf JSX fragment for PDF — cannot be literally the same component across the two renderer families) | Renders signer name, signed date, and the base64 PNG (`<img>` in DOM, `<Image src="data:image/png;base64,...">` in react-pdf) |
| `components/workspace/estimate/estimate-document-paginated.tsx` (or a `paginated` branch inside the existing file — see Q5) | The new paginated, editable layout wrapper |
| Two toggle-icon components/markup inside `components/workspace/project-header.tsx` | UI toggle (Q4) |

### Modified

| File | Change |
|---|---|
| `components/workspace/estimate/estimate-document.tsx` | Swap local `DOC_LABELS`/`formatAddress`/`formatDate`/`DATE_LOCALE` for the shared module; add signature block + photo caption rendering (both `view` and `edit` mode — a signed estimate is already locked read-only via `state.hasSignature` in `estimate-editor.tsx:322-325`, so the signature block in edit mode is naturally display-only). |
| `components/share/estimate-document-modern.tsx` | Same swap; same additions; optionally add Estimate-Terms rendering for parity with the wrapper's Classic-path behavior (currently absent — Q1 table). |
| `components/pdf/estimate-pdf.tsx` | Swap inline `PDF_LABELS`/`formatAddress`/`formatDate`/`DATE_LOCALE`/color-and-font literals for the shared `labels.ts`/`format.ts`/`tokens.ts` (`'classic'` token set); add signature block + captions; JSX/`StyleSheet` stays react-pdf-specific (cannot be literally shared with DOM JSX) but every **value** it uses becomes shared. |
| `components/pdf/estimate-pdf-modern.tsx` | Same, `'modern'` token set. |
| `app/api/estimates/[id]/pdf/route.ts` | Add signature-row fetch (currently only `loadLatestSignedSnapshot` selects `signed_content`/`signed_total`, not `signer_name`/`signature_data`/`signed_at`) and thread it into the PDF component props. |
| `app/api/estimates/[id]/send/route.ts` | **Copy the existing `PDF_TEMPLATE_COMPONENTS` registry pattern + `loadLatestSignedSnapshot`/`applySignedSnapshot` calls verbatim from `app/api/estimates/[id]/pdf/route.ts`** — currently hardcodes `EstimatePDF` (L7, L192) and never loads a snapshot. Self-contained, no dependency on the rest of this milestone. |
| `lib/whatsapp/pdf-delivery.ts` | Same fix as the send route — hardcodes `EstimatePDF` (L15, L48), no snapshot loading. |

## Q4 — Toolbar toggle placement and view-mode state flow

### Exact component

`components/workspace/project-header.tsx` is confirmed as the component owning the header with "Edit with AI": it renders `<EditEstimateHeaderButton projectId={project.id} />` at **L53**, inside a `div.flex.items-center.gap-2.shrink-0` (L44) that already holds the autosave-status text. Insert the two new icon-toggle buttons in that same flex row, **before** `<EditEstimateHeaderButton />` (i.e., between the autosave status and the button — "to the LEFT of Edit with AI").

### Pre-existing precedent this milestone should consolidate, not duplicate

A "Full page" / "Full width" toggle **already exists today**, but in the wrong place and doing less than what's needed:

- State: `viewMode: 'width' | 'page'` local `useState` in `estimate-editor.tsx:280`, persisted to `localStorage['estimate-view-mode']` (`estimate-editor.tsx:175,283,288`).
- UI: rendered inside the **floating actions pill** (`components/workspace/estimate/estimate-floating-actions.tsx:112-131`), not the header — a "Full page"/"Full width" text+icon button.
- Effect: only toggles the `pageView` boolean prop on `EstimateDocument` (`estimate-editor.tsx:737`), which just swaps CSS (square corners, `min-h-[1056px]`, paper shadow, `estimate-document.tsx:1663-1689`) and applies a whole-page `zoom` CSS trick to fit one long "sheet" into the viewport (`estimate-editor.tsx:291-315`) — **there is no real pagination, no page breaks, just one continuously-tall styled sheet.**

**Recommendation:** retire this mechanism's UI (remove the button + `viewMode`/`onViewModeChange` props from `estimate-floating-actions.tsx`) and replace it with the new header toggle, reusing the *state* (rename semantics from "width/page" to "width/paginated" as needed) rather than adding a second, competing toggle. Keeping both risks drift (two controls disagreeing about the same visual mode).

### State flow mechanism

Not Zustand (no global store precedent found in this codebase for editor UI state) and not a URL param (view mode is a per-session preference already persisted via `localStorage`, and the public share page — `app/estimate/[token]` route consuming `components/share/estimate-view.tsx` — must **never** pick up pagination; a URL param risks that boundary leaking if code is ever refactored carelessly, whereas a React Context scoped to the authenticated workspace tree cannot leak there structurally).

Reuse the **exact existing "slot" Context pattern** that already bridges `ProjectHeader` ↔ `EstimateEditor` for `saveStatus`/`projectName`:

- `components/workspace/estimate-version-context.tsx`'s `VersionSlot` interface (currently `currentVersionId`, `versions`, `version`, `isDirty`, `isReadOnly`, `onVersionChange`, `projectName`, `onProjectRenamed`, `saveStatus`) gains `viewMode` and `onViewModeChange`.
- `estimate-editor.tsx` keeps owning the real state (the existing `useState`/`localStorage` mechanism, `L280-289`) and publishes it into the slot via its existing `setSlot(...)` effect (`L648-661`), which already re-runs on every relevant dependency change — no new plumbing pattern needed, just two more fields on an object that's already threaded.
- `project-header.tsx` reads `slot?.viewMode` / calls `slot?.onViewModeChange` exactly as it already reads `slot?.saveStatus` (L45-51) and calls `slot?.onProjectRenamed` (L39).

## Q5 — Reusing existing inline editing components in paginated mode without forking

All of the current edit-mode primitives — `DocumentSectionBlock`, `SortableDocumentSection`, `SortableDocumentItemRow`, `DocumentTotals`, `TermsBlock`, `AttachedPhotoThumb`, `InlineProjectName`, `DatePopover` — are private (non-exported) functions inside `estimate-document.tsx`, but every one of them already takes the same layout-agnostic props (`section`/`item`/`dispatch`/`L`/`lang`/`currencyCode`/etc.) regardless of surrounding chrome. Paginated mode doesn't need different editing logic; it needs the **same rows in different container chrome**.

Two viable strategies, evaluated:

**(a) Re-parent rows into discrete `<Page>` DOM containers** driven by the pagination engine's per-block page assignment. Works, but `dnd-kit`'s `SortableContext` for a section's items would need to span physically-split DOM parents (all children still register into one `SortableContext` id list even if visually split across page `<div>`s — dnd-kit supports this since it tracks IDs, not DOM adjacency) — technically feasible but adds real complexity to every drag-and-drop interaction crossing a page boundary mid-drag.

**(b) Recommended: keep the existing continuous DOM tree completely intact, and make "paginated" a pure visual overlay.** Compute page-break y-offsets via `lib/estimate/pagination/measure-dom.ts` + `engine.ts`, then inject fixed-height "page gap" spacer elements (plus repeated header/footer chrome) at those offsets — without re-parenting any row. This is the same technique Google Docs/Word Online use for their paginated web views, is exactly the direction the *existing* `pageView` prop already started down (one fake "sheet" — Quick-260718-p3v), and means **zero forking**: `dispatch`, `EditorItem`, `DocumentSectionBlock`, `SortableDocumentItemRow` are reused completely unchanged. The only new code is an outer layout pass (`estimate-document-paginated.tsx` or a `paginated` prop branch on the existing component) that measures the already-rendered tree and decorates it with computed spacers/chrome. It also stays print-CSS-compatible if that's ever wanted later (`break-inside: avoid` at the same computed offsets).

Recommend (b) as the primary strategy; only fall back to (a) if product later requires literal separate page `<div>` DOM nodes (e.g., for some other consumer that needs to address "page 3" as a discrete container).

## Q6 — Suggested build order

Dependency-ordered; steps within the same phase are independent of each other and can run in parallel.

**Phase A — Shared foundation + a standalone, already-provable bugfix (no visible behavior change to ship; retrocompat-tested)**
1. Extract `lib/estimate/document/{model,labels,format,tokens}.ts` from the 4 existing files; repoint `estimate-document.tsx`, `estimate-document-modern.tsx`, `estimate-pdf.tsx`, `estimate-pdf-modern.tsx` at the shared module. Byte-identical output required (golden-snapshot style tests, mirroring the discipline already used for `compute-totals.ts`).
2. **Ship independently, first, lowest risk:** fix `app/api/estimates/[id]/send/route.ts` and `lib/whatsapp/pdf-delivery.ts` by copying the existing, already-proven `PDF_TEMPLATE_COMPONENTS` registry + `loadLatestSignedSnapshot`/`applySignedSnapshot` pattern verbatim from `app/api/estimates/[id]/pdf/route.ts`. Zero dependency on anything else in this milestone — it's a self-contained TRUST-01 fix using code that already exists elsewhere in the repo.

**Phase B — Parity content (signature + captions), still non-paginated — depends on Phase A step 1**
3. New signature-display data plumbing (extend `lib/queries/share.ts`'s signature query, or add a sibling helper, to select `signer_name`/`signature_data`/`signed_at`) + new signature-block renderers (webview component + PDF JSX fragment); wire into all 4 document surfaces **and** both send paths (route + WhatsApp delivery) since they render PDFs too.
4. Photo captions: render `photo.caption` text under thumbnails in all 4 surfaces — no new data plumbing required.
5. *(Optional, flag as an open product decision, not required by the milestone text)* Estimate-Terms parity in the Modern webview + reconciling where Estimate Terms structurally lives (page wrapper vs. terms-block).

**Phase C — Pagination engine (foundation for D) — depends on Phase A step 1, independent of Phase B**
6. `lib/estimate/pagination/{types,engine,blocks-from-model}.ts` — pure rule engine, fixture-tested (never split a row; header keeps with first row; subtotal keeps with last row; totals/photos/signature blocks atomic).
7. `lib/estimate/pagination/measure-pdf.ts`, wired into both PDF templates via explicit `break` props at the engine's computed boundaries — replacing react-pdf's implicit reflow. This is the step that actually delivers "PDF and paginated web preview mirror each other."

**Phase D — Paginated editable editor mode — depends on Phase C**
8. `lib/estimate/pagination/measure-dom.ts` + the spacer/chrome-overlay paginated layout wrapper (Q5 strategy b).
9. Toggle UI: extend `VersionSlot`, add the two header icon buttons (`project-header.tsx`), retire the old floating-pill "Full page/Full width" toggle and the old CSS-zoom single-sheet mechanism in `estimate-editor.tsx`/`estimate-floating-actions.tsx`.
10. Apply the pending user-supplied reference design image once available (explicitly deferred per PROJECT.md's key context) — visual polish only, no further architecture change.

**Phase E — Webview design polish — independent, best done after Phase A so it inherits the shared tokens**
11. General visual refinement pass on `estimate-document.tsx`/`estimate-document-modern.tsx`.

## Anti-Patterns to avoid

### Anti-Pattern: trusting react-pdf's implicit `wrap`/`fixed` reflow as the source of truth for page breaks
**Why it's wrong:** it can't express the milestone's business rules (never split a row, keep header with first row, keep subtotal with last row) in a way that's guaranteed to match the DOM preview's independently-computed breaks — the two would silently drift.
**Instead:** the shared `lib/estimate/pagination/engine.ts` output must drive explicit `break` props on react-pdf `View`s; react-pdf's own reflow is only a fallback for content the engine didn't explicitly break.

### Anti-Pattern: forking the edit-mode sub-components into a paginated-only duplicate
**Why it's wrong:** `estimate-document.tsx` is already 2038 lines with drag-and-drop, price-book autocomplete, inline validation, and locking logic; a fork doubles the maintenance surface and guarantees future drift between "normal" and "paginated" editing.
**Instead:** the spacer/chrome-overlay strategy (Q5, option b) reuses `dispatch`/`EditorItem`/`DocumentSectionBlock` completely unchanged.

### Anti-Pattern: adding a second competing view-mode toggle
**Why it's wrong:** the floating-pill "Full page/Full width" button already exists and does something similar but weaker; leaving both live risks two controls that disagree about the current mode.
**Instead:** retire the floating-pill toggle and its `viewMode` props when the header toggle ships (Phase D step 9).

## Sources

All findings are grounded in direct reads of the actual repository files (with line numbers cited inline throughout), not external documentation:
- `.planning/PROJECT.md` (v4.23 milestone section, lines 17-30)
- `components/share/estimate-view.tsx`
- `components/share/estimate-document-modern.tsx`
- `components/workspace/estimate/estimate-document.tsx`
- `components/pdf/estimate-pdf.tsx`, `components/pdf/estimate-pdf-modern.tsx`
- `lib/estimate/templates/registry.ts`, `lib/estimate/presentation-settings.ts`, `lib/estimate/deposit-display.ts`, `lib/estimate/compute-totals.ts`
- `app/api/estimates/[id]/pdf/route.ts`, `app/api/estimates/[id]/send/route.ts`, `lib/whatsapp/pdf-delivery.ts`
- `lib/queries/share.ts`
- `supabase/migrations/20260519000002_digital_signature_and_estimate_terms.sql`
- `components/workspace/project-header.tsx`, `components/workspace/edit-estimate-header-button.tsx`, `components/workspace/estimate-version-context.tsx`
- `components/workspace/estimate/estimate-editor.tsx`, `components/workspace/estimate/estimate-floating-actions.tsx`, `components/workspace/estimate/use-estimate-reducer.ts`
- `tests/unit/estimate/document-page-view.test.tsx`

---
*Architecture research for: v4.23 Unified Estimate Document Engine (Xtimator)*
*Researched: 2026-07-27*
