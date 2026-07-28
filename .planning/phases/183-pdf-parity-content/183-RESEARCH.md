# Phase 183: PDF Parity Content - Research

**Researched:** 2026-07-28
**Domain:** `@react-pdf/renderer` template restructuring + new cross-surface content (signature block, photo captions) on top of Phase 182's shared document engine
**Confidence:** HIGH — every claim is grounded in direct reads of the live post-182 code (file:line cited throughout), the DB migrations, and the project's own test conventions. Two places where the phase's own framing (CONTEXT.md / the investigation prompt) is corrected by the code are called out explicitly below — read those first, they change scope precision.

## Summary

Phase 182 already gave all 4 renderers a shared label/format/token module (`lib/estimate/document/*`) and a single PDF resolver (`lib/pdf/render-estimate-pdf.ts`) that all 3 send paths call. This phase has three jobs: (1) close the visual gap between each PDF template and its own webview benchmark — which, corrected below, is narrower than CONTEXT.md's framing suggests — plus finish ENGINE-03's structural de-dup of the two ~700-line PDF `StyleSheet` blocks into shared react-pdf layout components; (2) add a signature block (image + signer + date) to all 4 document surfaces, net-new, sourced from `estimate_signatures` via an extended `loadLatestSignedSnapshot`; (3) add photo captions to all 4 surfaces — the data already flows to the PDF (`{url, caption}` per photo), it is simply never read in JSX.

**Primary recommendation:** Fix the Classic PDF's ESTIMATE-title banner to a solid brand-fill block (its section headers already match Classic webview) — do NOT add a solid fill to Modern PDF, whose accent-only/hairline styling already matches Modern webview's benchmark. Extend `loadLatestSignedSnapshot` (shared by share.ts and the PDF resolver) to also select `signer_name`/`signature_data`/`signed_at`, wrap each photo item in all 4 surfaces with a caption paragraph gated on the existing `photos` presentation-settings key, and land `Font.register(Inter)` for Classic + a real serif TTF for Modern now (both PDF templates are already being touched for the StyleSheet de-dup, and Phase 184 explicitly needs registered fonts and warns against "two font sources").

## Correction to the phase framing (read this first)

**1. The "solid banner + solid section headers" gap CONTEXT.md attributes to "the workspace/webview modern doc" is actually the CLASSIC template, and it is a Classic-PDF-only gap.**

CONTEXT.md says: *"the workspace/webview modern doc has a solid brand-color ESTIMATE banner and brand-color section headers; the current modern PDF uses accent-only styling."* Reading the actual components:

- `components/workspace/estimate/estimate-document.tsx` (the **Classic** template — the ONLY template the workspace editor ever renders; there is no "workspace modern doc", see correction 2) has a solid full-bleed brand-fill ESTIMATE title banner (`estimate-document.tsx:1476-1486`, `style={{ backgroundColor: brandColor }}`) and a solid brand-fill section-header bar (`estimate-document.tsx:487-490`, `style={{ backgroundColor: brandColor }}`).
- `components/pdf/estimate-pdf.tsx` (Classic PDF) **already has** the solid-fill section header (`estimate-pdf.tsx:487-494`, `[styles.sectionHeader, { backgroundColor: brandColor }]`) — that part already matches. Its ESTIMATE title (`estimate-pdf.tsx:410-412`) is colored text only, **no fill** — this is the one real, verified gap: Classic PDF's title needs the same solid-brand-fill banner treatment Classic webview already has.
- `components/share/estimate-document-modern.tsx` (Modern webview, share-page only) has **no solid fills anywhere by design** — its own code comment says so explicitly (`estimate-document-modern.tsx:80-82`: "Modern never fills a background with brand color (hairline rules + text accents only)"). Its ESTIMATE title is small letter-spaced text + a hairline rule (`estimate-document-modern.tsx:171-180`), and its section headers are plain text + a bottom hairline (`estimate-document-modern.tsx:242-250`).
- `components/pdf/estimate-pdf-modern.tsx` (Modern PDF) **already matches** this hairline design: its `estimateTitle` is accent-colored text + a thin `estimateTitleRule` (`estimate-pdf-modern.tsx:419-423`), and its `sectionHeader` is a bottom-border-only bar with no fill (`estimate-pdf-modern.tsx:168-180`, `estimate-pdf-modern.tsx:499-501`).

**Actionable consequence:** do NOT add a solid brand fill to Modern PDF's title or section headers — that would break, not fix, Modern's already-correct parity with its own benchmark. The banner fix is Classic-PDF-only: give `estimate-pdf.tsx`'s `estimateTitle` a `backgroundColor: brandColor` treatment (with `brandOnFill` text color, mirroring the section-header pattern already in the same file) sized/padded to read as a full-bleed banner like the webview's `py-6 px-6 sm:px-10 text-center` block.

**2. There is no "workspace modern doc."** The workspace editor (`estimate-editor.tsx`) always renders `<EstimateDocument mode="edit" .../>` (Classic) regardless of the company's `estimate_template_style` — grepped `estimate-editor.tsx` for `EstimateDocumentModern`/`templateId`: zero matches. Modern's only webview surface is the public share page (`components/share/estimate-view.tsx`, template-registry-resolved at `estimate-view.tsx:227-231`). CONTEXT.md's canonical-refs list "the workspace doc (view mode)" as one of the signature block's 4 render targets — that target is Classic only, rendered read-only (`isEditable = mode==='edit' && !isReadOnly`, `estimate-document.tsx:1333`) when `isContentReadOnly` is true (which a signed estimate always is — `estimate-editor.tsx:323-326`, `state.hasSignature`).

**3. Neither webview surface renders "terms cards."** The investigation prompt's phrase "terms cards" doesn't match the live code: `TermsBlock` (`estimate-document.tsx:1039-1097`) and Modern's inline terms blocks (`estimate-document-modern.tsx:376-416`) are plain `label + <p>` blocks with no border/background chrome — not cards. Both PDF templates' `termsSection`/`termsTitle`/`termsText` styles already mirror this (label with a bottom-border rule + a paragraph, no card). No structural change needed here beyond continuing the pattern for any new content.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Benchmark parity (PDFPAR-01)**
- The webview is the BENCHMARK (owner-locked): the PDF must match the webview's structure and visual design per template — company header/branding, ESTIMATE title, project/bill-to grid, summary, sections with per-section subtotals, items tables, totals block (subtotal → discount → tax → total → deposit → balance due), terms cards, photo grid.
- Reference screenshots (owner-provided 2026-07-27): the workspace/webview modern doc has a solid brand-color ESTIMATE banner and brand-color section headers; the current modern PDF uses accent-only styling — the PDF moves TOWARD the webview look, not vice versa. **[See Correction 1 above — apply this to Classic PDF's title, not Modern PDF.]**
- Both templates covered; template-specific styling expressed via the Phase 182 per-template token layer (this phase completes ENGINE-03's structural de-duplication of the ~860-line PDF template pair — carried over from 182 as explicitly partial there).
- Typography: PDF should adopt the same font family the web renders (registered TTF via Font.register — see STACK.md; groundwork may land here or in 184's measurement work; if landing here, keep it consistent with what 184 needs).
- Discount display: fix the `discount_type` fragmentation at the PDF layer (schema 'percentage'|'fixed', AI writes 'amount', totals engine 'percent'|'amount') so percentage discounts show the (x%) suffix consistently — shared normalization helper, server math (GUARD-03) untouched.

**Signature block (PDFPAR-02 — net-new on ALL surfaces)**
- A signed estimate renders a signature block: signer name, signed date, signature image (from estimate_signatures.signature_data base64 PNG) — on the share webview, the workspace doc (view mode), and both PDF templates.
- Placement: after totals/terms, standard document convention; atomic block (Phase 184 will treat it as unsplittable — define it as one component).
- Data: signature comes from `loadLatestSignedSnapshot` / the signatures table; PDF paths already load it via the Phase 182 shared resolver.
- Unsigned estimates: no signature block (no placeholder/empty state on PDF; webview keeps its existing signature-capture pad flow unchanged).

**Photo captions (PDFPAR-03 — net-new on all surfaces)**
- Captions render under each photo in the webview photo grid AND the PDF photo grid (caption data already resolved by the PDF route and dropped today — components/pdf props already type `caption`).
- No caption → no empty space (conditional render).

### Claude's Discretion
- Exact signature block layout (keep it professional/minimal; match benchmark typography).
- How much of the PDF StyleSheets collapse into shared tokens vs stay per-template (target: shared structure components with per-template token styling — the react-pdf side gains shared layout components under components/pdf/shared/ or similar).
- Whether webview visual polish beyond structure parity belongs here or in 186 (bias: structure/content here, aesthetics in 186).

### Deferred Ideas (OUT OF SCOPE)
- Pagination/page-break control → Phase 184.
- Invoices/payment state in PDF → DEFER-02 (v2).
- "Prepared by" on webview → DEFER-03 (v2).
- General webview aesthetic polish → Phase 186.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PDFPAR-01 | PDF (both templates) matches webview structure/design — banner, section headers, sections, totals, terms, photos | Exhaustive parity checklist below; Correction 1 (Classic-only banner fix); "Don't Hand-Roll" shared react-pdf layout components for ENGINE-03 |
| PDFPAR-02 | Signed estimate renders signature block on webview + PDF, net-new | "Signature data flow" section: schema, `loadLatestSignedSnapshot` extension, base64 `<Image>` support (verified), placement, all 4 render targets |
| PDFPAR-03 | Photo captions render in webview + PDF photo grids | "Photo captions" section: exact insertion points in all 4 files, `presentation_settings.photos` gate reuse |
| ENGINE-03 (residual) | Structural de-dup of the PDF template pair (StyleSheet padding/spacing/color values, JSX structure), completing Phase 182's partial delivery | "Don't Hand-Roll" + Architecture Patterns: `components/pdf/shared/*` layout components, `document-engine-boundary.test.ts` framework-import guard pattern to extend |

</phase_requirements>

## Standard Stack

No new runtime dependencies are required for PDFPAR-01/02/03 in isolation — `@react-pdf/renderer@^4.4.0` (installed) already supports everything needed: `StyleSheet.create()` composition, `<Image>` with base64 data URIs, `Font.register`. The one optional addition is font asset files (not an npm package) if Font.register lands this phase (see "Font strategy" below).

### Core (already installed — no action needed)
| Library | Installed Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@react-pdf/renderer` | `^4.4.0` (package.json) | PDF rendering, unchanged role | Already the project's only PDF stack; `.planning/research/STACK.md` recommends a routine bump to `^4.5.1` but that is not required by this phase's scope |
| `next/font/google` (Inter) | current (`app/layout.tsx:2,11-13`) | The web's actual rendered sans font | `variable: "--font-inter"` applied globally — confirms Classic webview renders Inter, Modern webview renders Tailwind `font-serif` (a generic system-serif stack, NOT Inter) |

### Optional this phase (if Font.register lands here — see decision below)
| Asset | Purpose | Notes |
|-------|---------|-------|
| Inter TTF (Regular + Bold) | `Font.register` for Classic PDF | NOT available as an npm package that ships TTF — `@fontsource/inter` (verified via `npm view @fontsource/inter@5.3.0`) ships WOFF2, which `.planning/research/STACK.md` explicitly flags as unreliable with `Font.register`. Source the TTF from Google Fonts' official static/TTF export or the Inter project's own GitHub releases (OFL-1.1, free) and commit under `assets/fonts/` (or similar, inside the Docker build context). This acquisition step is implementation work for the plan, not resolved here. |
| A serif TTF (Regular + Bold), e.g. Source Serif 4 or Lora | `Font.register` for Modern PDF | Replaces the built-in `Times-Roman`/`Times-Bold` AFM fonts so Modern's registered PDF font is a real, embeddable TTF matching the *intent* of the webview's `font-serif` design language (not byte-identical — browsers resolve `font-serif` to whatever system serif is installed, e.g. Georgia/Times New Roman, which is itself not a single deterministic font; picking one real OFL serif TTF is the best available convergence point) |

### Don't add
- `paged.js`, `@react-pdf/textkit` (direct dep), `fontkit`/`linebreak` as *pagination* primitives — all explicitly out of scope for this phase (pagination is Phase 184's job; see `.planning/research/STACK.md`'s "What NOT to Use" table). If Font.register lands here, it needs zero pagination-measurement code — just font registration for correct glyph rendering.

**Version verification:** `@react-pdf/renderer` stays at the installed `^4.4.0` unless the planner independently decides to take the STACK.md-recommended bump; not required for this phase's requirements.

## Architecture Patterns

### Exhaustive visual parity checklist (webview → PDF, per template)

| Element | Classic webview (`estimate-document.tsx`) | Classic PDF (`estimate-pdf.tsx`) | Gap | Modern webview (`estimate-document-modern.tsx`) | Modern PDF (`estimate-pdf-modern.tsx`) | Gap |
|---|---|---|---|---|---|---|
| ESTIMATE title banner | Solid brand-fill, full-bleed, centered white/`brandOnFill` text (`:1476-1486`) | Centered `brandText`-colored text, **no fill** (`:410-412`) | **YES — add solid `backgroundColor: brandColor` fill** (Correction 1) | Small letter-spaced accent text + hairline rule underneath, no fill (`:171-180`) | Accent-colored text + thin `estimateTitleRule` hairline (`:419-423`) | None — already matches |
| Section header bar | Solid brand-fill (`:487-490`) | Solid brand-fill, already matches (`:487-494`) | None | Plain text + bottom hairline, no fill (`:242-250`) | Bottom-border-only, no fill (`:168-180`, `:499-501`) | None |
| Zebra item rows | `idx % 2 === 1 ? 'bg-muted/20' : ''` (desktop, `:631`); `even:bg-muted/20` (mobile, `:555`) | `tableRowAlt: { backgroundColor: '#f9fafb' }` (`:189-191,522`) | Cosmetic only (close approximation, both light-gray tints) — no functional gap | No zebra striping by design (`:287`, "no zebra striping" comment) | `tableRowAlt: {}` (empty — deliberately no striping, `:196`) | None — both correctly have no zebra |
| Table header fill | `bg-muted/50` (`:587,619`) | `backgroundColor: '#f3f4f6'` (`:176,498`) | Cosmetic only, already close | Hairline bottom border only, no fill (`:277`) | No fill, hairline border only (`:182-188`) | None |
| Section subtotal bar | `bg-muted/10` background strip (`:663`) | No background fill on `sectionSubtotal` (`:206-213`) | Minor — PDF's subtotal row has a top border only, webview has a full-width tint strip. Low-priority cosmetic gap. | No background fill, plain right-aligned row (`:304-309`) | No fill (`:214-221`) | None |
| Totals block style | Standard boxed row list, `text-2xl` grand total with `border-t-2 border-foreground` (`:896-902`) — NOT a giant hero | `grandTotalRow` boxed row, `fontSize:14`, `borderTopWidth:2` (`:249-265`) | None — both are "standard row," already matches | "Hero" standalone grand total, `text-4xl sm:text-5xl` (`:360-368`) | "Hero" standalone `grandTotalValue`, `fontSize:30`, its own `grandTotalBlock` (`:259-276,596-602`) | None — both already hero-style |
| Discount (%) suffix | `data.discount_type === 'percentage' ? ...(${value}%)`  (`:842`) | Same check (`:569-571`) | See "Discount display fragmentation" below — a display-correctness gap independent of layout | Same check (`estimate-document-modern.tsx:327`) | Same check (`:575-577`) | Same |
| Terms | Plain label + paragraph, no card chrome (`:1039-1097`) | Label with bottom-border rule + paragraph (`:270-283`) | None — already matches (see Correction 3, "cards" is a misnomer) | Same plain-block pattern (`:376-416`) | Same label+rule+paragraph pattern (`:278-294`) | None |
| Photo grid | `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`, `aspect-square rounded-lg` thumbs (`:1759`) | Fixed `flexWrap` row of `150×150` squares (`:675-684`) | Acceptable — PDF has no responsive concept, fixed grid is the correct react-pdf equivalent; not a required change | `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`, `aspect-square rounded-lg` (`:425`) | Same fixed `150×150` flexWrap pattern (`:676-685`) | None |
| Photo captions | **Missing** (alt-text only, `:432`) | **Missing** (`caption` resolved but never read in JSX) | **NEW everywhere — PDFPAR-03** | **Missing** (`:432`) | **Missing** | **NEW everywhere** |
| Signature block | **Missing** (accept/decline lives outside the doc, `estimate-view.tsx:440-506`) | **Missing** | **NEW everywhere — PDFPAR-02** | **Missing** | **Missing** | **NEW everywhere** |

### What react-pdf CANNOT do that the webview does (and the closest equivalent)

- **CSS gradients / box-shadows / rounded corners with real anti-aliasing:** react-pdf's `View`/`Text` support `borderRadius` and flat `backgroundColor` but no CSS gradient syntax and no `box-shadow`. Not needed for the parity checklist above — nothing in the identified gaps requires a gradient or shadow (the webview's `shadow-lg`/`shadow-2xl` card chrome is presentation-layer-only, not part of the parity checklist since the PDF page itself has no "card" — it IS the page).
- **CSS Grid (`grid-cols-N`):** react-pdf has no CSS Grid; `flexDirection: 'row', flexWrap: 'wrap'` with fixed-width children (already used for the photo grid in both PDF templates) is the correct, already-adopted equivalent — no change needed here.
- **Tailwind's `even:`/`last:`/hover/group pseudo-selectors:** not available; the PDF templates already correctly translate these to explicit `idx % 2 === 1` conditionals (zebra rows) and simply omit hover/group affordances (correct — a PDF has no interaction).
- **`whitespace-pre-line` line-wrapping honoring literal `\n`:** react-pdf's `<Text>` DOES render literal newlines in its children string content correctly (already relied upon for terms/summary/notes text in both PDF templates today — no gap).

### Recommended shared react-pdf layout components (`components/pdf/shared/`)

Per CONTEXT.md's discretion note ("shared structure components with per-template token styling"), and to genuinely close ENGINE-03 (not just the font-family token layer Phase 182 landed), extract the JSX **structure** that is byte-identical (or near-identical, differing only in style-object values already sourced from `ESTIMATE_DESIGN_TOKENS`) between `estimate-pdf.tsx` and `estimate-pdf-modern.tsx` into shared components. Candidates, ranked by how close the two files already are (verified by direct comparison of the JSX in both files):

| Component | Current duplication | Notes |
|---|---|---|
| `PdfHeader` (company block + logo + lang badge) | Structurally identical JSX in both files (`estimate-pdf.tsx:339-407`, `estimate-pdf-modern.tsx:354-417`); only style-object values differ | Highest-value extraction — largest identical JSX block |
| `PdfInfoGrid` (Project | Bill To) | Structurally identical (`:415-469` / `:426-480`) | High value |
| `PdfSectionBlock` (section header + table header + rows + subtotal) | Structurally identical except section-header fill (Classic has `backgroundColor: brandColor` inline, Modern has none) — parameterize via a `sectionHeaderFill?: string` token/prop | High value, but must preserve the Correction-1 divergence (Classic fills, Modern doesn't) as a per-template PROP, not hardcode one behavior |
| `PdfTotalsBlock` | Structurally DIFFERENT layout (Classic: boxed row; Modern: hero block) — this is a **deliberate design difference**, not incidental duplication | Do NOT force these into one component with a mode flag that reduces both to a lowest-common-denominator; either keep as two per-template renderers reading shared `deriveDepositDisplay`/token values, or a single component with an explicit `variant: 'classic' | 'modern'` prop that branches JSX (still one file, still eliminates the duplicated row-list logic) |
| `PdfTermsSection` | Near-identical structure (label + rule + paragraph, repeated per term field) | High value |
| `PdfPhotoGrid` | Near-identical (`150×150` flexWrap grid) — becomes the mount point for PDFPAR-03 captions (one change point instead of two) | High value, do this one regardless of how much else gets extracted — it is also where captions get added |
| `PdfSignatureBlock` | Net-new (PDFPAR-02) | Build once, shared by both templates from the start — no duplication to create in the first place |
| `PdfFooter` (page N of M) | Already nearly identical, low duplication cost either way | Lower priority |

**What must stay per-template (never extracted):** the `StyleSheet.create()` objects themselves (padding/spacing/color literals) — these ARE the "per-template tokens" CONTEXT.md's discretion note asks to preserve. Move them into `lib/estimate/document/tokens.ts`'s `ESTIMATE_DESIGN_TOKENS` record (already `Record<EstimateTemplateId, ...>`, currently scoped to `fontFamily`/`fontFamilyBold` only — widen the interface to also carry spacing/color values that both `PdfHeader`/`PdfSectionBlock`/etc. need) rather than leaving them as two independent `StyleSheet.create()` literals. This is the actual mechanism that "completes ENGINE-03."

**Enforcement pattern already in the codebase to extend:** `tests/unit/estimate/document-engine-boundary.test.ts` asserts `lib/estimate/document/*` files import zero `react`/`@react-pdf/renderer`/`components/*` (Pitfall 11's boundary). If new shared files are added under `lib/estimate/document/tokens.ts` (widened) they inherit this guard automatically (already in `ENGINE_FILES`). Any NEW file under `components/pdf/shared/*` is, by contrast, expected to import `@react-pdf/renderer` — it is a react-pdf-only interpreter layer, not a shared-data-and-DOM file; do not add it to the framework-free guard list.

### Recommended project structure addition

```
components/pdf/
├── estimate-pdf.tsx          # Classic — imports shared/* + classic tokens
├── estimate-pdf-modern.tsx   # Modern — imports shared/* + modern tokens
└── shared/
    ├── pdf-header.tsx
    ├── pdf-info-grid.tsx
    ├── pdf-section-block.tsx
    ├── pdf-terms-section.tsx
    ├── pdf-photo-grid.tsx     # gains caption rendering here (PDFPAR-03)
    ├── pdf-signature-block.tsx # net-new (PDFPAR-02)
    └── pdf-footer.tsx
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Discount type has 3+ vocabularies (`'percentage'\|'fixed'` schema, `'amount'` AI-write, `'percent'\|'amount'` engine-internal) | A new ad-hoc `if (type === 'percentage' \|\| type === 'percent')` inline at each of the 4 render call sites (already duplicated 4x today) | ONE shared predicate, e.g. `isPercentageDiscount(discountType: string \| null): boolean` in `lib/estimate/document/format.ts` (or a sibling `discount-display.ts`, mirroring `deriveDepositDisplay`'s existing pattern in `lib/estimate/deposit-display.ts`), imported by all 4 renderers | Matches the project's own established pattern (one pure, framework-free, unit-tested predicate per cross-cutting display decision) and satisfies `document-engine-boundary.test.ts`'s "shared module = zero framework imports" convention |
| Base64 PNG signature image display | A custom base64 decoder/validator before passing to `<Image>` | Pass `estimate_signatures.signature_data` (already a full `data:image/png;base64,...` data URL — confirmed source: `components/share/signature-pad.tsx:88`, `canvas.toDataURL('image/png')`) straight into react-pdf's `<Image src={...}>` | react-pdf's own `ImageSrc` type includes a `Base64ImageSrc` variant matching `data:image${string}` — officially supported (react-pdf.org/components + `@react-pdf/image`'s type definitions), no transformation needed. Verified via WebFetch of react-pdf.org/components and a GitHub-issue cross-check; the one known caveat (issue #1072) is specific to client-side `PDFDownloadLink`, irrelevant here since all 3 PDF paths use server-side `renderToBuffer` |
| PDF template structural duplication (ENGINE-03 residual) | Continuing to hand-maintain two independent ~700-line `StyleSheet.create()` + JSX trees | Shared `components/pdf/shared/*` layout components + a widened `ESTIMATE_DESIGN_TOKENS` carrying spacing/color, per "Architecture Patterns" above | This is literally the bug class PROJECT.md's own Anti-Patterns section calls out ("copy-pasting the classic PDF template's structure into the modern template... every future fix must be applied twice") — `.planning/research/PITFALLS.md`'s Technical Debt table lists it explicitly |

**Key insight:** every cross-cutting display decision in this codebase (labels, formatAddress/formatDate, deposit display, section visibility) already has exactly ONE shared pure-function home under `lib/estimate/*`. The discount-suffix fix should follow that same established pattern rather than inventing a new one.

## Signature data flow (PDFPAR-02)

### Schema (verified: `supabase/migrations/20260519000002_digital_signature_and_estimate_terms.sql` + `20260717000001_phase164_signature_snapshot.sql`)

```sql
estimate_signatures (
  id, estimate_id, company_id,
  signer_name    TEXT NOT NULL,
  signer_email   TEXT,
  signature_data TEXT NOT NULL,  -- full data URL: 'data:image/png;base64,...'
  ip_address, user_agent,
  signed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signed_content JSONB,          -- TRUST-01 frozen snapshot (Phase 164)
  signed_total   NUMERIC(12,2)
)
```

Canvas source confirms the exact format: `components/share/signature-pad.tsx:88` — `canvas.toDataURL('image/png')` on a 600×160px white-background canvas (aspect ratio 3.75:1 — size the signature-block image accordingly across all 4 surfaces for visual consistency).

### Current query gap

`loadLatestSignedSnapshot` (`lib/queries/share.ts:35-48`) — the ONE shared query already used by both `share.ts` (webview) AND `lib/pdf/render-estimate-pdf.ts` (all 3 PDF paths, via `resolveEstimatePdfContext`, `render-estimate-pdf.ts:91`) — currently selects only `id, signed_at, signed_content, signed_total`. It does NOT select `signer_name`/`signature_data`. **This is the one function to extend** — widening its `.select()` list and its `LatestSignedSnapshotRow` interface automatically threads the new fields to every consumer that already calls it (share.ts's two lookups + the PDF resolver), matching the "one shared query, no duplicated logic" discipline the codebase already established for TRUST-01 (`lib/queries/estimate.ts:175-181`'s own comment on this exact discipline).

### The 4 render targets and what each needs

| Surface | Current signature-data access | What's needed |
|---|---|---|
| Share webview (Classic or Modern via `estimate-view.tsx`) | None — `ShareEstimateData['estimate']` has no signature fields | Extend `getEstimateByShareToken`/`getEstimateByPublicToken` (`lib/queries/share.ts:129-332`, `:375-531`) to call the widened `loadLatestSignedSnapshot` (already called there for `signed_content`, `share.ts:198,433`) and add `signerName`/`signedAt`/`signatureImageDataUrl` to `ShareEstimateData['estimate']`, then thread through `EstimateView`/`EstimateViewInner` into a new prop passed to `EstimateDocument`/`EstimateDocumentModern` |
| Workspace doc, view mode (Classic only — Correction 2) | `hasSignature: boolean` only, via a `select('id')` EXISTS-style query (`lib/queries/estimate.ts:190,204`) — no display fields | The shared `fetchEstimateWithSections` helper (`lib/queries/estimate.ts:167-206`) needs to also fetch signature display fields (reuse the same widened `loadLatestSignedSnapshot`, or extend the existing `estimate_signatures` select at line 190 to include `signer_name, signature_data, signed_at`) and thread through `EstimateEditorState` (`use-estimate-reducer.ts:93` currently only has `hasSignature: boolean` — add the 3 display fields alongside it) into `stateToDocumentData()` (`estimate-editor.tsx:49-108`) |
| Classic PDF | None | `lib/pdf/render-estimate-pdf.ts`'s `resolveEstimatePdfContext` already calls `loadLatestSignedSnapshot` (`:91`) — once that query is widened, thread `signedSnapshotRow.signer_name`/`.signature_data`/`.signed_at` into the `EstimatePdfContext` and then into the `createElement(PDFComponent, {...})` props (`:165-174`) as a new `signature` prop |
| Modern PDF | Same as Classic PDF — same resolver, same fix point | Same |

Since all 3 PDF paths already funnel through this ONE resolver (Phase 182's PDFPAR-04), adding the signature prop here automatically reaches the download route, the email send route, and the WhatsApp document delivery path — no per-call-site work needed (unlike Phase 182's send-path fix, which had to touch 3 files; this phase's signature plumbing touches exactly 1 resolver + 2 PDF components + 4 webview/editor files).

### Placement (per CONTEXT.md: "after totals/terms, standard document convention; atomic block")

All 4 document component bodies render, in order: Sections → Totals → Terms → Photos. CONTEXT.md's "after totals/terms" placement means the signature block mounts **between Terms and Photos** (or after Photos — CONTEXT doesn't fully disambiguate relative to the photo grid; this is within "Claude's Discretion: exact signature block layout"). Recommend: Terms → **Signature** → Photos, since a signature is part of the document's legal/acceptance content (closer to Terms) while photos are supplementary reference material — but this ordering is not owner-locked, flag as a planner decision.

**Note on the webview's existing accept/decline UI:** this is separate from the new signature-block requirement. `estimate-view.tsx:440-506`'s "Estimate Accepted" card (with generic "you accepted on {date}" text, no image) is the RESPONSE mechanism, lives OUTSIDE the document component (in the page wrapper, alongside Estimate Terms/Invoices cards), and is explicitly unchanged by this phase — CONTEXT.md's Decisions don't touch it. The NEW signature block (image + signer + date) is DOCUMENT CONTENT and mounts INSIDE `EstimateDocument`/`EstimateDocumentModern`/both PDF components, not in the page wrapper — this is a different, additional element, not a replacement for the existing accept/decline card.

### `<Image>` base64 support (confirmed)

react-pdf's `Image` component's `ImageSrc` type includes a `Base64ImageSrc` variant accepting `data:image${string}` URIs directly (react-pdf.org/components, cross-verified via `@react-pdf/image`'s published type surface and GitHub issue history). `signature_data` is stored as exactly this format (`data:image/png;base64,...`) — pass it straight through, no transformation. The one known historical bug (GitHub #1072) is specific to `PDFDownloadLink`'s client-side blob generation path, which this codebase does not use (all 3 PDF paths call server-side `renderToBuffer` via the shared resolver) — not applicable here. **Confidence: MEDIUM-HIGH** (official docs + type surface + issue cross-check; no live render test was performed in this research pass — recommend the plan's first signature-block task include an actual `renderToBuffer` smoke test against a real base64 PNG fixture, not just an element-tree-walk assertion, to close this out to HIGH before relying on it further).

### Presentation-settings gate

`lib/estimate/presentation-settings.ts`'s `SectionKey` union (`:7-14`) has exactly 7 keys today: `summary | sections | payment_terms | timeline | warranty_terms | notes | photos` — **no `signature` key exists**, and CONTEXT.md's Decisions section does not ask for one (no toggle to hide the signature block once an estimate is signed). Recommend: do NOT add a new `SectionKey`. Gate the signature block purely on data presence (`loadLatestSignedSnapshot` returned a row with non-null `signature_data`) — matching the locked "Unsigned estimates: no signature block" rule. If product later wants a hide toggle, that is a new decision for a future phase, not inferred here.

## Photo captions (PDFPAR-03)

### Data already flows — confirmed at every layer

- `DocumentPhoto` (`lib/estimate/document/model.ts:76-81`) already types `caption: string | null`.
- Webview: `data.attachedPhotos` already carries `caption` (webview classic `AttachedPhotoThumb` receives the full `photo` object at `estimate-document.tsx:1252-1258`; webview modern destructures `photo.caption` today ONLY for `alt=` at `estimate-document-modern.tsx:432`).
- PDF: `app/api/estimates/[id]/pdf/route.ts` / `lib/pdf/render-estimate-pdf.ts:157-162` already resolves `{ url, caption }` per photo and passes it as `attachedPhotos` prop (`EstimatePDFProps.attachedPhotos`, `estimate-pdf.tsx:71`) — the PDF JSX (`estimate-pdf.tsx:676-684`, `estimate-pdf-modern.tsx:677-685`) maps over `attachedPhotos` but only renders `<Image src={photo.url} .../>`, never `photo.caption`.

**Nothing to fetch or thread — this is purely a rendering gap in 4 files' JSX**, each needing: wrap the photo image in a per-photo container, add a caption `<Text>`/`<p>` below it, conditional on `photo.caption` being non-null/non-empty (CONTEXT.md: "No caption → no empty space").

### Exact insertion points

| Surface | Current structure | Change |
|---|---|---|
| Classic webview | `AttachedPhotoThumb` (`estimate-document.tsx:1252-1300`) is a single `div.aspect-square` — the grid maps it directly as the grid cell (`:1760-1769`) | Wrap `AttachedPhotoThumb` in a per-photo `<div>` (image + caption `<p>` below), OR add the caption paragraph inside `AttachedPhotoThumb` itself below the `aspect-square` image div |
| Modern webview | Same pattern, grid maps a raw `<img>` directly as the grid cell (`estimate-document-modern.tsx:427-436`) | Wrap each grid cell in a `<div>` with the image + a caption `<p>` below, conditional on `photo.caption` |
| Classic PDF | Bare `<Image>` mapped directly inside a `flexDirection:'row', flexWrap:'wrap'` `View` (`estimate-pdf.tsx:676-684`) | Wrap each `<Image>` in its own `<View style={{width:150}}>` with a `<Text>` caption below, conditional on `photo.caption` |
| Modern PDF | Same pattern (`estimate-pdf-modern.tsx:677-685`) | Same fix |

If the `PdfPhotoGrid` shared component (Architecture Patterns above) is built, this becomes ONE change point for both PDF templates instead of two.

### Gate: reuse the existing `photos` key, no new key

Photo captions are sub-content of the photo grid, already gated by `isSectionVisible(resolvedSettings, 'photos')` in all 4 surfaces today (`estimate-document.tsx:1754`, `estimate-document-modern.tsx:420`, `estimate-pdf.tsx:672`, `estimate-pdf-modern.tsx:673`). Do not add a separate caption-visibility key — captions inherit the photo grid's existing gate automatically since they render inside the same conditional block.

## Discount display fragmentation (part of PDFPAR-01)

### The three vocabularies (all verified live in code)

| Domain | Values | Where |
|---|---|---|
| DB column / save-path schema | `'percentage' \| 'fixed' \| null` | `lib/schemas/estimate.ts:25` (`discountTypeSchema`), DB column is plain `TEXT` with no CHECK constraint (`supabase/migrations/20260409000001_initial_schema.sql:102`) |
| AI-generation write path | `'amount'` (always, when a discount exists) | `lib/services/generate-estimate.ts:554` — `discount_type: safeDiscountAmount > 0 ? 'amount' : null` — **AI never writes 'percentage'**, only a fixed dollar amount |
| Totals engine internal domain | `'percent' \| 'amount' \| 'none'` | `lib/estimate/compute-totals.ts:62,134-137` — `saveEstimate`/WhatsApp confirm-actions map DB values into this domain before calling the engine (`lib/actions/estimate.ts:72-77`, `lib/whatsapp/confirm-actions.ts:423-425`) |

### The display bug CONTEXT.md asks to fix

All 4 renderers check `data.discount_type === 'percentage'` to decide whether to show the `(x%)` suffix (`estimate-document.tsx:842`, `estimate-document-modern.tsx:327`, `estimate-pdf.tsx:569`, `estimate-pdf-modern.tsx:575`). Today this is only ever true for a `'percentage'`-typed discount created via the editor's Select dropdown (`estimate-document.tsx:791`) — since AI-generated discounts are always `'amount'`-typed, this check is already correct for them (no suffix, which is right for a fixed-dollar discount). The fragmentation risk is that a FUTURE surface or a not-yet-audited write path could persist `'percent'` (the engine's internal spelling) directly, which the current `=== 'percentage'` check would silently miss. **Recommend:** a single shared `isPercentageDiscount(type: string | null): boolean` predicate that treats `'percentage'` OR `'percent'` as percentage, everything else (`'fixed'`, `'amount'`, `null`) as not — consolidating the 4 duplicated inline checks into ONE tested function, per the "Don't Hand-Roll" table above.

### A related, more serious bug found during this research (flag for the planner/owner — likely OUT of this phase's literal scope, but discovered via the same fragmentation CONTEXT.md named)

`lib/actions/estimate.ts:72-77`'s `engineDiscountType` mapping only recognizes `'percentage'` → `'percent'` and `'fixed'` → `'amount'`; anything else (including the AI-write value `'amount'`) falls through to `'none'`. **This means:** an AI-generated estimate with a discount (`discount_type: 'amount'`) that the owner never explicitly re-touches in the Discount-type dropdown will have its discount silently DROPPED (recomputed as if `discountType: 'none'`) the very first time `saveEstimate` runs — because the save path's domain-mapping doesn't recognize `'amount'` as a valid input value, only as its own internal output spelling for `'fixed'`. This is a **pre-existing, live data-loss bug** in the save path (`lib/actions/estimate.ts`), not a display bug, and is arguably a different fix location than "the PDF layer" CONTEXT.md scoped this decision to. **Recommendation: surface this to the owner as a discovered issue; do not silently fix it as part of PDFPAR-01's display normalization (different file, different risk profile, GUARD-03-adjacent) unless explicitly asked to widen scope.** If the owner wants both fixed together, `engineDiscountType`'s mapping needs a 4th branch: `estimateData.discount_type === 'amount' ? 'amount' : ...` before the `'none'` fallback.

## Font strategy (Claude's Discretion, with a strong recommendation)

**Recommendation: land `Font.register` in this phase, for both templates.**

Reasoning:
1. Phase 184's own CONTEXT.md (`184-CONTEXT.md:29`) says explicitly: *"register the same TTF family the web renders... coordinate with what Phase 183 shipped (if 183 already registered fonts, reuse; do not have two font sources)."* This is a direct signal that landing it here is the expected/preferred sequencing.
2. This phase is ALREADY structurally rewriting both PDF template files' `StyleSheet.create()` blocks (ENGINE-03 completion) — adding `Font.register` calls + swapping `fontFamily` token values is near-zero marginal touch cost while already in those files, versus Phase 184 needing to re-open the same 2 files again just for fonts.
3. Phase 184's fontkit-based pagination measurement is only accurate if it measures the SAME font the PDF actually renders — landing fonts now means 184 starts from a stable, already-shipped font identity instead of also deciding this.

Font choices, per the verified web-rendered fonts:
- **Classic PDF → Inter** (Regular + Bold minimum; Italic if any Classic content uses it — none found in the current templates). Matches Classic webview's actual rendered font exactly (`app/layout.tsx:2,11-13`, `next/font/google` Inter, applied globally via `--font-inter`).
- **Modern PDF → a real OFL-licensed serif TTF** (e.g. Source Serif 4 or Lora), replacing the built-in `Times-Roman`/`Times-Bold`. This is NOT byte-identical to Modern webview's `font-serif` (a generic system-serif stack resolving differently per OS/browser — Georgia, Cambria, Times New Roman, etc.) — no single TTF can be, since the web side isn't pinned to one font either. Picking one concrete, embeddable serif TTF is the best available convergence and is explicitly the STACK.md-recommended path ("Stack Patterns by Variant" table).

**What this phase does NOT need to do:** any fontkit/linebreak measurement work, any pagination-safety-margin calibration, or the STACK.md-flagged "spike" comparing browser-vs-fontkit line-wrap determinism — all of that is Phase 184's job (`PGBRK-05`). This phase's font work is scoped to registration + correct glyph rendering only.

**Open implementation gap (not resolved in this research pass):** no TTF font files currently exist in the repo (`assets/fonts/` does not exist; confirmed via filesystem search), and no npm package cleanly ships ready-to-use TTF files for Inter (`@fontsource/inter@5.3.0`, verified via `npm view`, ships WOFF2 — the exact format STACK.md warns is unreliable with `Font.register`). Sourcing the actual `.ttf` binary files (from Google Fonts' official TTF export or Inter's/Source Serif's GitHub releases, OFL-licensed) and committing them under a Docker-build-context path is implementation work for the plan's task list, not something resolvable via this research pass's tools.

## Common Pitfalls

### Pitfall 1: Applying the "solid banner" fix to the wrong template
**What goes wrong:** Reading CONTEXT.md literally ("the workspace/webview modern doc has a solid brand-color ESTIMATE banner") and adding a solid fill to Modern PDF's title/section headers.
**Why it happens:** CONTEXT.md's own wording mislabels the Classic template as "modern" (see Correction 1/2) — there is no "workspace modern doc" at all.
**How to avoid:** Apply the solid-fill banner change to `estimate-pdf.tsx` (Classic) ONLY. Leave `estimate-pdf-modern.tsx`'s existing hairline/accent-only title and section headers untouched — they already match Modern webview's own hairline design.
**Warning signs:** A diff that adds `backgroundColor: brandColor` to `estimate-pdf-modern.tsx`'s `estimateTitle` or `sectionHeader` styles.

### Pitfall 2: Building `PdfTotalsBlock` as one component with a mode flag that erases the deliberate Classic/Modern design difference
**What goes wrong:** Classic's totals block is a "standard boxed row list"; Modern's is a large standalone "hero" total. These are NOT incidental style differences — they are the templates' distinct design identities (mirrored exactly in both webview surfaces too). Collapsing them into one component that only varies a color/font risks losing the structural hero-vs-row-list distinction.
**How to avoid:** Either keep 2 separate totals renderers reading shared data-derivation logic (`deriveDepositDisplay`, already shared), or use an explicit `variant: 'classic' | 'modern'` branch inside one component that renders genuinely different JSX per variant — never a single JSX tree parameterized only by token values for this one block.

### Pitfall 3: Treating "no `SectionKey` for signature" as a bug to fix
**What goes wrong:** Adding a new `presentation_settings.sections.signature` toggle because "every other section has one."
**Why it happens:** Pattern-matching against the other 7 `SectionKey`s without checking CONTEXT.md's actual Decisions.
**How to avoid:** CONTEXT.md's locked rule is purely data-presence-based ("Unsigned estimates: no signature block") — no visibility toggle was requested. Adding one is scope creep into a new product decision this phase wasn't asked to make.

### Pitfall 4: `loadLatestSignedSnapshot`'s type signature blocking the workspace-editor caller
**What goes wrong:** `loadLatestSignedSnapshot`'s parameter is typed `ReturnType<typeof requireServiceClient>` (`lib/queries/share.ts:36`), not a generic `SupabaseClient`. If the workspace editor's server-side data loader tries to call it with an authenticated (non-service) client, TypeScript will reject it even though the RLS policy (`estimate_signatures_select`, migration `20260519000002:28-29`) already permits an authenticated company-owner read.
**How to avoid:** Either (a) widen `loadLatestSignedSnapshot`'s parameter type to a generic `SupabaseClient` (safe — it's already called with both a service client, per `render-estimate-pdf.ts:90-91`'s `requireServiceClient()`, and would work identically with an authenticated client given the RLS policy), or (b) have the workspace-editor loader call it with `requireServiceClient()` too, mirroring the PDF resolver's own pattern (`render-estimate-pdf.ts:90`). Prefer (b) for consistency with the established "resolve via service client, bypass RLS deliberately, same helper everywhere" pattern already used for signatures.

### Pitfall 5: New required fields on `EstimateDocumentData`/`DocumentModel` breaking every existing test fixture
**What goes wrong:** `EstimateDocumentData` (and the PDF components' props) are constructed as full object literals in ~10+ test files (`document-totals-view.test.tsx`, `document-page-view.test.tsx`, `presentation-settings-cross-surface.test.tsx`, `document-bill-to.test.tsx`, `document-alignment.test.tsx`, `estimate-pdf-totals.test.tsx`, `estimate-pdf-modern-totals.test.tsx`, etc.). Adding a new field as a REQUIRED (non-optional) property forces every one of those fixtures to be updated.
**How to avoid:** Add the new `signature` field (and any caption-related type additions, though `DocumentPhoto.caption` already exists) as OPTIONAL (`signature?: {...} | null`) on `DocumentModel`/`EstimateDocumentData`, matching the existing pattern for `attachedPhotos?`.
**Warning signs:** A `tsc` run surfacing dozens of "missing property" errors across `tests/unit/estimate/*` and `tests/unit/pdf/*` after adding the field.

### Pitfall 6: Structural PDF de-dup silently changing spacing/padding with no test coverage
**What goes wrong:** The existing PDF tests (`estimate-pdf-totals.test.tsx`, `estimate-pdf-modern-totals.test.tsx`, the cross-surface test) only assert `<Text>` content/order via the element-tree walker — NONE of them assert `StyleSheet` values (padding, margin, color). A structural refactor that accidentally changes a spacing value will not be caught by any existing automated test.
**How to avoid:** Since this is a low-stakes visual (not correctness) risk, rely on a manual/visual check (render a sample PDF from each template before/after the refactor and eyeball-diff) rather than trying to retrofit pixel-level test coverage — but explicitly call this out as a verification step in the plan (it will NOT be automatically caught).

### Pitfall 7 (inherited from `.planning/research/PITFALLS.md`, still applicable): one failed remote/base64 image aborts the whole PDF render
Adding a NEW image source (`signature_data`) doubles the per-render image-failure surface (previously only attached photos). The existing pattern (`render-estimate-pdf.ts:154-162`, pre-resolve photo URLs in a `Promise.all` before constructing the element tree) should extend to the signature image path too — though `signature_data` is a data URI already resolved from the DB row (no network fetch needed, unlike photos' signed Storage URLs), so the failure mode here is narrower (malformed/corrupt base64, not a network 404) but still worth a defensive check (e.g., verify the string starts with `data:image/` before passing to `<Image>`, and log+omit rather than let a malformed row crash the whole render).

## Code Examples

### Element-tree text-walker (reuse, don't reinvent — already extracted as a shared test helper)

```typescript
// Source: tests/unit/estimate/_pdf-text-walker.ts (existing, already shared by
// estimate-pdf-totals.test.tsx's local copy + presentation-settings-cross-surface.test.tsx)
import { collectTextNodes, flattenText } from './_pdf-text-walker'

const out: string[] = []
collectTextNodes(EstimatePDF({ estimate, company, client, projectName, projectType, language: 'en' }), out)
// out is the flattened, in-document-order text content of every <Text> node —
// use this to assert signer name / signed date / discount suffix / caption text
// appear, and in the right order relative to totals/terms/photos.
```

### Base64 signature `<Image>` (react-pdf, server-side)

```tsx
// Source: react-pdf.org/components (Base64ImageSrc — data:image${string}),
// cross-verified via signature-pad.tsx:88 confirming the exact stored format
{signature?.signatureData && (
  <View wrap={false}>
    {/* eslint-disable-next-line jsx-a11y/alt-text */}
    <Image src={signature.signatureData} style={{ width: 150, height: 40, objectFit: 'contain' }} />
    <Text>{signature.signerName}</Text>
    <Text>{formatDate(signature.signedAt, language)}</Text>
  </View>
)}
```

### Shared discount-percentage predicate (new — follow `deriveDepositDisplay`'s existing pattern)

```typescript
// Source: pattern mirrors lib/estimate/deposit-display.ts (existing, pure, framework-free)
// Recommend: lib/estimate/document/format.ts or a sibling discount-display.ts
export function isPercentageDiscount(discountType: string | null): boolean {
  return discountType === 'percentage' || discountType === 'percent'
}
// Callers replace: data.discount_type === 'percentage' ? ` (${data.discount_value}%)` : ''
// with:            isPercentageDiscount(data.discount_type) ? ` (${data.discount_value}%)` : ''
```

## State of the Art

| Old Approach (pre-183) | Current/Target Approach (183) | When Changed | Impact |
|--------------------------|--------------------------------|---------------|--------|
| 2 independent ~700-line PDF `StyleSheet`+JSX trees, byte-duplicated structure | Shared `components/pdf/shared/*` layout components + widened `ESTIMATE_DESIGN_TOKENS` | This phase (completes ENGINE-03, started Phase 182) | Future template fixes apply once, not twice |
| Signature data captured (Phase 164, TRUST-01) but never displayed anywhere | Displayed on all 4 document surfaces | This phase (PDFPAR-02) | Closes the "signed PDF looks identical to unsigned" gap the milestone's requirements doc calls out |
| `photo.caption` resolved end-to-end but dropped in JSX on all 4 surfaces | Rendered under each photo, all 4 surfaces | This phase (PDFPAR-03) | Closes a silent data-loss-at-render gap (data was never lost in storage, just never shown) |
| Built-in `Helvetica`/`Times-Roman` AFM fonts in both PDF templates | Registered TTF (Inter for Classic, a serif TTF for Modern) — if landed this phase | This phase (font strategy) or Phase 184 | Sets up Phase 184's fontkit-based pagination measurement to measure the SAME font the PDF actually renders |

**Deprecated/outdated:** none — Phase 182 already retired the per-surface label/format duplication; this phase's job is layout/content, not another deprecation pass.

## Open Questions

1. **Should the discovered save-path discount-type-mapping bug (`lib/actions/estimate.ts:72-77` silently dropping AI-generated `'amount'`-typed discounts on first save) be fixed in this phase?**
   - What we know: it's a real, live, silent-data-loss bug directly caused by the same fragmentation triangle CONTEXT.md names.
   - What's unclear: CONTEXT.md scoped the fix to "the PDF layer" / display; this bug lives in the save action, a different file with different risk (GUARD-03-adjacent, though the fix itself doesn't touch totals MATH, only the discount-type domain mapping).
   - Recommendation: surface to the owner explicitly before planning; do not silently bundle it into PDFPAR-01's display-normalization task without an explicit go-ahead, since it changes save-path behavior (todos: two-line fix, one new test) rather than pure rendering.

2. **Exact signature-block position relative to the photo grid (Terms → Signature → Photos, or Terms → Photos → Signature)?**
   - What we know: CONTEXT.md locks "after totals/terms."
   - What's unclear: relative order vs. the photo grid specifically.
   - Recommendation: default to Terms → Signature → Photos (signature is document-acceptance content, closer to terms than to supplementary photos) unless the owner has a preference; this is within "Claude's Discretion" per CONTEXT.md.

3. **Does landing `Font.register` in this phase risk scope creep beyond "content parity"?**
   - What we know: Phase 184's CONTEXT explicitly prefers reusing whatever font Phase 183 already registered, and this phase is already touching both PDF template files structurally.
   - What's unclear: whether the planner considers font-asset sourcing (downloading/vendoring TTF files) in-scope busywork for a "parity content" phase vs. a distraction from PDFPAR-01/02/03.
   - Recommendation: land it — the marginal cost is low given the files are already being touched, and it measurably de-risks Phase 184. If the planner disagrees, defer explicitly and note it in 184's plan input.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.4` (package.json) |
| Config file | `vitest.config.ts` (root) — confirm exact path if plan needs it; test script is `vitest run` |
| Quick run command | `npx vitest run tests/unit/pdf tests/unit/estimate/document-*.test.ts* tests/unit/estimate/presentation-settings-cross-surface.test.tsx` |
| Full suite command | `pnpm vitest run tests/unit tests/eval` (matches CI's `Test` workflow, per CLAUDE.md's CI-gates note) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PDFPAR-01 (banner) | Classic PDF ESTIMATE title has `backgroundColor: brandColor`; Modern PDF's title/section headers remain fill-free | unit (element-tree walk, assert `style` prop on the rendered `<View>`/`<Text>` node, not just text content) | new test, e.g. `tests/unit/pdf/estimate-pdf-banner-fill.test.tsx` | ❌ Wave 0 |
| PDFPAR-01 (discount suffix) | `isPercentageDiscount()` predicate returns correct boolean for `'percentage'`, `'percent'`, `'fixed'`, `'amount'`, `null` | unit | `npx vitest run tests/unit/estimate/discount-display.test.ts` (new) | ❌ Wave 0 |
| PDFPAR-01 (discount suffix, cross-surface) | All 4 renderers show/hide `(x%)` identically for the same `discount_type` | unit (extend `presentation-settings-cross-surface.test.tsx`'s existing cross-surface pattern, or a new sibling file using the same 6-renderer fixture approach) | `npx vitest run tests/unit/estimate/presentation-settings-cross-surface.test.tsx` (extend) or new sibling | ✅ pattern exists, extend |
| PDFPAR-02 (signature block presence/order) | Signed estimate → all 4 surfaces render signer name + signed date + image, positioned after Terms; unsigned → no block, no empty space | unit (element-tree walk for PDF; RTL `render`+`screen` for webview components, mirroring `document-totals-view.test.tsx`'s pattern) | new: `tests/unit/pdf/estimate-pdf-signature.test.tsx`, `tests/unit/pdf/estimate-pdf-modern-signature.test.tsx`, `tests/unit/estimate/document-signature-view.test.tsx` | ❌ Wave 0 |
| PDFPAR-02 (data plumbing) | `loadLatestSignedSnapshot` returns `signer_name`/`signature_data`/`signed_at` when present, `null` fields for legacy signatures (dormant-first, mirrors TRUST-01's own retrocompat discipline) | unit | extend `tests/unit/estimate/signature-snapshot.test.ts` or `tests/unit/share-query.test.ts` | ✅ files exist, extend |
| PDFPAR-03 (caption presence/absence) | Photo with caption → caption text renders; photo without → no caption element, no empty space; all 4 surfaces | unit (element-tree walk for PDF; RTL for webview) | new: extend `estimate-pdf-totals.test.tsx`-sibling or a new `estimate-pdf-photo-captions.test.tsx`; webview equivalent under `tests/unit/estimate/` | ❌ Wave 0 |
| ENGINE-03 (structural de-dup) | Both PDF templates render byte-identical `<Text>` content/order before and after the `components/pdf/shared/*` extraction (regression, not a new behavior) | unit (run existing `estimate-pdf-totals.test.tsx` + `estimate-pdf-modern-totals.test.tsx` + `presentation-settings-cross-surface.test.tsx` before/after the refactor — they must stay green with zero diff) | `npx vitest run tests/unit/pdf tests/unit/estimate/presentation-settings-cross-surface.test.tsx` | ✅ existing, regression-gate |
| ENGINE-03 (framework-import boundary) | Any new shared token/data file stays free of `react`/`@react-pdf/renderer`/`components/*` imports | unit (static grep, existing pattern) | extend `tests/unit/estimate/document-engine-boundary.test.ts`'s `ENGINE_FILES` array if `tokens.ts` gains new exports (no new file needed unless a new `lib/estimate/document/*.ts` file is created) | ✅ existing, extend list only if new files added |

### Sampling Rate
- **Per task commit:** the quick run command above (PDF + document tests + cross-surface parity test) — completes well under 30s given the existing suite's element-tree-walk pattern (no real PDF rendering, no browser).
- **Per wave merge:** full suite (`pnpm vitest run tests/unit tests/eval`) + `npx tsc -p tsconfig.ci.json --noEmit` (per CLAUDE.md's CI-gates note: CI scopes `tsc` to app/lib/components/hooks, not bare `tsc`).
- **Phase gate:** full suite green before `/gsd:verify-work`, PLUS a manual visual check of both PDF templates (download-route smoke test against a real signed + captioned estimate) — per Pitfall 6, spacing/padding regressions from the ENGINE-03 refactor are NOT caught by any automated test.

### Wave 0 Gaps
- [ ] `tests/unit/pdf/estimate-pdf-banner-fill.test.tsx` (or fold into a broader PDFPAR-01 structural test) — covers the Classic-only banner fill assertion (Correction 1) and a NEGATIVE assertion that Modern PDF's title/section headers stay fill-free (guards against Pitfall 1)
- [ ] `tests/unit/estimate/discount-display.test.ts` (or wherever the new `isPercentageDiscount` predicate lands) — covers PDFPAR-01's discount-suffix normalization
- [ ] `tests/unit/pdf/estimate-pdf-signature.test.tsx` + modern sibling + a webview-side signature test — covers PDFPAR-02 across all 4 surfaces (signed + unsigned cases, position-after-terms)
- [ ] Photo-caption tests (PDF + webview) — covers PDFPAR-03's presence/absence + no-empty-space behavior
- [ ] No new test framework/config needed — Vitest + the existing element-tree-walker (`tests/unit/estimate/_pdf-text-walker.ts`) + RTL patterns fully cover this phase's testable surface

## Sources

### Primary (HIGH confidence — direct code reads, 2026-07-28)
- `components/workspace/estimate/estimate-document.tsx`, `components/share/estimate-document-modern.tsx`, `components/pdf/estimate-pdf.tsx`, `components/pdf/estimate-pdf-modern.tsx` — full-file + targeted reads, line-cited throughout
- `components/share/estimate-view.tsx`, `components/share/signature-pad.tsx` — signature capture flow, accept/decline UI boundary
- `lib/estimate/document/{model,labels,format,tokens}.ts` — Phase 182 shared engine, current scope of ENGINE-01/02/03
- `lib/queries/share.ts`, `lib/estimate/signed-snapshot.ts`, `lib/pdf/render-estimate-pdf.ts`, `app/api/estimates/[id]/pdf/route.ts`, `app/api/estimates/[id]/sign/route.ts`, `lib/queries/estimate.ts`, `components/workspace/estimate/{estimate-editor,use-estimate-reducer}.tsx` — signature/data-flow tracing
- `lib/estimate/presentation-settings.ts`, `lib/estimate/compute-totals.ts`, `lib/actions/estimate.ts`, `lib/services/generate-estimate.ts`, `lib/schemas/estimate.ts`, `lib/whatsapp/confirm-actions.ts` — discount-type fragmentation tracing
- `supabase/migrations/20260519000002_digital_signature_and_estimate_terms.sql`, `20260717000001_phase164_signature_snapshot.sql`, `20260409000001_initial_schema.sql`, `20260627000001_phase129_advanced_pricing_schema.sql` — schema ground truth
- `tests/unit/pdf/estimate-pdf-totals.test.tsx`, `tests/unit/estimate/_pdf-text-walker.ts`, `tests/unit/estimate/document-engine-boundary.test.ts`, `tests/unit/estimate/pt-px-conversion-source.test.ts`, `tests/unit/estimate/document-label-parity.test.ts`, `tests/unit/estimate/presentation-settings-cross-surface.test.tsx`, `tests/unit/estimate/document-totals-view.test.tsx`, `tests/unit/estimate/document-page-view.test.tsx`, `tests/unit/estimate/discount-totals.test.ts` — existing test conventions
- `app/layout.tsx` — confirms Inter is the actual web-rendered font
- `.planning/phases/182-shared-document-engine-send-path-fix/182-02-SUMMARY.md`, `182-03-SUMMARY.md` — post-182 live state, ENGINE-03 partial-delivery note
- `.planning/phases/183-pdf-parity-content/183-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/phases/184-consolidated-pagination-engine/184-CONTEXT.md` — locked decisions + downstream phase's font expectations
- `npm view @react-pdf/renderer`, `npm view @fontsource/inter@5.3.0`, local `package.json` — dependency ground truth (`@react-pdf/renderer@^4.4.0` installed; `fontkit`/`linebreak` NOT direct deps; `@fontsource/inter` ships WOFF2, not TTF)

### Secondary (MEDIUM confidence — WebFetch/WebSearch, verified against official sources)
- [react-pdf.org/components](https://react-pdf.org/components) — `Image` component source formats, base64/data-URI support (WebFetch, 2026-07-28)
- [diegomura/react-pdf Issue #1072](https://github.com/diegomura/react-pdf/issues/1072) — base64 + `PDFDownloadLink` caveat (confirmed NOT applicable — this project uses server-side `renderToBuffer`, not `PDFDownloadLink`)

### Tertiary (carried from milestone research, already MEDIUM-HIGH per their own confidence notes)
- `.planning/research/STACK.md` — font/measurement stack guidance (fontkit/linebreak, TTF-not-WOFF2, do-not-add list)
- `.planning/research/PITFALLS.md` — dual-engine convergence traps, base64 image failure modes, structural de-dup anti-pattern
- `.planning/research/ARCHITECTURE.md` — shared document model design (Q1), corrected milestone framing precedent (the technique this file's own corrections follow)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new runtime deps required; font-asset sourcing is the only unresolved implementation detail (explicitly flagged)
- Architecture (parity checklist, shared components): HIGH — every row in the checklist is a direct file:line comparison, not inference
- Signature data flow: HIGH for schema/query gap, MEDIUM-HIGH for `<Image>` base64 support (verified via official docs + type surface, not a live render test)
- Discount fragmentation: HIGH — all 3 vocabularies traced to exact file:line sources; the related save-path bug is a verified finding, not speculation
- Pitfalls: HIGH — all 7 are grounded in either direct code contradictions of CONTEXT.md's framing or verified codebase patterns (test fixture literalism, type-signature mismatches)

**Research date:** 2026-07-28
**Valid until:** ~30 days (stable domain — react-pdf API surface and this codebase's own architecture change slowly; re-verify if Phase 182's files are touched again before this phase executes)
