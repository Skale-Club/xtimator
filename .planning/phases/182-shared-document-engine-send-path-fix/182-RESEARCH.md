# Phase 182: Shared Document Engine + Send-Path Fix - Research

**Researched:** 2026-07-27
**Domain:** Cross-surface code extraction (DOM + `@react-pdf/renderer`) and trust-critical PDF send-path convergence, Next.js 16 App Router / Supabase
**Confidence:** HIGH — every claim below is grounded in a direct read of the current repository files (paths + line numbers cited), not inferred from milestone framing. The four label/format duplicates and the two defective send paths were independently re-verified in this research pass (not just taken from `.planning/research/ARCHITECTURE.md`).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Shared document engine (ENGINE-01..03)**
- One shared source (suggested `lib/estimate/document/`) for: document model types, label maps (en/pt/es), design tokens (colors/spacing/typography roles per template), and formatting helpers (money, date with the local-midnight timezone fix, address).
- The four renderers — `components/workspace/estimate/estimate-document.tsx`, `components/share/estimate-document-modern.tsx`, `components/pdf/estimate-pdf.tsx`, `components/pdf/estimate-pdf-modern.tsx` — consume the shared source; their duplicated local copies (PDF_LABELS, DOC_LABELS, formatAddress, formatDate, DATE_LOCALE) are deleted.
- Only ONE of the four current copies has the local-midnight date fix — the shared helper must be the fixed version, and all four surfaces adopt it.
- Page geometry defined once: LETTER 612×792pt; pt↔px conversion (1.333× @96dpi) in the same module (ENGINE-02). The existing hardcoded 816×1056px approximation in the webview must reference this module.
- Template identity stays the existing registry (`lib/estimate/templates/registry.ts`, ids `classic`/`modern`); per-template design tokens layer over shared structure (ENGINE-03).
- CRITICAL server/client boundary: the shared module must be importable from BOTH client components and the server PDF path — no react-pdf imports in the shared core, no DOM/browser APIs in it either (see PITFALLS.md shared-code traps).
- Visual output unchanged this phase: refactor-only for the four renderers. Existing tests must stay green.

**Send-path fix (PDFPAR-04)**
- Extract the proven pattern from `app/api/estimates/[id]/pdf/route.ts` (template registry resolution + `loadLatestSignedSnapshot` + `applySignedSnapshot` + preparedBy + photos) into ONE shared in-process resolver (suggested `lib/pdf/render-estimate-pdf.ts`) returning the rendered buffer.
- All three call sites consume it: `app/api/estimates/[id]/pdf/route.ts`, `app/api/estimates/[id]/send/route.ts`, `lib/whatsapp/pdf-delivery.ts`.
- NEVER an HTTP fetch from `pdf-delivery.ts` — Inngest/webhook context has no auth cookies; the resolver must accept an injected Supabase client (service-role in webhook context, user-session in routes) — this constraint is load-bearing and documented at `pdf-delivery.ts:5-8`.
- Email and WhatsApp PDFs must now honor: tenant `estimate_template_style`, signed snapshot (TRUST-01 — a signed estimate's emailed PDF must equal the signed content), preparedBy, attached photos.
- File-disjoint from the engine extraction stream → separate wave-parallel plans.

**Orchestration**
- Model tiers: Sonnet executes plans; Opus validates (plan-check/verify); parallelize file-disjoint plans in the same wave.
- Work in-place on main, commit per task, NEVER `git push` from any agent.

### Claude's Discretion
- Exact module layout inside `lib/estimate/document/` (types.ts / labels.ts / tokens.ts / format.ts split).
- Whether the document-model mapping currently inlined in `components/share/estimate-view.tsx:134-223` moves into the shared module now or in 183.
- Test approach: prefer extending existing unit tests; add snapshot/structural tests for label parity if cheap.

### Deferred Ideas (OUT OF SCOPE)
- Signature block + photo captions rendering → Phase 183 (PDFPAR-02/03).
- Pagination module → Phase 184.
- Email `attachPdf: false` hardcode in `send-hub-dialog.tsx:229` ("Email PDF" sends no PDF) — UI-side defect adjacent to PDFPAR-04; if the planner can include flipping it safely once the shared resolver exists, do it in this phase's send-path plan; otherwise defer to 183 with a note.
- ETag staleness on branding changes (route-level caching) — out of milestone scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ENGINE-01 | All four document renderers consume one shared source for document model, label maps (en/pt/es), design tokens, and formatting helpers (money, date w/ local-midnight fix, address) — no per-surface duplicated copies remain. | See "Verified duplicate inventory" — exact symbols, line ranges, and byte-diff status for all 4 files confirmed live. `lib/estimate/document/{model,labels,format,tokens}.ts` module layout + migration order specified in Architecture Patterns. |
| ENGINE-02 | Page geometry (LETTER 612×792pt) and pt↔px conversion (1.333× @96dpi) defined in exactly one shared module consumed by both renderers. | See "Page geometry" pitfall + Architecture Patterns `tokens.ts` — confirms `estimate-pdf.tsx:491` `<Page size="LETTER">` (612×792pt/72dpi) vs. webview's `estimate-document.tsx:1663-1670` `min-h-[1056px]`/`max-w-[816px]` (96dpi) are today unrelated hardcoded numbers with zero shared conversion constant. |
| ENGINE-03 | Classic and modern render from shared structure with template-specific styling only (per-template tokens), replacing the byte-duplicated ~860-line PDF template pair. | Confirmed the two PDF `PDF_LABELS`/`formatAddress`/`formatDate`/`DATE_LOCALE`/`LANG_INDICATOR` blocks are byte-identical (diffed live in this pass) — pure token/label extraction, zero JSX/StyleSheet risk if scoped correctly (see Anti-Patterns). |
| PDFPAR-04 | All three PDF paths (download route, email attachment, WhatsApp document) resolve through one shared in-process renderer honoring template choice, signed snapshot (TRUST-01), preparedBy, attached photos. | See "Send-path verification" — confirmed live: `send/route.ts:7,192-200` hardcodes `EstimatePDF`, no snapshot; `pdf-delivery.ts:15,48-56` hardcodes `EstimatePDF`, no snapshot, 24h TTL vs. route's 1h. Resolver signature + Supabase-client-injection contract specified in Architecture Patterns / Code Examples. |
</phase_requirements>

## Summary

This phase is a pure extraction/convergence phase with two independent, file-disjoint work streams that were both re-verified against the live repository in this research pass, not just taken on trust from milestone-level research.

**Stream A (ENGINE-01..03):** Four files — `components/workspace/estimate/estimate-document.tsx` (webview, edit+view), `components/share/estimate-document-modern.tsx` (share webview, view-only), `components/pdf/estimate-pdf.tsx` and `components/pdf/estimate-pdf-modern.tsx` (react-pdf) — each independently define a label map, `formatAddress()`, `formatDate()` + `DATE_LOCALE`. The two PDF files' label/format/locale/lang-indicator blocks are **byte-identical** (re-confirmed by direct diff in this research pass, not just cited). Only `estimate-document.tsx`'s `formatDate()` (lines 429-441) has the local-midnight `T00:00:00` normalization fix — the other three (`estimate-document-modern.tsx:170-177`, `estimate-pdf.tsx:217-224`, `estimate-pdf-modern.tsx:220-227`) call `new Date(dateStr)` directly, which is a live, dormant UTC-offset bug for date-only strings viewed west of UTC. No `lib/estimate/document/` module exists yet — this is greenfield extraction, not a rename of something half-built.

**Stream B (PDFPAR-04):** Three PDF call sites exist. `app/api/estimates/[id]/pdf/route.ts` is the only one done correctly — it resolves `templateId` from `company.estimate_template_style` via the `PDF_TEMPLATE_COMPONENTS` registry map, applies `loadLatestSignedSnapshot()` + `applySignedSnapshot()` (TRUST-01), resolves `preparedBy`, and pre-resolves signed photo URLs (1h TTL) before rendering. `app/api/estimates/[id]/send/route.ts` (lines 7, 192-200) and `lib/whatsapp/pdf-delivery.ts` (lines 15, 48-56) both hardcode `EstimatePDF` (Classic only), skip signature-snapshot resolution entirely (rendering live, possibly post-signature-edited rows), and `pdf-delivery.ts` uses a 24h signed-URL TTL vs. the route's 1h — confirmed live, this is a real production trust bug today, not hypothetical. `pdf-delivery.ts`'s header comment (lines 5-8) is an explicit, load-bearing constraint: it must never call the HTTP PDF route because the Inngest/webhook execution context (verified: `whatsapp-process.ts` calls the WhatsApp send chain with `requireServiceClient()`, not a cookie-bound client) has no auth cookies.

Both streams share one architectural risk (Pitfall 11 in `.planning/research/PITFALLS.md`, re-verified applicable here): the shared module must never import `@react-pdf/renderer` (which would bloat/break the client bundle of `estimate-document.tsx`, a `'use client'` file) and must never assume DOM/React-context (which the two PDF templates don't have — already noted in-repo as "no React context — plain lookups"). No ESLint `no-restricted-imports` boundary rule exists today (verified: no react-pdf pattern found in `eslint.config.mjs`) — this phase is the first opportunity to add one.

**Primary recommendation:** Extract `lib/estimate/document/{model.ts,labels.ts,format.ts,tokens.ts}` as pure, dependency-free TypeScript (no React import needed even) with the Classic webview's `formatDate` as the canonical (bug-fixed) version; separately extract `lib/pdf/render-estimate-pdf.ts` as a plain async function taking an explicit `SupabaseClient` parameter and returning `{ buffer, contentKey }`, called identically by all three PDF call sites. These two streams touch disjoint files and can be planned/executed in parallel waves.

## Verified Duplicate Inventory (live-code, re-checked this pass)

| Symbol | `estimate-document.tsx` (Classic webview) | `estimate-document-modern.tsx` (Modern webview) | `estimate-pdf.tsx` (Classic PDF) | `estimate-pdf-modern.tsx` (Modern PDF) |
|---|---|---|---|---|
| `formatDate()` | **L429-441 — HAS the local-midnight fix**: regexes `YYYY-MM-DD` and appends `T00:00:00` before `new Date(...)`. Comment explicitly explains why (CI non-determinism / west-of-UTC off-by-one-day). | L170-177 — `new Date(dateStr).toLocaleDateString(...)`, **no fix**. | L217-224 — `new Date(dateStr).toLocaleDateString(...)`, **no fix**. | L220-227 — **byte-identical** to Classic PDF's version, **no fix**. |
| `formatAddress()` | L414-427 | L155-168 — same body, comment at L151-153 says "duplicated verbatim... small, self-contained." | L198-215 | L201-218 — **byte-identical** to Classic PDF's version. |
| `DATE_LOCALE` | L243-247: `{en:'en-US', pt:'pt-BR', es:'es-MX'}` | L144-148 — same values | L144-148 — same values | L147-151 — same values |
| Label map | `DOC_LABELS` L63-196 (33 keys incl. edit-only `addItem`/`discountNone`/`depositPct`/etc.) | `DOC_LABELS` L66-142 (23 keys, view-only trimmed subset, comment L36-37 confirms this is deliberate) | `PDF_LABELS` L57-142 (25 keys incl. PDF-only `page`/`of`/`estimateNum`/`preparedBy`) | `PDF_LABELS` L60-145 — **byte-identical content** to Classic PDF's map (independently re-diffed this pass: same 25 keys, same en/pt/es strings, same interface shape `PdfLabels`). |
| `LANG_INDICATOR` | not present (webview shows no lang chip) | not present | L152-156: `{en:'EN',pt:'PT',es:'ES'}` | L155-159 — identical |
| Data-model type | `EstimateDocumentData`/`DocumentCompany`/`DocumentClient`/`DocumentItem`/`DocumentSection`/`DocumentPhoto` — exported, L266-374 | **Type-only imports these from `estimate-document.tsx`** (L12-16) — already the reuse pattern to follow for `model.ts`. | `EstimatePDFProps` wraps `EstimateWithSections` (from `lib/queries/estimate.ts`) + local `CompanyInfo`/`ClientInfo` (L158-196) | Same shape, independently declared (L161-199) — not literally identical to Classic PDF's (field lists match but declared twice). |
| Design tokens | Inline Tailwind classes + `SYSTEM_COLORS`/`ensureReadableOnWhite`/`readableTextColor` for brand color | Same mechanism, different Tailwind classes (serif, hairlines, hero total) | `StyleSheet.create()` — `fontFamily: 'Helvetica'`, brand-fill section headers, `L226-452` | Separate `StyleSheet.create()` — `fontFamily: 'Times-Roman'`, hairline-only section headers (no fill), `L229-464` — **zero numeric values shared with Classic PDF's stylesheet** (different padding, font sizes, spacing throughout). |

**Conclusion for the planner:** the two PDF files' label/format/locale/lang-indicator blocks (lines ~22-227 of each file, ~200 lines) are close to byte-identical and can be deleted wholesale in favor of one shared import with zero behavior risk. The two webview files' label maps are NOT identical (Classic is a superset with edit-only keys) — `labels.ts` must be a superset union, and each consumer keeps only the keys it renders (harmless unused keys, per Architecture Patterns below). The four `StyleSheet`/Tailwind token blocks are NOT extractable as shared values without an explicit `tokens.ts` numeric-value layer (see ENGINE-02/03 pattern) — do not attempt to unify them as literal shared style objects; unify only the underlying numeric/color/font values.

## Send-Path Verification (live-code, re-checked this pass)

Confirmed by direct read of all three files in this pass:

1. **`app/api/estimates/[id]/pdf/route.ts` — the correct pattern (lines cited from the actual file read in this session):**
   - L22-25: `PDF_TEMPLATE_COMPONENTS: Record<EstimateTemplateId, typeof EstimatePDF> = { classic: EstimatePDF, modern: EstimatePDFModern }` — registry-keyed lookup, not if/else.
   - L60-66: `signatureServiceClient = requireServiceClient()`, `loadLatestSignedSnapshot(signatureServiceClient, liveEstimate.id)`, `applySignedSnapshot(liveEstimate, signedContent)` — TRUST-01 applied unconditionally before any rendering decision.
   - L83-86: `rawTemplateId = company.estimate_template_style`; `isEstimateTemplateId(...)` guard with `DEFAULT_ESTIMATE_TEMPLATE_ID` fallback.
   - L107-122: `preparedBy` resolution — `company.owner_name` fallback, then `company_members.display_name` lookup via a **second** `requireServiceClient()` call scoped to `created_by_user_id` + `company_id`.
   - L126-132: photo signed URLs resolved via `createStorage(supabase).getSignedUrl('photos', photo.storage_path, 3600)` in a `Promise.all`, **before** constructing the `createElement(...)` tree — the "pre-resolve-then-render" pattern PITFALLS.md's Pitfall 9 requires.
   - L88-98: an ETag (`contentKey-templateId-language`) gates a 304 response — this caching discipline is explicitly called out in PITFALLS.md Pitfall 8 as something the shared resolver must not regress.
   - L138-151: `PDFComponent = PDF_TEMPLATE_COMPONENTS[templateId]`; `createElement(PDFComponent, {...})`; `renderToBuffer(element as any)`.

2. **`app/api/estimates/[id]/send/route.ts` — confirmed defect (lines cited from the actual file read in this session):**
   - L7: `import EstimatePDF from '@/components/pdf/estimate-pdf'` — only Classic is imported, no registry, no Modern import at all.
   - L188-200: `if (attachPdf) { ... createElement(EstimatePDF, { estimate, company, client, projectName, projectType, language }) ... }` — **`estimate` here is the raw live row from `getEstimateWithContext`** (L91: `const { estimate, project, company } = result`), never passed through `loadLatestSignedSnapshot`/`applySignedSnapshot`. No `preparedBy`, no `attachedPhotos` passed either (both props are optional on `EstimatePDFProps`, so this compiles fine and silently omits both fields — the PDF looks superficially valid but lacks "Prepared by" and attached photos entirely).
   - Confirms ARCHITECTURE.md/PITFALLS.md's characterization exactly: hardcoded Classic + live-rows-not-snapshot is real and unconditional (not behind any flag).
   - Also confirmed: `attachPdf` is a caller-supplied boolean in the request body (L22, L66), and `send-hub-dialog.tsx:229` (the only production caller found) **always sends `attachPdf: false`** — so today this defect is latent/unreachable from the shipped UI (email never actually attaches a PDF in practice), but the code path exists, is reachable by any authenticated caller of the route directly, and is explicitly flagged in CONTEXT.md's Deferred Ideas as an adjacent fix the planner may choose to include.

3. **`lib/whatsapp/pdf-delivery.ts` — confirmed defect (lines cited from the actual file read in this session):**
   - L1-9 (header comment): **"CRITICAL: Do NOT call `/api/estimates/[id]/pdf` internally — that route uses `createClient()` which requires auth cookies unavailable in webhook context. Instead, call `renderToBuffer` + `getEstimateWithContext` directly."** This is the load-bearing constraint CONTEXT.md refers to — verified present in the file today, not paraphrased.
   - L15: `import EstimatePDF from '@/components/pdf/estimate-pdf'` — same single-template import as `send/route.ts`.
   - L29-34: `generateAndUploadEstimatePDF(estimateId, companyId, supabase: SupabaseClient, clientName)` — **already accepts an injected `SupabaseClient`** (not created internally) — this is the exact shape the new shared resolver should mirror.
   - L36-56: fetches `getEstimateWithContext(supabase, estimateId)` directly (no snapshot load), builds `createElement(EstimatePDF, {...})` with **no `preparedBy`, no `attachedPhotos`, no template lookup, no signature snapshot** — strictly less complete than even `send/route.ts`.
   - L74-77: 24h (86400s) signed-URL TTL for the **uploaded PDF document itself** (not per-photo — this file doesn't resolve per-photo signed URLs at all today since it never passes `attachedPhotos`). Confirmed inconsistent with the download route's 1h TTL — both are "TTL for different things" (whole-PDF-document URL here vs. per-photo URLs there), so the planner should treat this as two separate TTL decisions to standardize, not one.

4. **Caller context confirmed (traced this pass, not assumed):**
   - `lib/whatsapp/send-estimate.ts` and `lib/whatsapp/confirm-actions.ts` both import `generateAndUploadEstimatePDF` and take `supabase: SupabaseClient` as a parameter (not creating their own client).
   - `lib/inngest/functions/whatsapp-process.ts` (the actual Inngest handler) calls into this chain using `requireServiceClient()` (verified: `import { requireServiceClient } from '@/lib/supabase/service'` at L15, used at L39 and L156) — confirming the webhook/Inngest execution context genuinely has only a service-role client, no cookies, exactly as the header comment states.
   - `requireServiceClient()` (`lib/supabase/service.ts:25-34`) returns a plain `createClient(url, key)` from `@supabase/supabase-js` — i.e. `loadLatestSignedSnapshot`'s parameter type `ReturnType<typeof requireServiceClient>` (in `lib/queries/share.ts:35-36`) is structurally the same `SupabaseClient` type used everywhere else in the codebase (including the user-session client from `lib/supabase/server.ts`'s `createClient()`), so a single resolver function typed to accept `SupabaseClient` (from `@supabase/supabase-js`) works for both the cookie-bound route-handler client and the service-role webhook client without any type gymnastics.

## Standard Stack

### Core

No new runtime dependencies are needed for this phase — it is a refactor/extraction phase, not a feature-adding one.

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@react-pdf/renderer` | `^4.4.0` (package.json), `4.5.1` currently resolves as latest 4.x per `npm view` run in this session | Existing PDF renderer for both templates | Unchanged this phase. No new `Font.register`/pagination work belongs here (that's Phase 184's `STACK.md`). A routine `^4.4.0` → `^4.5.1` lockfile bump is optional housekeeping, not required by this phase's requirements — do not bundle it into this phase's scope unless trivially free. |
| React 19.2.4 / Next.js 16.2.6 App Router | installed | Server (route handlers) + client (`'use client'` document components) | Unchanged. The shared module (`lib/estimate/document/`) must be importable from both without triggering `'use client'`/`'use server'` boundary issues — plain TS with no React import needed for `labels.ts`/`format.ts`/`tokens.ts`; `model.ts` needs only type-only exports. |

### Supporting — none new

No pagination libraries, no `fontkit`/`linebreak` (those are Phase 184 scope per `.planning/research/STACK.md` — do not pull them into this phase). No state-management library changes.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plain TS module exports for `lib/estimate/document/` | A class-based "DocumentEngine" abstraction | Rejected — the milestone's own philosophy (mirrored in `lib/estimate/presentation-settings.ts`, `lib/estimate/deposit-display.ts`) is pure functions + typed records, not classes. Matches existing codebase convention exactly (see `resolvePresentationSettings`/`isSectionVisible` precedent). |
| One resolver function (`resolveEstimatePdfElement`) for all 3 PDF call sites | Three separate but "kept in sync by convention" implementations | Rejected explicitly by PITFALLS.md Pitfall 12 — copy-with-intent-to-keep-in-sync is exactly today's failure mode; a shared function is the only design that structurally prevents the 3rd call site from drifting again. |

**Installation:** none required.

**Version verification:** `npm view @react-pdf/renderer version` → `4.5.1` (run 2026-07-27, this session). Installed range `^4.4.0` in `package.json` already permits this — no `package.json` edit is required unless the planner opts into the routine bump. `package-lock.json` currently resolves the exact installed version (not independently re-verified byte-for-byte in this pass beyond the `^4.4.0` constraint line — treat "exact resolved version" as MEDIUM confidence, "constraint present" as HIGH).

## Architecture Patterns

### Recommended Project Structure

```
lib/
├── estimate/
│   ├── document/                    # NEW — Stream A (ENGINE-01..03)
│   │   ├── model.ts                 # DocumentModel type (superset of EstimateDocumentData);
│   │   │                            #   keep EstimateDocumentData as an alias/subset, don't rewrite
│   │   │                            #   estimate-editor.tsx's stateToDocumentData()
│   │   ├── labels.ts                # One canonical label record — union of DOC_LABELS (webview,
│   │   │                            #   full superset incl. edit-only keys) + PDF_LABELS (page/of/
│   │   │                            #   estimateNum/preparedBy) + LANG_INDICATOR
│   │   ├── format.ts                # formatAddress(), formatDate()+DATE_LOCALE — SOURCE OF TRUTH
│   │   │                            #   is estimate-document.tsx's fixed version (L429-441)
│   │   └── tokens.ts                # Record<EstimateTemplateId, DesignTokens> — plain numeric/hex
│   │                                #   values only, NOT Tailwind classes; includes PT_PER_PX/
│   │                                #   PAGE_WIDTH_PT/PAGE_HEIGHT_PT constants (ENGINE-02)
│   └── templates/
│       └── registry.ts              # UNCHANGED — existing template id source of truth
├── pdf/                              # NEW — Stream B (PDFPAR-04)
│   └── render-estimate-pdf.ts       # resolveEstimatePdfElement(estimateId, supabase, opts) →
│                                     #   { buffer, contentKey } — the ONE shared resolver
components/
├── workspace/estimate/estimate-document.tsx      # MODIFIED — imports from lib/estimate/document/
├── share/estimate-document-modern.tsx            # MODIFIED — same
└── pdf/
    ├── estimate-pdf.tsx                          # MODIFIED — same + 'classic' tokens
    └── estimate-pdf-modern.tsx                   # MODIFIED — same + 'modern' tokens
app/api/estimates/[id]/
├── pdf/route.ts                                  # MODIFIED — becomes a thin wrapper around the resolver
└── send/route.ts                                 # MODIFIED — same
lib/whatsapp/pdf-delivery.ts                      # MODIFIED — same
```

### Pattern 1: Data-not-JSX shared layer (the load-bearing architectural decision)

**What:** The shared `lib/estimate/document/` module exports typed data (label records, formatting functions, numeric design tokens) — never JSX or a literally-shared component. Each renderer family keeps its own thin interpreter (`<div>`/Tailwind for DOM, `<View>`/`StyleSheet` for react-pdf) that consumes the shared *values*.

**When to use:** For every symbol currently duplicated across the 4 files (labels, `formatAddress`, `formatDate`, `DATE_LOCALE`, numeric geometry/color/font-size values).

**Why (verified in this codebase, not just general react-pdf advice):** `estimate-pdf.tsx`'s own existing comment (L24) already states "`@react-pdf/renderer` runs server-side with no React context — plain lookups" — the codebase has already discovered this constraint once for labels; this phase generalizes the same discipline to formatting + tokens. Precedent already exists and works today: `SYSTEM_COLORS`, `formatMoney` (`lib/money/currency.ts`), `deriveDepositDisplay` (`lib/estimate/deposit-display.ts`), `resolvePresentationSettings`/`isSectionVisible` (`lib/estimate/presentation-settings.ts`) are ALL already shared across all 4 files today with zero react-pdf/DOM coupling — this phase extends an established, working pattern, not an unproven one.

**Example (the pattern to follow, using an already-shared module as the template):**
```typescript
// lib/estimate/presentation-settings.ts (existing precedent, unchanged this phase)
// Pure functions + typed records, zero React/react-pdf import — mirror this shape
// exactly for lib/estimate/document/{labels,format,tokens}.ts.
export function resolvePresentationSettings(raw: unknown): ResolvedPresentationSettings { ... }
export function isSectionVisible(settings: ResolvedPresentationSettings, section: SectionKey): boolean { ... }
```

### Pattern 2: Superset label record, not a shared subset

**What:** `labels.ts` exports one `Record<EstimateLanguage, DocumentLabels>` containing the UNION of all keys used anywhere across the 4 files (edit-mode extras like `discountNone`/`addItem`/`resetToDefault` from Classic webview's `DOC_LABELS`, plus PDF-only `page`/`of`/`estimateNum`/`preparedBy`, plus `LANG_INDICATOR`). Each consumer destructures only the keys it renders.

**When to use:** Always, for this extraction. Do NOT try to trim the shared record per-consumer — unused keys are zero-cost (tree-shaking aside, this is a small static object) and a single superset avoids 4 divergent partial-label-set types.

**Why:** Confirmed live that `estimate-document-modern.tsx`'s own code comment (L36-37) already says its `DOC_LABELS` is "trimmed to only the keys this view-only document renders" — i.e., the codebase already tried the trimmed-subset approach once, and it's exactly why 4 different label shapes exist today. A superset avoids repeating this.

### Pattern 3: Single geometry/unit-conversion source (ENGINE-02)

**What:** `tokens.ts` (or a dedicated small export within it) defines:
```typescript
export const PT_PER_PX = 72 / 96          // react-pdf pt (72dpi) vs. webview CSS px (96dpi)
export const PX_PER_PT = 96 / 72          // = 1.3333...
export const LETTER_WIDTH_PT = 612
export const LETTER_HEIGHT_PT = 792
export const LETTER_WIDTH_PX = LETTER_WIDTH_PT * PX_PER_PT   // 816 — matches today's hardcoded value
export const LETTER_HEIGHT_PX = LETTER_HEIGHT_PT * PX_PER_PT // 1056 — matches today's hardcoded value
```
**When to use:** `estimate-pdf.tsx`/`estimate-pdf-modern.tsx`'s `<Page size="LETTER">` (already correct, react-pdf resolves this internally) does not need this constant directly — but any NEW numeric value shared between a react-pdf `StyleSheet` value and a webview Tailwind/inline-style value (padding, row heights, font sizes if unified later) MUST go through this conversion, never be a hand-copied literal in both places.

**Verified today's state:** `estimate-document.tsx:1663-1670`'s `pageView` prop hardcodes `min-h-[1056px]`/implied `max-w-[816px]` with NO reference to any shared constant — confirming ENGINE-02's literal requirement ("must reference this module") is not yet satisfied and is a concrete, checkable acceptance criterion (grep for `1056` / `816` as bare literals outside `tokens.ts` after the phase ships — should return zero hits in `estimate-document.tsx`).

### Pattern 4: Shared in-process PDF resolver (PDFPAR-04)

**What:** One function, e.g.:
```typescript
// lib/pdf/render-estimate-pdf.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface RenderEstimatePdfResult {
  buffer: Buffer
  templateId: EstimateTemplateId
  contentKey: string   // for ETag reuse at the download route
}

export async function renderEstimatePdf(
  estimateId: string,
  supabase: SupabaseClient,           // caller-provided: cookie-bound OR service-role
  opts?: { skipPreparedBy?: boolean } // download route resolves preparedBy; verify if send/whatsapp need it too
): Promise<RenderEstimatePdfResult> {
  // 1. getEstimateWithContext(supabase, estimateId)
  // 2. requireServiceClient() for the signature-snapshot lookup — this part is
  //    ALREADY service-role-only in pdf/route.ts today (L60), so this doesn't
  //    change the trust boundary, it just centralizes it.
  // 3. loadLatestSignedSnapshot + applySignedSnapshot (TRUST-01)
  // 4. resolve templateId via PDF_TEMPLATE_COMPONENTS registry + isEstimateTemplateId guard
  // 5. resolve preparedBy (company_members lookup)
  // 6. pre-resolve photo signed URLs via Promise.all BEFORE createElement (Pitfall 9)
  // 7. createElement(PDFComponent, {...}) + renderToBuffer
}
```

**When to use:** All 3 call sites (`pdf/route.ts`, `send/route.ts`, `pdf-delivery.ts`) call this ONE function, differing only in (a) how they obtain their `supabase` client, (b) what they do with the returned buffer (HTTP response vs. Resend attachment vs. Storage upload), and (c) `pdf/route.ts`'s own ETag short-circuit (which can stay a route-level concern layered in front of the resolver, using the returned `contentKey`).

**Why this exact shape:** Mirrors `generateAndUploadEstimatePDF`'s already-proven signature (`estimateId, companyId, supabase: SupabaseClient, clientName`) — `pdf-delivery.ts` already does the "accept an injected client" pattern correctly; this phase generalizes it to cover template/snapshot/preparedBy resolution too, which `pdf-delivery.ts` currently skips.

### Anti-Patterns to Avoid

- **Converging the 3 PDF paths via internal `fetch('/api/estimates/[id]/pdf')`:** Would pass every locally-tested/browser-authenticated flow and fail silently (401) only in the Inngest/webhook production path — exactly the failure class this project has prior history with (`.planning/debug/whatsapp-inbound-no-reply-recurrence.md`, referenced in PITFALLS.md). The `pdf-delivery.ts` header comment (verified present, L5-8) exists specifically to prevent this. The resolver MUST be a plain importable function taking an explicit `SupabaseClient`.
- **Trimming the shared label record per-consumer instead of using one superset:** Reproduces today's 4-divergent-shapes problem one refactor later (see Pattern 2).
- **Literally sharing `StyleSheet`/JSX objects between the DOM and react-pdf renderers:** `<div>`/`<span>` and `<View>`/`<Text>` are not interchangeable (different flex-direction defaults, no DOM in react-pdf). Share only the underlying values (Pattern 1).
- **Importing `@react-pdf/renderer` into `lib/estimate/document/`:** Would get pulled into `estimate-document.tsx`'s `'use client'` bundle. Verify with a build-size check or an import-boundary lint rule (see Don't Hand-Roll) after extraction.
- **Recomputing money/totals values during the refactor:** `lib/estimate/compute-totals.ts` (GUARD-03) stays the only source for every money value; the document engine only ever *reads* persisted totals. No arithmetic belongs in `model.ts`/`labels.ts`/`format.ts`/`tokens.ts`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| "Is this estimate signed, and what's the frozen content?" | A second signature/snapshot lookup inside `send/route.ts` or `pdf-delivery.ts` | `loadLatestSignedSnapshot()` + `applySignedSnapshot()` from `lib/queries/share.ts` / `lib/estimate/signed-snapshot.ts` — already the exact functions `pdf/route.ts` uses today | These are already the single shared query used by both the public share page AND the download PDF route (confirmed by the module's own doc comment, `share.ts:30-34`) — a second implementation is precisely Pitfall 12 (silent 3-way drift). |
| "Which template component for this estimate?" | An if/else on `company.estimate_template_style` in each of the 3 PDF call sites | `PDF_TEMPLATE_COMPONENTS: Record<EstimateTemplateId, typeof EstimatePDF>` + `isEstimateTemplateId()` guard from `lib/estimate/templates/registry.ts`, already correctly used in `pdf/route.ts:22-25,84-86,138` | This registry is explicitly documented as "the meio de campo" (`registry.ts:6-9`) precisely so a 3rd template is one map entry, not N if/else blocks scattered across call sites. |
| "Is this section visible / what's the tax/discount/deposit override?" | New per-file gating logic | `resolvePresentationSettings()` / `isSectionVisible()` from `lib/estimate/presentation-settings.ts` | Already the single shared gate all 4 current files call — do not duplicate or extend without touching this one module. |
| "What's the deposit/balance-due display value?" | Recomputing from `deposit_value`/`deposit_type` | `deriveDepositDisplay()` from `lib/estimate/deposit-display.ts` | GUARD-03 — always reads the persisted server-computed `balance_due`, never recomputes; already shared across all 4 files and both PDF totals tests assert this explicitly (see `estimate-pdf-totals.test.tsx`'s "reads persisted balance_due, never recomputes" test). |

**Key insight:** This phase's entire job is extending an ALREADY-PROVEN sharing pattern (5 modules already shared successfully: `SYSTEM_COLORS`, `formatMoney`, `deriveDepositDisplay`, `resolvePresentationSettings`/`isSectionVisible`, and the template registry) to 4 more symbol groups (labels, `formatAddress`, `formatDate`, design tokens) plus 1 new resolver function. Nothing in this phase requires inventing a new sharing mechanism — every decision should mirror one of these 5 existing modules' shape.

## Common Pitfalls

(Cross-referenced against `.planning/research/PITFALLS.md`'s milestone-wide 14 pitfalls; only the ones with direct bearing on Phase 182's actual scope — extraction + send-path convergence, no pagination/signature/font work — are restated here with phase-182-specific verification.)

### Pitfall 1: The two PDF label/format blocks LOOK identical but are declared twice — a lazy "just import one from the other" creates an accidental cross-template coupling

**What goes wrong:** Since `estimate-pdf.tsx` and `estimate-pdf-modern.tsx`'s `PDF_LABELS`/`formatAddress`/`formatDate`/`DATE_LOCALE`/`LANG_INDICATOR` blocks are byte-identical, a fast path is "just import Classic's copy into Modern." This works today but creates an implicit, undocumented coupling — if the shared module doesn't exist yet, a future edit to "PDF_LABELS in estimate-pdf.tsx" silently also changes Modern with no signal that happened.
**Why it happens:** The two files look like independent siblings; the byte-identical content isn't obvious without a diff.
**How to avoid:** Extract to `lib/estimate/document/labels.ts` and `format.ts` as the canonical source BEFORE touching either PDF file's imports — never point one PDF file's import at the other PDF file.
**Warning signs:** A diff where `estimate-pdf-modern.tsx` gains `import { PDF_LABELS } from '../pdf/estimate-pdf'` instead of from the new shared module.

### Pitfall 2: The local-midnight date fix must propagate to 3 files, and the fix itself has a determinism dependency worth testing

**What goes wrong:** `format.ts`'s `formatDate()` becomes the Classic webview's version (with the `T00:00:00` regex normalization). If the extraction is done by literally copying `estimate-pdf.tsx`'s existing (buggy) `formatDate` into the shared module by mistake (e.g., because the PDF files were touched first), the bug ships forward into the shared module instead of being fixed.
**Why it happens:** 3 of 4 files' current `formatDate` are byte-similar to each other (missing the fix) and only 1 of 4 has it — a "just extract what's already there" instinct picks the majority shape.
**How to avoid:** The CONTEXT.md decision is explicit and testable: "Only ONE of the four current copies has the local-midnight date fix — the shared helper must be the fixed version." Add or extend a unit test asserting `formatDate('2026-07-08', 'en')` returns "July 8, 2026" (not "July 7") regardless of the test runner's TZ — this is a determinism/CI-flakiness regression the Classic webview's own comment says it already fixed once (mentions "made the doc snapshot non-deterministic in CI").
**Warning signs:** A snapshot/golden test for date formatting that passes locally but is TZ-sensitive in CI.

### Pitfall 3: `send/route.ts`'s optional `preparedBy`/`attachedPhotos` props mean the resolver swap can silently under-deliver, not error

**What goes wrong:** `EstimatePDFProps.preparedBy` and `.attachedPhotos` are both optional (`?`) on the props interface — so before this phase, `send/route.ts` omitting them compiles fine and produces a PDF that's silently missing "Prepared by" and photos, with no runtime error to signal the gap. After the resolver swap, if the new resolver ISN'T actually wired to resolve+pass these fields (e.g., an incomplete extraction that only fixes template+snapshot but forgets preparedBy/photos), the same silent-omission failure mode persists undetected.
**Why it happens:** TypeScript's optional-prop compile success masks an incomplete resolver.
**How to avoid:** Make the acceptance test explicit: render through the shared resolver for a fixture estimate with a non-null `preparedBy` company member AND at least one attached photo, and assert both appear in ALL 3 call sites' output (not just the download route, which already worked).
**Warning signs:** A PR that fixes template+snapshot in `send/route.ts`/`pdf-delivery.ts` but the resolver's props list is shorter than `pdf/route.ts`'s original `createElement(...)` call (compare field-by-field against the verified L141-150 call in this research).

### Pitfall 4: The two signed-URL TTLs (1h route, 24h whatsapp-delivery) are for DIFFERENT things — don't conflate standardizing them

**What goes wrong:** PITFALLS.md flags "standardize the TTL" as an integration gotcha. But verified in this pass: `pdf/route.ts`'s 1h TTL is for PER-PHOTO signed URLs embedded inside the rendered PDF; `pdf-delivery.ts`'s 24h TTL is for the SIGNED URL OF THE UPLOADED PDF DOCUMENT ITSELF (a different Storage bucket — `pdfs` vs `photos`). If the resolver unifies these into one constant without noticing they're for different assets with different consumption patterns (a photo URL is consumed once during render vs. a document URL that must survive Meta's WhatsApp delivery queue), a naive "pick 3600s everywhere" could break WhatsApp document delivery for slow-queued sends.
**Why it happens:** Both are called "TTL" in the surrounding comments/pitfalls docs, inviting a single-number fix.
**How to avoid:** Keep them as two separate, deliberately-chosen values in the resolver's design: a short TTL for photo URLs embedded in the render (consumed synchronously, 1h is generous already) and a longer TTL for the final delivered artifact URL when one is produced (WhatsApp's case) — document the reasoning inline rather than defaulting to one shared constant.
**Warning signs:** A single `SIGNED_URL_TTL_SECONDS` constant used for both photo-in-PDF resolution and post-render document delivery URLs.

### Pitfall 5: react-pdf in client bundle / DOM assumptions in server path (verified applicable, no lint guard exists yet)

**What goes wrong:** (Restated from PITFALLS.md Pitfall 11, re-verified in this pass.) `estimate-document.tsx` is `'use client'` (confirmed L1). If `lib/estimate/document/model.ts`/`labels.ts`/`format.ts`/`tokens.ts` accidentally imports anything from `@react-pdf/renderer` (even transitively, e.g. by importing a type from `estimate-pdf.tsx` instead of declaring it fresh in `model.ts`), it gets pulled into the client bundle.
**Why it happens:** Easiest path for `model.ts`'s `DocumentModel` type is "import and re-export `EstimatePDFProps` from `estimate-pdf.tsx`" — which would create exactly this coupling.
**How to avoid:** `model.ts` declares its own `DocumentModel`/`DocumentCompany`/etc. types independently (a superset, as ARCHITECTURE.md recommends) — never type-imports FROM either PDF file. Verified: no ESLint `no-restricted-imports` rule exists today (checked `eslint.config.mjs` in this pass — zero hits for "react-pdf"), so this phase should either add one (`no-restricted-imports` banning `@react-pdf/renderer` from files without `.pdf.` in path, or from any file with `'use client'`) or explicitly call this out as a manual code-review checklist item in the plan.
**Warning signs:** `lib/estimate/document/*.ts` importing from `components/pdf/*` or vice versa; a client-bundle size regression after the extraction (worth a before/after `next build` bundle-size sanity check).

## Code Examples

Verified patterns from the actual codebase (all cited line numbers were read directly in this research session):

### Existing correct pattern to mirror for `renderEstimatePdf` (from `app/api/estimates/[id]/pdf/route.ts`)
```typescript
// Source: app/api/estimates/[id]/pdf/route.ts:56-151 (verified live, this session)
const signatureServiceClient = requireServiceClient()
const signedSnapshotRow = await loadLatestSignedSnapshot(signatureServiceClient, liveEstimate.id)
const signedContent = signedSnapshotRow?.signed_content ?? null
const estimate = applySignedSnapshot(liveEstimate, signedContent)

const rawTemplateId = (company as { estimate_template_style?: string }).estimate_template_style
const templateId: EstimateTemplateId = isEstimateTemplateId(rawTemplateId)
  ? rawTemplateId
  : DEFAULT_ESTIMATE_TEMPLATE_ID

// preparedBy resolution
let preparedBy: string | null = company.owner_name ?? null
if (estimate.created_by_user_id) {
  const svc = requireServiceClient()
  const { data: member } = await svc
    .from('company_members')
    .select('display_name')
    .eq('user_id', estimate.created_by_user_id)
    .eq('company_id', estimate.company_id)
    .single()
  if (member?.display_name) preparedBy = member.display_name
}

// pre-resolve photo signed URLs BEFORE constructing the element tree
const storage = createStorage(supabase)
const attachedPhotos = await Promise.all(
  (estimate.attachedPhotos ?? []).map(async (photo) => ({
    url: await storage.getSignedUrl('photos', photo.storage_path, 3600),
    caption: photo.caption,
  }))
)

const PDFComponent = PDF_TEMPLATE_COMPONENTS[templateId]
const element = createElement(PDFComponent, { estimate, company, client, projectName, projectType, language: estimateLanguage, preparedBy, attachedPhotos })
const pdfBuffer = await renderToBuffer(element as any)
```
This entire block (minus the ETag-specific lines) is what `render-estimate-pdf.ts`'s resolver body should become — extracted once, called 3 times.

### Confirmed defect pattern to eliminate (from `app/api/estimates/[id]/send/route.ts`)
```typescript
// Source: app/api/estimates/[id]/send/route.ts:188-200 (verified live, this session)
// PROBLEM: `estimate` here is the raw live row (L91), never passed through
// loadLatestSignedSnapshot/applySignedSnapshot. Only EstimatePDF (Classic) is
// imported (L7) -- no registry lookup. No preparedBy, no attachedPhotos passed.
if (attachPdf) {
  const estimateLanguage = isSupportedLanguage(estimate.language) ? estimate.language : 'en'
  const element = createElement(EstimatePDF, { estimate, company, client, projectName, projectType, language: estimateLanguage })
  const pdfBuffer = await renderToBuffer(element as any)
  ...
}
```

### Confirmed defect pattern to eliminate (from `lib/whatsapp/pdf-delivery.ts`)
```typescript
// Source: lib/whatsapp/pdf-delivery.ts:36-56 (verified live, this session)
// PROBLEM: same as above -- getEstimateWithContext directly, no snapshot load,
// EstimatePDF hardcoded, no preparedBy/attachedPhotos. This function ALREADY
// accepts an injected `supabase: SupabaseClient` (line 32) -- the resolver's
// signature should mirror this exact shape.
export async function generateAndUploadEstimatePDF(
  estimateId: string,
  companyId: string,
  supabase: SupabaseClient,
  clientName: string | null,
): Promise<{ signedUrl: string; filename: string }> {
  const result = await getEstimateWithContext(supabase, estimateId)
  const { estimate, project, company } = result
  const element = createElement(EstimatePDF, { estimate, company, client, projectName, projectType: project?.project_type ?? null, language: estimateLanguage })
  const pdfBuffer = await renderToBuffer(element as any)
  // ... upload to storage, sign URL (86400s), return
}
```

### Existing precedent for the shared-pure-module shape to copy (from `lib/estimate/presentation-settings.ts`)
```typescript
// Source: lib/estimate/presentation-settings.ts:89-108 (verified live, this session)
// Zero React/react-pdf import, plain typed record + pure function -- this is
// the exact shape lib/estimate/document/{labels,format,tokens}.ts should take.
export function resolvePresentationSettings(raw: unknown): ResolvedPresentationSettings {
  const value = isPlainObject(raw) ? (raw as PresentationSettings) : {}
  return {
    sections: { ...DEFAULT_SECTION_VISIBILITY, ...(isPlainObject(value.sections) ? value.sections : {}) },
    tax: isValidTaxOverride(value.tax) ? { ...DEFAULT_TAX_OVERRIDE, ...value.tax } : DEFAULT_TAX_OVERRIDE,
    discount: isPlainObject(value.discount) ? { ...DEFAULT_DISCOUNT_OVERRIDE, ...value.discount } : DEFAULT_DISCOUNT_OVERRIDE,
    deposit: isPlainObject(value.deposit) ? { ...DEFAULT_DEPOSIT_OVERRIDE, ...value.deposit } : DEFAULT_DEPOSIT_OVERRIDE,
  }
}
export function isSectionVisible(settings: ResolvedPresentationSettings, section: SectionKey): boolean {
  return settings.sections[section] !== false
}
```

### Existing test pattern for structural PDF regression (from `tests/unit/pdf/estimate-pdf-totals.test.tsx`)
```typescript
// Source: tests/unit/pdf/estimate-pdf-totals.test.tsx:22-51 (verified live, this session)
// Rendering @react-pdf/renderer to a real PDF is impractical headlessly --
// call the function component directly and walk the returned React element
// tree collecting <Text> content IN DOCUMENT ORDER. This is the established,
// working pattern for "prove nothing regressed" without a real PDF render.
function collectTextNodes(node: unknown, out: string[]): void {
  if (node == null || node === false || node === true) return
  if (typeof node === 'string' || typeof node === 'number') return
  if (Array.isArray(node)) { for (const child of node) collectTextNodes(child, out); return }
  if (isValidElement(node)) {
    const el = node as { type: unknown; props: { children?: unknown } }
    if (el.type === Text) { out.push(flattenText(el.props.children)); return }
    collectTextNodes(el.props?.children, out)
  }
}
```
This is the pattern to reuse for a new "label parity" test — call `EstimatePDF(...)`, `EstimatePDFModern(...)`, and (via a similar approach or React Testing Library, since it's `'use client'`) render the two webview components, and assert the collected label/formatted-value strings are byte-identical to a golden baseline captured BEFORE the extraction.

## Open Questions

1. **Should `render-estimate-pdf.ts`'s `preparedBy` resolution be identical across all 3 call sites, or route/channel-specific?**
   - What we know: `pdf/route.ts` resolves it via a `company_members` lookup keyed to `created_by_user_id`; `send/route.ts` and `pdf-delivery.ts` today pass nothing (both silently omit the field).
   - What's unclear: whether email/WhatsApp sends should show the same "Prepared by" as the download, or whether there's a product reason it was omitted (e.g., privacy — not wanting a staff member's name in a client-facing WhatsApp doc). CONTEXT.md's locked decisions say "Email and WhatsApp PDFs must now honor: ... preparedBy" — so this reads as settled (all 3 should match), but the planner should confirm no product-side objection exists before wiring it identically everywhere.
   - Recommendation: default to identical behavior across all 3 (per CONTEXT.md's explicit instruction), flag as a 1-line confirmation in the plan rather than a blocking question.

2. **Does the shared resolver own the ETag/caching decision, or does `pdf/route.ts` keep ETag as a route-level wrapper?**
   - What we know: `pdf/route.ts`'s ETag logic (L88-98) is keyed off `contentKey` (derived from either the signed-snapshot id+timestamp or `estimate.id`+`updated_at`) plus `templateId` and `estimateLanguage` — and explicitly must NOT extend to the send/WhatsApp paths (different render, per the route's own comment: "a DIFFERENT render than the send route's attachment").
   - What's unclear: whether `contentKey` computation belongs inside the resolver (returned as part of `RenderEstimatePdfResult`, as suggested in Pattern 4) or stays entirely route-local.
   - Recommendation: have the resolver return `contentKey` as part of its result (cheap, pure computation) so `pdf/route.ts` can keep building its ETag from it, but the resolver itself does NOT implement the 304-short-circuit — that stays route-specific, since `send/route.ts` and `pdf-delivery.ts` have no equivalent caching need today.

3. **Send-hub `attachPdf: false` hardcode — in scope for this phase's send-path plan, or deferred?**
   - What we know: CONTEXT.md's Deferred Ideas section explicitly says "if the planner can include flipping it safely once the shared resolver exists, do it in this phase's send-path plan; otherwise defer to 183 with a note." Verified live: `send-hub-dialog.tsx:229` is the only production caller of the send route today, and it unconditionally sends `attachPdf: false`.
   - What's unclear: whether flipping this to `true` (or to a user-facing toggle) is "safe" without a UX decision (does the user expect a PDF attached by default on every email send now?) — this is a product/UX question, not a technical one, once the resolver exists.
   - Recommendation: land the resolver + fix `send/route.ts`'s internal correctness (template+snapshot+preparedBy+photos, all gated behind the EXISTING `attachPdf` boolean) in this phase — that's pure backend correctness, zero UX risk. Leave the `send-hub-dialog.tsx:229` UI flip as a separate, explicitly-labeled optional task the planner can include IF a one-line change with no new UI is judged safe, otherwise note it for Phase 183 as CONTEXT.md allows.

## Validation Architecture

Nyquist validation is enabled (`.planning/config.json`: `workflow.nyquist_validation: true`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.4` |
| Config file | `vitest.config.ts` (repo root; not separately re-verified in this pass — standard project-wide config) |
| Quick run command | `npx vitest run tests/unit/pdf tests/unit/estimate/document-page-view.test.tsx tests/unit/estimate/document-totals-view.test.tsx tests/unit/estimate/document-bill-to.test.tsx tests/unit/estimate/document-alignment.test.tsx tests/unit/estimate/presentation-settings-cross-surface.test.tsx tests/unit/estimate/inline-project-name.test.tsx tests/unit/whatsapp/pdf-delivery.test.ts tests/unit/estimate/delivery-insert-format.test.ts` |
| Full suite command | `npm test` (= `vitest run`, per `package.json` L12) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ENGINE-01 | All 4 renderers produce byte-identical rendered label/date/address text before vs. after extraction | unit (structural, element-tree walk) | `npx vitest run tests/unit/pdf/estimate-pdf-totals.test.tsx tests/unit/pdf/estimate-pdf-modern-totals.test.tsx -t "totals"` (existing) + NEW `tests/unit/estimate/document-label-parity.test.ts` asserting `formatDate`/`formatAddress`/label-record identity pre/post-refactor | ✅ existing totals tests / ❌ NEW label-parity test needed — Wave 0 |
| ENGINE-01 (local-midnight fix) | `formatDate()` normalizes date-only strings to local midnight regardless of test-runner TZ | unit | `npx vitest run tests/unit/estimate/document-format.test.ts` (new, isolated test of the extracted `format.ts`) | ❌ Wave 0 — no dedicated `format.ts` unit test exists yet (the fix is currently only implicitly covered inside the 4 files' own rendering tests) |
| ENGINE-02 | No bare `1056`/`816`/`612`/`792` numeric literal remains in `estimate-document.tsx` outside a shared-token import | unit (static grep, mirrors `delivery-insert-format.test.ts`'s pattern) | `npx vitest run tests/unit/estimate/pt-px-conversion-source.test.ts` (new — grep-based like the existing `delivery-insert-format.test.ts` precedent) | ❌ Wave 0 — new static-grep test, cheap to add following the exact pattern already in `tests/unit/estimate/delivery-insert-format.test.ts` |
| ENGINE-03 | Classic and modern PDFs still render their template-specific styling (fill vs. hairline headers, Helvetica vs. Times-Roman) unchanged after tokens.ts extraction | unit (existing, re-run as regression gate) | `npx vitest run tests/unit/pdf` | ✅ existing (`estimate-pdf-totals.test.tsx`, `estimate-pdf-modern-totals.test.tsx`) |
| PDFPAR-04 | All 3 PDF call sites resolve template + honor signed snapshot + preparedBy + photos identically for the same signed estimate | integration (new — this is the phase's actual acceptance bar per PITFALLS.md Pitfall 12) | `npx vitest run tests/unit/pdf/render-estimate-pdf-resolver.test.ts` (new — mocks Supabase, asserts all 3 call sites invoke the shared resolver with equivalent args, and that a signed estimate's `send`/`pdf-delivery` output reflects `applySignedSnapshot`'s frozen content, not live rows) | ❌ Wave 0 — this is the single most important new test in the phase; no equivalent exists today (existing `tests/unit/whatsapp/pdf-delivery.test.ts` mocks `renderToBuffer` entirely and never asserts snapshot/template-registry behavior) |
| PDFPAR-04 (regression) | `send/route.ts`'s existing behavior (auth, rate-limit, consent-gate, email dispatch, `estimate_deliveries` insert with `format:` key) stays green | unit (existing) | `npx vitest run tests/unit/estimate/delivery-insert-format.test.ts tests/integration/missing-key-ux.test.ts` | ✅ existing |
| PDFPAR-04 (regression) | `generateAndUploadEstimatePDF`'s upload/signed-URL/filename behavior stays green after the resolver swap | unit (existing) | `npx vitest run tests/unit/whatsapp/pdf-delivery.test.ts` | ✅ existing — but note this file mocks `EstimatePDF`/`renderToBuffer` entirely (L4-19), so it does NOT currently exercise template-selection or snapshot logic; it will need new assertions added (not just left passing) once the resolver is wired in, since a resolver swap that silently drops the registry/snapshot call would leave this file green while PDFPAR-04 remains unmet. |

### Sampling Rate
- **Per task commit:** the scoped quick-run command above (Stream A tasks run the document/PDF-parity subset; Stream B tasks run the send-path subset) — both complete in well under 30 seconds locally.
- **Per wave merge:** `npm test` (full suite) — this phase touches 7+ files with 9 existing direct-importing test files (see below) plus whatever new tests Wave 0 adds; a full-suite run is cheap enough (existing project convention, confirmed via `package.json` script) to run at every wave boundary.
- **Phase gate:** Full suite green (`npm test`) before `/gsd:verify-work`, plus `npx tsc -p tsconfig.ci.json` (the CI-gating scoped typecheck covering `app/`, `lib/`, `components/`, `hooks/` — confirmed via `tsconfig.ci.json` read in this pass; excludes `tests/**`, so also run a bare `npx tsc --noEmit` per this repo's own documented convention in the config file's comments, since test-type drift is otherwise invisible to CI).

### Wave 0 Gaps
- [ ] `tests/unit/estimate/document-label-parity.test.ts` — golden-snapshot-style test capturing the CURRENT rendered label/date/address output of all 4 renderers (via the existing `collectTextNodes`-style tree-walk for the 2 PDF components, and React Testing Library `render()` + `screen.getByText`/snapshot for the 2 webview components) BEFORE any extraction, so the phase's "zero visible change" success criterion (#5 in the phase description) has a concrete automated gate, not just manual eyeballing. This is the single highest-value new test for this phase — write it FIRST, before Stream A's extraction tasks begin.
- [ ] `tests/unit/estimate/document-format.test.ts` — isolated unit test of the extracted `lib/estimate/document/format.ts`'s `formatDate`/`formatAddress`, explicitly asserting the local-midnight fix (`formatDate('2026-07-08', 'en')` → `"July 8, 2026"` regardless of `TZ` env var) and address-line-wrapping edge cases (missing city/state/zip combinations).
- [ ] `tests/unit/pdf/render-estimate-pdf-resolver.test.ts` — the PDFPAR-04 acceptance test: mock Supabase (service-role + user-session variants), assert `renderEstimatePdf()` is called identically from all 3 call sites' code paths, and that a fixture estimate WITH a signature snapshot renders the FROZEN `signed_content` (not live rows) through all 3 paths — this is the concrete implementation of PITFALLS.md Pitfall 12's recommended "shared regression test that asserts all 3 call sites produce byte-identical PDF bytes for the same signed estimate."
- [ ] `tests/unit/estimate/pt-px-conversion-source.test.ts` — static-grep test (mirroring `tests/unit/estimate/delivery-insert-format.test.ts`'s established pattern) asserting no bare `1056`/`816` px-Letter-approximation literal exists outside `lib/estimate/document/tokens.ts`.
- [ ] Update (not new) `tests/unit/whatsapp/pdf-delivery.test.ts` — its current mocks (`vi.mock('@react-pdf/renderer', ...)`, `vi.mock('@/components/pdf/estimate-pdf', ...)`) will need to also assert the resolver now performs template lookup + snapshot resolution, since today's mocks make those steps invisible to the test even after the refactor lands.
- [ ] Framework install: none — Vitest, React Testing Library (implied by existing `.test.tsx` component tests), and the project's existing test conventions are already fully set up; no new test framework or config needed.

## Sources

### Primary (HIGH confidence — direct file reads in this research session)
- `components/pdf/estimate-pdf.tsx` (full file, 861 lines) — PDF_LABELS/formatAddress/formatDate/DATE_LOCALE/LANG_INDICATOR, StyleSheet, send-path-relevant props
- `components/pdf/estimate-pdf-modern.tsx` (full file, 862 lines) — independently diffed against Classic PDF, confirmed byte-identical label/format blocks
- `components/workspace/estimate/estimate-document.tsx` (lines 1-450) — DOC_LABELS, formatAddress, formatDate (WITH the local-midnight fix), EstimateDocumentData/DocumentCompany/etc. type exports
- `components/share/estimate-document-modern.tsx` (full file, 579 lines) — DOC_LABELS (trimmed subset), formatAddress/formatDate (WITHOUT the fix), type-only import pattern from estimate-document.tsx
- `app/api/estimates/[id]/pdf/route.ts` (full file, 177 lines) — the correct pattern: registry, snapshot, preparedBy, photo pre-resolution, ETag
- `app/api/estimates/[id]/send/route.ts` (full file, 277 lines) — confirmed hardcoded EstimatePDF + live-rows defect
- `lib/whatsapp/pdf-delivery.ts` (full file, 100 lines) — confirmed hardcoded EstimatePDF + no-snapshot defect + the load-bearing "never fetch the HTTP route" comment
- `lib/estimate/templates/registry.ts` (full file, 44 lines) — template id registry
- `lib/estimate/presentation-settings.ts` (full file, 129 lines) — the shared-pure-module precedent to mirror
- `lib/queries/share.ts` (lines 1-70) — `loadLatestSignedSnapshot`'s type signature and doc comment
- `lib/supabase/service.ts` (full file, 34 lines) — confirms `requireServiceClient()`'s return type is a plain `@supabase/supabase-js` `SupabaseClient`
- `lib/whatsapp/send-estimate.ts`, `lib/whatsapp/confirm-actions.ts` (grep for client-passing pattern) — confirm both accept `SupabaseClient` as a parameter, never create their own
- `lib/inngest/functions/whatsapp-process.ts` (grep for `requireServiceClient`) — confirms the Inngest/webhook execution context genuinely uses only a service-role client
- `components/workspace/send/send-hub-dialog.tsx` (lines 190-244) — confirms the only production caller of `send/route.ts` always sends `attachPdf: false`
- `tests/unit/pdf/estimate-pdf-totals.test.tsx` (full file, 179 lines) — the existing element-tree-walk test pattern to reuse for label-parity testing
- `tests/unit/whatsapp/pdf-delivery.test.ts` (full file, 149 lines) — confirms current mocks make template/snapshot logic invisible to the test
- `tests/unit/estimate/delivery-insert-format.test.ts` (full file, 47 lines) — the existing static-grep test pattern to reuse for the pt/px-literal regression test
- `tests/unit/estimate/signature-snapshot.test.ts` (lines 1-60) — TRUST-01 serializer test precedent (adjacent, not directly reused this phase)
- `.planning/config.json` — confirms `workflow.nyquist_validation: true`
- `tsconfig.ci.json` (full file) — confirms the CI-gating scoped typecheck's include/exclude boundaries
- `package.json` (grep) — confirms `@react-pdf/renderer: ^4.4.0`, `vitest: ^4.1.4`, `test`/`test:watch` scripts
- `package-lock.json` (grep) — confirms `^4.4.0` constraint present
- `eslint.config.mjs` (grep, no matches) — confirms no existing `no-restricted-imports`/react-pdf boundary rule
- `npm view @react-pdf/renderer version` (run live in this session) — `4.5.1` current published latest

### Secondary (MEDIUM confidence — milestone-level research, cross-checked against live code in this pass)
- `.planning/research/ARCHITECTURE.md` — Q1/Q3/Q6 sections (shared module design, file modification list, build order) — cross-verified against live files; all cited line numbers and claims held up under independent re-verification in this session.
- `.planning/research/PITFALLS.md` — Pitfalls 1-2, 8-14 (unit conversion, render-blocking, image-fetch failure, font/hyphenation determinism [N/A this phase], 3-path convergence, HTTP-fetch anti-pattern, GUARD-03 math regression, client/server boundary) — cross-verified against live code; Pitfalls 3-7, 10 relate to pagination/signature work explicitly out of scope for Phase 182 (deferred to 183/184 per CONTEXT.md) and are not restated here.
- `.planning/research/STACK.md` — confirms `@react-pdf/renderer` version state and that `fontkit`/`linebreak`/font-registration work belongs to Phase 184, not this phase.
- `.planning/phases/182-shared-document-engine-send-path-fix/182-CONTEXT.md` — owner-locked decisions, verbatim source for `<user_constraints>` section above.
- `.planning/REQUIREMENTS.md` — ENGINE-01..03, PDFPAR-04 definitions and traceability table confirming Phase 182 scope boundary.

### Tertiary (LOW confidence)
- None — every substantive claim in this document was either read directly from the live repository in this session or is a verbatim copy of owner-locked CONTEXT.md decisions.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; existing `@react-pdf/renderer` version independently re-verified via `npm view` in this session.
- Architecture (shared module + resolver design): HIGH — every duplicated symbol and every send-path defect was independently re-read and re-diffed in this session, not taken on trust from milestone research; the 5 already-shared modules (SYSTEM_COLORS, formatMoney, deriveDepositDisplay, presentation-settings, template registry) provide a proven, in-repo precedent for the exact pattern this phase needs.
- Pitfalls: HIGH for the 6 restated here (all re-verified against live code); the milestone-wide PITFALLS.md's other 8 pitfalls are explicitly out of this phase's scope (pagination/signature/font work) and were deliberately excluded rather than restated to avoid diluting the phase-specific gate.
- Validation architecture: MEDIUM-HIGH — test framework/commands verified from `package.json`/existing test files; the 4 new Wave-0 test files are recommendations grounded in existing in-repo test patterns (element-tree walk, static grep) rather than a framework the project hasn't used before.

**Research date:** 2026-07-27
**Valid until:** ~2026-08-26 (30 days — this is a stable, internal-refactor domain with no external API/library churn risk; re-verify only if `package.json`'s `@react-pdf/renderer` range changes or if Phase 183/184 land first and alter these same files before 182 executes).
