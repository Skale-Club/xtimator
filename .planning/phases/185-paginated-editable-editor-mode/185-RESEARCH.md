# Phase 185: Paginated Editable Editor Mode - Research

**Researched:** 2026-07-28
**Domain:** Client-side deterministic pagination for a live-editable document (dnd-kit + fontkit-in-browser), toggle-state bridging via existing React Context, legacy-feature consolidation
**Confidence:** HIGH — every claim is grounded in direct reads of the actual repository (paths + line numbers cited throughout) plus hands-on verification (ran fontkit's browser build against the real vendored TTF in this session). The one MEDIUM-confidence area is Next.js/webpack's automatic resolution of fontkit's `browser` export condition in this exact app (verified as standard behavior, not yet verified against THIS app's build output).

## Project Constraints (from CLAUDE.md)

- Tech stack is locked: Next.js 14+ App Router, TypeScript strict, Tailwind, shadcn/ui, react-hook-form+zod (not used by this phase — editor uses a custom reducer). This phase adds no new stack element that conflicts.
- Service role key / secrets never touch the browser — not implicated by this phase (no new secrets).
- GSD workflow enforcement — this phase must be planned/executed through `/gsd:plan-phase` → `/gsd:execute-phase`, not ad-hoc edits.
- Work commits directly to `main` per user memory (`feedback_work_on_main`) — not this agent's concern (research only).
- No secrets in runbooks/docs — not implicated.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Toggle UI (PGMODE-01)**
- Two icon buttons immediately LEFT of "Edit with AI" in `components/workspace/project-header.tsx`. Button 1: full-width (current default). Button 2: paginated (PDF-preview look).
- State bridges via the existing `VersionSlot` context (`components/workspace/estimate-version-context.tsx`) — NOT zustand, NOT URL params. Session-only (persistence deferred, DEFER-04).
- Icon choice: conventional, distinct from the retiring toggle's icons; aria-labels + tooltips. Owner reference image PENDING — build to standard PDF-preview conventions now, keep visual layer trivially adjustable.

**Paginated rendering (PGMODE-02)**
- Letter-size page boxes (816×1056px / 612×792pt), centered on neutral canvas, page gaps, shadow/border, "Page N of M" chrome.
- Page breaks come from the Phase 184 engine — CONTEXT.md's own text says "with the DOM measurement provider (measure real rendered block heights; the engine decides assignments)". **This research supersedes that specific mechanism** (see Architectural Decision below) while preserving the outcome CONTEXT.md actually wants: "Same rules as PDF → mirror behavior."
- Both templates (classic + modern) work in paginated mode.

**Editing inside pages (PGMODE-03)**
- ALL existing editing keeps working: inline edits, add/remove items/sections, drag-reorder (dnd-kit), presentation-settings gear, photos, refine — paginated view renders the SAME editable components, sliced into page boxes; no forked read-only copy.
- Page membership is a DERIVED read-only projection — never persisted, never a third dnd-kit axis. Reorder semantics operate on document order exactly as today.
- Repagination: immediate on structural changes; debounced (~300-500ms) while typing; focus must survive repagination (key by stable ids, never index-of-page).
- Performance guard: add minimal memoization so repagination doesn't thrash (measure, don't blanket-memo).

**Consolidation (PGMODE-04)**
- Legacy `viewMode: 'width' | 'page'` CSS-zoom toggle (`estimate-editor.tsx` state + `estimate-floating-actions.tsx` buttons) is RETIRED/absorbed into the new header toggle. Remove old buttons from the floating pill; keep zoom-to-fit behavior if trivial, else drop.

**Share webview untouched (PGMODE-05)**
- Public share webview stays single-page scroll — zero changes to `app/estimate/[token]` surfaces this phase.

### Claude's Discretion
- Virtualization: only if measured necessary.
- Exact debounce timing (300-500ms range; pick and document — this research recommends 400ms, matching 185-UI-SPEC.md's own choice).
- How table header repetition renders in DOM pages (mirror the PDF's repeated header).

### Deferred Ideas (OUT OF SCOPE)
- Toggle state persistence per user/estimate → DEFER-04 (v2).
- Print-from-browser in paginated mode → future.
- Webview aesthetics → Phase 186.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PGMODE-01 | Header shows two icon toggle buttons left of "Edit with AI", switching view instantly | `project-header.tsx`/`estimate-version-context.tsx` exact mount point + `VersionSlot` extension confirmed by direct read; 185-UI-SPEC.md's `ViewModeToggle` component contract adopted as-is |
| PGMODE-02 | Paginated mode renders letter-size pages mirroring the PDF's page breaks | Architectural Decision section: client-side fontkit estimator reusing `blocksFromModel()`+`computePageBreaks()` verbatim, PLUS the constraints-parity finding (must reuse identical `PageConstraints`, not derive a new margin) |
| PGMODE-03 | All editing works inside paginated mode; derived projection; immediate/debounced repagination; no focus loss | ARCHITECTURE.md Q5 spacer/overlay strategy validated against current `estimate-document.tsx` (1805 lines, confirmed zero `useMemo`/`useCallback`, two dnd-kit context tiers, no `DragOverlay` in use today); repagination hook points identified in `use-estimate-reducer.ts`/`estimate-editor.tsx` |
| PGMODE-04 | Legacy `viewMode`/CSS-zoom toggle retired, consolidated | Exact removal targets identified with line numbers in `estimate-editor.tsx` and `estimate-floating-actions.tsx`; 2 test files identified needing update/removal |
| PGMODE-05 | Share webview untouched, byte-compatible | Confirmed `components/share/estimate-view.tsx` has no import path into `estimate-document.tsx`/pagination modules today; new boundary test recommended to guard this going forward |
| PGBRK-01/04 (web-preview clause, Partial from Phase 184) | Web paginated preview consumes the SAME pagination module as the PDF, same content per page | This is the crux of the Architectural Decision — the whole section is written to close this specific gap with evidence, not assumption |

</phase_requirements>

## Summary

Phase 184 shipped a deterministic pagination engine (`blocksFromModel()` → `computePageBreaks()`) driven by a **fontkit + linebreak** text-measurement provider, empirically validated against a **real Chromium browser** in a drift spike (`184-DRIFT-REPORT.md`) that found **zero measurement drift** in 4 of 5 realistic samples and a bounded 1-line drift in a synthetic edge case. That spike is the load-bearing evidence for this phase: it proves fontkit's line-count predictions already ARE a faithful proxy for real DOM text wrapping, when fed the same font file. Separately, `fontkit` ships an official browser-safe build (`package.json` `exports`/`browser` field → `dist/browser.cjs`), verified in this session to parse the project's own vendored TTF and produce correct glyph metrics with zero Node dependencies (`fontkit.create(buffer)` — no `fs`). `linebreak` has no Node-specific dependencies at all.

This settles the architectural question the phase must answer: **do not build a true DOM-measurement provider** (measuring the actual rendered, Tailwind-styled editable tree via `getBoundingClientRect()`). That tree's box model (padding/margin/border from Tailwind classes) has **no relationship** to the box-model arithmetic `blocksFromModel()` already bakes in (which is hand-derived from the PDF templates' own `StyleSheet` pt values) — real DOM measurement would silently diverge from the PDF's page assignments, breaking the owner's explicit "espelho do pdf" (mirror) requirement. Instead, **run the identical `blocksFromModel()` + `computePageBreaks()` pipeline in the browser**, swapping only the font-loading shell of the measurement provider (fetch TTF → `ArrayBuffer` → `fontkit.create()`, instead of `fontkit.openSync()` from disk). Because the arithmetic, the block structure, and now even the text-measurement algorithm are byte-identical between the web and PDF paths, **`PageAssignment[]` will be identical too — provided both paths are also given the identical `PageConstraints`** (this second half is a non-obvious finding: naively deriving a "web-specific" safety margin, as Phase 184's own handoff note suggests, would reintroduce drift near page-capacity boundaries; the correct move is to reuse the PDF path's constraints verbatim).

**Primary recommendation:** Build a browser-safe twin of `lib/estimate/pagination/measure/estimator.ts` (same core line-packing loop, different font-loading shell), dynamically imported only when paginated mode activates, and compute page breaks in the browser using the EXACT SAME `PageConstraints` the PDF renderer computes (reuse `measureHeaderHeightPt`, `CONTINUATION_TABLE_HEADER_HEIGHT_PT`, `SAFETY_MARGIN_LINES`, and `PDF_RENDER_SAFETY_MARGIN_PT` verbatim — do not derive a new margin). Render the paginated view as a decorative overlay (spacer/chrome injected around offsets, per ARCHITECTURE.md's already-recommended strategy b) over the SAME continuous, unforked editable DOM tree — never re-parent rows into per-page containers.

## Architectural Decision: Measurement Provider (supersedes CONTEXT.md's "DOM measurement provider" framing)

### The three options evaluated

**(c) True DOM measurement (`getBoundingClientRect()`/`ResizeObserver` against the real, mounted, Tailwind-styled editable tree) — REJECTED.**

Evidence: `lib/estimate/pagination/blocks-from-model.ts`'s `TEMPLATE_LITERALS` (lines 217-278) hand-derives every block's `baseHeightPt` from the **PDF templates' own `StyleSheet.create()` values** — e.g. `sectionHeaderBaseHeightPt: 8 * 2 + 16` cited to `components/pdf/estimate-pdf.tsx`'s `styles.sectionHeader.padding`/`marginTop`. This is an additive react-pdf/Yoga box-model formula, not a general "any renderer's box model" formula. The actual editable webview (`estimate-document.tsx`) renders with completely different Tailwind classes (its own padding/margin/border-radius, different from the PDF template's numbers by construction — they were never meant to match pixel-for-pixel; see `.planning/research/PITFALLS.md` Pitfall 2 on the pre-existing px/pt mismatch). Measuring the REAL rendered heights of that DOM tree would produce a `PageBlock[]`-equivalent height series systematically different from what `blocksFromModel()` computes for the PDF — the two page-break computations would use compatible *code* (`computePageBreaks()`) but incompatible *inputs*, and would diverge exactly at page-capacity boundaries. This is precisely the failure mode the phase must avoid (PGBRK-04, owner's "espelho do pdf").

**(b) Server computation (endpoint/server action returning `PageAssignment[]`) — POSSIBLE but inferior to (a) for this codebase; not recommended as primary.**

`blocksFromModel()` + `computePageBreaks()` is a pure, synchronous, in-memory computation with no I/O once its inputs are ready (confirmed by reading `lib/estimate/pagination/engine.ts` — no async, no randomness, no wall-clock reads). Round-tripping that computation through a server action for every debounced keystroke pause adds: network latency (Coolify-hosted, not edge — real round-trip cost), payload serialization of the full document model on every call, and out-of-order response handling (a fast second request completing before a slow first one requires request-id/AbortController discipline the codebase has no existing precedent for in this file). None of this buys anything (a) doesn't already get for free, because the computation itself is cheap and stateless. **Retained as a fallback only** if the client-side bundle-size or in-browser fontkit approach hits an unforeseen blocker during implementation (see Residual Risk below).

**(a) Client-side estimator (fontkit + linebreak running in the browser) — RECOMMENDED.**

Concrete verification performed in this research session (not assumed):
- `fontkit`'s `package.json` declares `"exports": { "node": {...require: main.cjs}, "require": "./dist/browser.cjs", "import": "./dist/browser-module.mjs" }` and a top-level `"browser": "dist/browser.cjs"` field — bundlers (webpack, which Next.js's client compiler uses) resolve the browser-safe build automatically for client bundles, with zero extra config.
- Verified functionally: `require('fontkit/dist/browser.cjs').create(fs.readFileSync('public/fonts/inter/Inter-Regular.ttf'))` opens the real vendored font and `font.layout('Hello world').advanceWidth` returns correct glyph-metrics output — the browser build's public API (`create`, no `open`/`openSync`) is sufficient for pagination; it simply lacks the Node-only file-path-based loaders, which is exactly what forces the isomorphic-core-plus-two-shells refactor below.
- `grep -c 'require("fs")' node_modules/fontkit/dist/browser.cjs` → **0** — confirmed zero Node-fs coupling in the browser build.
- `linebreak` (the UAX#14 line-breaking package) depends only on `unicode-trie` and `base64-js` — both pure JS, zero Node-specific requires (verified by grepping `dist/main.cjs`). No `browser` field needed; it already works anywhere.
- Bundle cost (measured, not estimated): `fontkit/dist/browser.cjs` gzips to **109.9KB**; `linebreak/dist/main.cjs` gzips to **7.7KB**. Combined **~118KB gzip JS**, paid only by users who open paginated mode if lazy-loaded via `dynamic import()` (CONTEXT.md's own suggestion). Font files themselves: `Inter-Regular.ttf` 65.0KB, `Inter-Bold.ttf` 65.2KB, `Lora-Regular.ttf` 46.3KB, `Lora-Bold.ttf` 46.0KB (all in `public/fonts/`) — fetched once via `fetch()`, browser-cached thereafter (only the 1-2 fonts for the active template need to load, not all 4, if the loader is template-aware).
- This computation runs **synchronously, with zero network round-trip**, giving instant (sub-frame) repagination — directly satisfying PGMODE-03's "no flicker"/debounce-then-instant-apply requirement better than option (b) could.

**estimator.ts refactor plan (isomorphic core + two font-loader shells):**

`lib/estimate/pagination/measure/estimator.ts` (Phase 184, `import 'server-only'`) has exactly ONE Node-coupled function: `getFont()`, which calls `fontkit.openSync(fontPath)` (needs `node:path`/`node:fs` to resolve `public/fonts/...` from disk). The actual line-packing loop (`estimateLineCount` — `LineBreaker` + `font.layout(chunk).advanceWidth` + the greedy-wrap accumulation) has **zero Node-specific calls once it has a parsed `fontkit.Font` object**. Recommended split:

1. **`lib/estimate/pagination/measure/line-packer.ts`** (new, isomorphic, zero imports beyond `linebreak` + a `fontkit.Font`-shaped type) — extract the exact greedy-wrap loop (lines 76-106 of today's `estimator.ts`) as a function `packLines(font: fontkit.Font, text, fontSizePt, maxWidthPt): number`. Byte-identical logic, just parameterized on an already-opened font instead of a font-family string.
2. **`lib/estimate/pagination/measure/estimator.ts`** (existing, unchanged behavior) — keeps `import 'server-only'`, keeps `getFont()`'s `fontkit.openSync(path.join(process.cwd(), 'public/fonts', ...))`, now calls the extracted `packLines()`.
3. **`lib/estimate/pagination/measure/browser-estimator.ts`** (new) — a `fontkit.create(arrayBuffer)`-based loader: `fetch('/fonts/inter/Inter-Regular.ttf').then(r => r.arrayBuffer())` (module-scope `Map` cache, same "parse once" discipline as the server side), calling the SAME `packLines()`. Exports `createBrowserFontkitMeasurementProvider(): MeasurementProvider` (async factory, since font fetch is async — the caller awaits this once before the first `computePageBreaks()` call, not per-call).
4. Both shells implement the exact same `MeasurementProvider` interface (`lib/estimate/pagination/measure/types.ts` — already framework-agnostic, zero imports, explicitly documented as "shared by this phase's fontkit estimator AND Phase 185's future DOM measurement provider" — the interface itself needs no change).
5. **Test boundary updates required:** `tests/unit/pagination/pagination-engine-boundary.test.ts` currently hard-codes a comment "`measure/estimator.ts` is deliberately EXCLUDED — the ONE file... allowed to import fontkit/linebreak" — this must be extended to also exclude `browser-estimator.ts` (and NOT `line-packer.ts`, which stays engine-pure... actually `line-packer.ts` DOES need to import `linebreak`, so it also needs listing in the exclusion, while remaining free of `node:fs`/`node:path`). Add a NEW, inverse assertion: `browser-estimator.ts` must contain **zero** `node:fs`/`node:path`/`server-only` imports (a client-safety boundary test, mirroring the existing pattern but checking the opposite direction).

### The constraints-parity finding (the subtle part — read carefully)

Phase 184's own handoff note (`184-05-SUMMARY.md`, "Next Phase Readiness") tells Phase 185: *"Phase 185 should NOT reuse `PDF_RENDER_SAFETY_MARGIN_PT` (100pt)... Phase 185 should run its OWN drift-calibration sweep... if any additional margin proves necessary for the DOM case."* That advice was written assuming Phase 185 would build a **true DOM-measurement provider** (a genuinely different rendering/layout engine, analogous to how react-pdf's Yoga engine has its own drift against the additive formula, requiring `PDF_RENDER_SAFETY_MARGIN_PT` to correct for it).

Given this research's recommendation — reuse `blocksFromModel()`'s arithmetic verbatim, only swapping the font-loading shell — **there is no second layout engine to have drift against**. The web path is not asking a renderer to independently lay out boxes; it performs the identical addition Phase 184 already validated. Consequently: for `computePageBreaks()` to return a **byte-identical `PageAssignment[]`** between the web and PDF paths (the mandatory validation-architecture requirement below), **both paths must be given the identical `PageConstraints` object** — same `contentHeightPt` (via `measureHeaderHeightPt()`, itself pure JS, zero fontkit/server-only dependency, already safely importable client-side — verified by reading `lib/pdf/measure-header-height.ts` in full: its only non-trivial import is a `import type` of `PdfHeaderCompany`, erased at compile time), same `continuationTableHeaderHeightPt` (`CONTINUATION_TABLE_HEADER_HEIGHT_PT`), and — this is the part that contradicts the Phase 184 note — the **same `safetyMarginPt`, INCLUDING `PDF_RENDER_SAFETY_MARGIN_PT`**. `render-estimate-pdf.ts:214-215` computes `safetyMarginPt = SAFETY_MARGIN_LINES * (tableCellFontSizePt * LINE_HEIGHT[fontFamily]) + PDF_RENDER_SAFETY_MARGIN_PT`; the web call must derive `safetyMarginPt` through the exact same formula, not a smaller DOM-only figure, or content sitting near a page-capacity boundary (the calibration script's own "summary + deposit only" fixture proved such boundary cases exist) will land on a different page in the two renderers — a real, silent parity break that would only surface on specific estimate shapes, not the common case.

**Action for the planner:** extract a single shared function (e.g. `lib/estimate/pagination/page-constraints.ts` — `computeEstimatePageConstraints(company, templateId): PageConstraints`) used by BOTH `render-estimate-pdf.ts` and the new web pagination hook, so this can never drift apart again (this mirrors Pitfall 12's lesson from `.planning/research/PITFALLS.md` — one shared function, not two independently-maintained derivations).

### A second concrete gap found: `preparedBy` is not available client-side today

`blocksFromModel()`'s `prepared-by` block requires `preparedBy: string | null`. In the PDF path (`render-estimate-pdf.ts:174-189`), this is resolved via a server-side `company_members` lookup keyed by `estimate.created_by_user_id` (falling back to `company.owner_name`). Grepped the entire `components/workspace/estimate/` tree and `use-estimate-reducer.ts`'s `EstimateEditorState` — **`preparedBy` does not exist anywhere in the editor today** (confirmed: zero matches for `preparedBy`/`prepared_by` in `components/workspace/estimate/`). If the web pagination call silently omits this block, an estimate that HAS a `preparedBy` value could compute a different page count than the PDF (the block, while usually small, is real height near the end of the document).

**Recommendation:** thread `preparedBy` as a new prop into `EstimateEditor`, computed server-side by the SAME parent server component that already resolves `company`/`companyDefaults` (`app/(app)/projects/[id]/page.tsx`), reusing the identical `company_members` lookup logic from `render-estimate-pdf.ts:176-189` — not a client-triggered fetch (the value never changes mid-session; `created_by_user_id` is immutable per estimate).

### Photos: no server round-trip needed (verified, not assumed)

`blocksFromModel()`'s `photo-row` block height formula (`lib/estimate/pagination/blocks-from-model.ts:483-503`) uses only `photo.caption` (presence, for `hasCaption`) and the photo COUNT (for `photosPerRow` chunking) — `photo.url` is declared in the `BlocksFromModelPhoto` type but never read in the height math. The editor's existing `attachedPhotos: Photo[]` (from `use-estimate-reducer.ts`, already has a `caption: string | null` field per `lib/queries/photo.ts:8`) is sufficient as-is: `attachedPhotos.map(p => ({ url: '', caption: p.caption }))` — no signed-URL resolution needed for pagination purposes (only for actual display, which the editor already handles separately and unrelated to this phase).

### An unresolved visual-parity gap worth flagging to the planner (not blocking, but real)

The PDF's `PdfHeader` (company name/logo/contact/address/lang badge) is a `fixed`-position element that repeats on **every** PDF page (its height, via `measureHeaderHeightPt()`, is subtracted from every page's content budget — page 1 included) — but it is architecturally distinct from the `info-grid`/`title-banner` blocks (which are `page1Only`, rendered once). CONTEXT.md/185-UI-SPEC.md's "Page-1-only chrome: Company header + Bill To render ONCE, on page 1, never repeated" describes the `info-grid` block correctly, but doesn't address whether the web preview's continuation pages (2+) should ALSO show a repeated company-mini-header chrome, matching what the PDF actually renders on every page. This does not affect `PageAssignment[]` correctness (header/footer are explicitly excluded from the block list — `types.ts`'s own comment: "deliberately EXCLUDED... never modeled as placeable blocks") but IS a visual-parity question for "espelho do pdf." Flagged as an **Open Question** below — not resolved by this research, needs a product call (likely: skip it, since the web preview already has non-PDF chrome — "Page N of M" — doing similar orientation work, and CONTEXT.md's spec explicitly only asked for page numbers + repeated table header).

## Standard Stack

### Core (already installed — verify versions, no new installs required for the measurement-provider work)

| Library | Version (verified via npm) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `fontkit` | `^2.0.4` | Font parsing + glyph-width measurement, browser build via `dist/browser.cjs` | Already the server-side pagination engine's dependency (Phase 184); reusing it client-side gives byte-identical text measurement to the PDF path — the entire premise of this phase's parity requirement |
| `linebreak` | `^1.1.0` | UAX#14 Unicode line-breaking, used by both server and (new) browser measurement providers | Same reasoning — already proven, zero Node coupling, works anywhere |
| `@dnd-kit/core` | `^6.3.1` | Drag-and-drop (sections + per-section items), already in use, unchanged | Existing, proven in this codebase; PGMODE-03 requires reusing it unmodified |
| `@dnd-kit/sortable` | `^10.0.0` | Sortable list strategy, already in use, unchanged | Same |
| `lucide-react` | `^1.8.0` | Icons — `StretchHorizontal`, `FileStack`, `BookOpen` all confirmed present in the installed version | Matches 185-UI-SPEC.md's icon choices exactly; no upgrade needed |
| `react` | `19.2.4` | — | Already pinned; no version-specific API needed by this phase |
| `framer-motion` | `^12.38.0` (dependency, already installed) | Available but NOT recommended for the toggle transition — 185-UI-SPEC.md correctly scopes this to a CSS-only opacity/height transition | Confirms UI-SPEC's own recommendation against reaching for it here |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@testing-library/react` | `^16.3.2` | Component tests for toggle/page-chrome/editing-preserved-in-pages, jsdom-based | Already the project's convention |
| `vitest` | `^4.1.4` | Test runner, `environment: 'jsdom'` by default (`vitest.config.ts`) | jsdom is sufficient for provider-parity + component tests (no real-browser test needed for THIS phase — see Validation Architecture) |
| `@playwright/test` | `^1.59.1` (devDependency, already used by Phase 184's drift spike) | Only needed if a FUTURE re-validation of the drift spike is required (e.g. font file changes) | Not required to build/ship this phase — already-derived `SAFETY_MARGIN_LINES`/`PDF_RENDER_SAFETY_MARGIN_PT` constants are reused, not re-derived |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-side fontkit estimator (recommended) | Server-computed `PageAssignment[]` via server action | Adds network latency + request-race handling for zero accuracy benefit, since the computation itself is pure/cheap; only fall back here if in-browser fontkit hits an unforeseen bundling blocker |
| Client-side fontkit estimator | True DOM `getBoundingClientRect()` measurement | Rejected — measures the wrong box model (Tailwind CSS, not the PDF's `StyleSheet` pt literals `blocksFromModel()` already assumes); would silently diverge from the PDF near page-capacity boundaries |
| Hand-rolled `Button`-pair toggle (185-UI-SPEC.md's choice) | shadcn official `ToggleGroup` primitive | Not installed today; hand-rolled pair matches the retiring floating-pill toggle's own existing convention (also plain `Button`s) — no registry-vetting gate needed this phase |

**Installation:**
```bash
# No new packages required — fontkit and linebreak are already dependencies.
# Only new FILES are added (browser-estimator.ts, line-packer.ts, page-constraints.ts).
```

**Version verification (ran during this research session):**
```
fontkit: 2.0.4 (installed, matches package.json ^2.0.4)
linebreak: 1.1.0 (installed, matches package.json ^1.1.0)
```

## Architecture Patterns

### Toggle placement (PGMODE-01) — exact files, confirmed unchanged since 185-UI-SPEC.md was written

- `components/workspace/project-header.tsx` (62 lines, read in full) — the right-hand flex row at line 44 (`<div className="flex items-center gap-2 shrink-0 pt-0.5 sm:pt-0">`) already holds the conditional autosave-status span (lines 45-52) followed by `<EditEstimateHeaderButton projectId={project.id} />` at line 53. Insert `<ViewModeToggle mode={slot?.viewMode} onModeChange={slot?.onViewModeChange} />` between them, exactly as 185-UI-SPEC.md specifies.
- `components/workspace/estimate-version-context.tsx` (35 lines, read in full) — `VersionSlot` interface currently has 9 fields (`currentVersionId`, `versions`, `version`, `isDirty`, `isReadOnly`, `onVersionChange`, `projectName`, `onProjectRenamed`, `saveStatus`). Add `viewMode: 'width' | 'page'` and `onViewModeChange: (mode: 'width' | 'page') => void` — two fields, following the exact pattern `saveStatus` already established (optional-chained reads in `project-header.tsx`, published via `setSlot()` in `estimate-editor.tsx`'s existing effect).
- `estimate-editor.tsx`'s `setSlot()` effect (lines 650-663) already re-publishes the slot on every relevant dependency change — add `viewMode`/`handleViewModeChange` to both the object literal and the dependency array; zero new plumbing pattern required.

### Legacy toggle retirement (PGMODE-04) — exact removal targets (line numbers from this session's read, current file state)

`components/workspace/estimate/estimate-editor.tsx`:
- Line 20: `import { EstimateFloatingActions, type EstimateViewMode } from './estimate-floating-actions'` — `EstimateViewMode` type import stays only if the new toggle reuses the same `'width' | 'page'` union (recommended — avoids inventing a second enum).
- Lines 176-184: `VIEW_MODE_KEY` (localStorage key), `LETTER_PAGE_HEIGHT`, `PAGE_FIT_CLEARANCE` constants — `LETTER_PAGE_HEIGHT`/fit-clearance math is REUSED (per 185-UI-SPEC.md §4 Responsive, widened to gate on width too), not deleted; `VIEW_MODE_KEY`'s localStorage persistence is explicitly NOT reused (CONTEXT.md: session-only state, DEFER-04).
- Lines 278-291: the `viewMode` `useState` + localStorage-read effect + `handleViewModeChange` — state OWNERSHIP moves to (or is mirrored into) the new toggle's state, still living in `estimate-editor.tsx` per the existing "editor owns real state, publishes to slot" pattern (matches ARCHITECTURE.md Q4's recommendation) — only the localStorage read/write is dropped.
- Lines 299-317: `pageWrapRef`/`pageZoom` computation — REUSED per 185-UI-SPEC.md §4 (widened to also gate on width, not just height).
- Lines 714-743: the `pageWrapRef`-wrapped `<div>` + `<EstimateDocument pageView={viewMode === 'page'} ...>` — the `pageView` boolean prop stays (it already drives `estimate-document.tsx`'s "paper" styling, verified reusable via `tests/unit/estimate/document-page-view.test.tsx`, read in full — this test does NOT need to change, since it only tests the boolean's existing CSS effect).
- Lines 764-772: `<EstimateFloatingActions viewMode={viewMode} onViewModeChange={handleViewModeChange} ... />` — remove these two props from the call site once the header toggle replaces them.

`components/workspace/estimate/estimate-floating-actions.tsx` (140+ lines, read in full through the toggle button):
- Line 4: `File, StretchHorizontal` icon imports — remove (no longer used in this file once the toggle button block is deleted; confirm no other use in the file first).
- Lines 22-26: `viewMode?: EstimateViewMode` / `onViewModeChange?: (mode) => void` prop declarations — remove.
- Lines 69-70: destructured `viewMode, onViewModeChange` — remove.
- Lines 112-131: the entire `{viewMode && onViewModeChange && (...)}` conditional button block ("Full page"/"Full width") — remove.
- `EstimateViewMode` type export (line 11) — keep only if the new `ViewModeToggle` imports it too (recommended, avoids a duplicate union type); otherwise move the type to a shared location.

**Tests requiring update/removal (confirmed by direct search, not assumed):**
- `tests/unit/components/estimate-floating-actions.test.tsx` — contains 5+ tests specifically asserting `viewMode`/`onViewModeChange` button rendering and click behavior (lines 110-175ish) — these must be removed or rewritten once the prop is deleted from the component.
- `tests/unit/workspace/estimate-editor-conflict.test.tsx` — matched the `EstimateFloatingActions`/`viewMode` grep; verify at implementation time whether it merely renders the component (needs no change) or asserts on the toggle specifically (needs update).
- `tests/unit/estimate/document-page-view.test.tsx` (read in full, 109 lines) — tests the `pageView` boolean prop's CSS effect on `EstimateDocument` directly (not the toggle button) — **does not need to change**, since `pageView` itself is being reused, not retired. Keep as a regression guard.

### The editable document — current state (post-183/184), confirmed by direct read

`components/workspace/estimate/estimate-document.tsx` is **1805 lines today** (not the 2037/2038 cited by `.planning/research/PITFALLS.md`/`ARCHITECTURE.md`, which were written 2026-07-27 — the file has since shrunk, likely from Phase 182/183's shared-module extraction; re-verify the exact count at implementation time rather than trusting either historical figure). Confirmed facts relevant to this phase:
- **Zero `useMemo`/`useCallback`** anywhere in the file (grepped, zero matches) — PITFALLS.md's Pitfall 5 concern is still fully live; any repagination hook added here inherits this pre-existing debt.
- **Two dnd-kit context tiers, not one global one:** an outer `<DndContext id="dnd-sections">`/`<SortableContext>` at lines 1620-1645 (section reordering, `data.sections.map(s => s.id)`), and a PER-SECTION `<DndContext id={itemDndId}>`/`<SortableContext>` inside `DocumentSectionBlock` at lines 576-616 (each section gets its OWN item-drag context, scoped to that section's `item.id` list). Both already operate on the LOGICAL (unpaginated) `data.sections`/`section.items` order — exactly the "derived projection, not a third dnd-kit axis" rule PGMODE-03 requires; no new dnd-kit wiring needed, only a decorative overlay layered on top (see below).
- **No `DragOverlay` component is used anywhere in this file today** (grepped, zero matches) — drag items move via dnd-kit's default in-place transform, not a portal-based ghost. This means 185-UI-SPEC.md's rule "`DragOverlay` must portal to `document.body`" is currently **not applicable** (there is no `DragOverlay` to portal) — the real, active requirement is simply that the page-decoration boxes use `overflow: visible` (already correctly specified in 185-UI-SPEC.md §3) so the existing in-place drag transform is never visually clipped near a page-boundary decoration.
- The "paper" styling block (lines 1404-1434, read in full) is the exact block 185-UI-SPEC.md cites for reuse ("`colorScheme: 'light'`" + CSS-variable repin) — confirmed present verbatim, `pageView` boolean gates `minHeight`/corner-radius/border-color exactly as described.
- The desktop item-table header row (`bg-muted/50 text-sm text-muted-foreground border-b border-border/50 select-none`, confirmed present, currently at line 588 — not line 850 as 185-UI-SPEC.md states; file line numbers drift as the file is edited, but the class string itself is byte-identical) — reuse this class verbatim for the DOM continuation-page table header, per 185-UI-SPEC.md.
- Every geometry constant used here (`LETTER_HEIGHT_PX`, `LETTER_WIDTH_PX`) already imports from `lib/estimate/document/tokens.ts` (line 34 of `estimate-editor.tsx`) — confirmed this module is 100% client-safe (zero framework imports, enforced by `tests/unit/estimate/document-engine-boundary.test.ts`) and already exports everything needed for page geometry (`PT_PER_PX`, `PX_PER_PT`, `LETTER_WIDTH_PT/PX`, `LETTER_HEIGHT_PT/PX`, `ESTIMATE_PAGE_GEOMETRY`, `ESTIMATE_DESIGN_TOKENS`, `LINE_HEIGHT`, `photosPerRow`) — **no new geometry module needs to be created**, contrary to what 185-UI-SPEC.md's §2 speculatively suggested ("If Phase 184's shared geometry module... lands first... otherwise define ONE new shared constant") — it already landed in Phase 184 exactly as hoped.

### Recommended paginated-overlay strategy (confirms ARCHITECTURE.md Q5's "(b) spacer/chrome-overlay", now validated against the current file)

Given the two facts above (no `useMemo` anywhere, two independently-scoped dnd-kit tiers already keyed by stable ids, no `DragOverlay`), ARCHITECTURE.md's recommended strategy — keep the continuous DOM tree completely intact; inject page-break decoration (spacer gaps + page-sheet chrome) at computed y-offsets, without re-parenting any row — remains the only strategy consistent with PGMODE-03's "no forked read-only copy" rule and 185-UI-SPEC.md's BLOCK-level checker rule ("paginated mode renders a forked/duplicate read-only copy... violates PGMODE-03"). Concretely:
1. Render `EstimateDocument` exactly as today (unchanged props, unchanged internal structure).
2. A new outer wrapper component (e.g. `PaginatedDocumentOverlay`) computes `PageAssignment[]` (via the browser estimator + shared `blocksFromModel()`/`computePageBreaks()`/`page-constraints.ts`) from the SAME `data`/`state` the editor already has, entirely independent of the DOM's actual rendered pixel positions — it does NOT measure the mounted tree at all, it recomputes from the document model, exactly like the PDF path does.
3. The overlay converts each `PageAssignment`'s computed cumulative height (in pt, via `PX_PER_PT`) into a pixel offset and renders ABSOLUTELY-POSITIONED (or CSS-grid-line-based) decoration — page-sheet backgrounds/borders/shadows, page-number chrome, page-gap spacers — behind (`z-index` below, `pointer-events: none`) the real content, per 185-UI-SPEC.md §3's already-correct rules.
4. Because this is a computed-from-model overlay (not a DOM remeasurement), it is inherently robust to reflow timing — it does not need to wait for layout/paint to "measure" anything; it only needs the debounced document-model snapshot.

### Repagination triggers (PGMODE-03)

- `use-estimate-reducer.ts`'s `EstimateEditorState`/`dispatch` (confirmed: a plain `useReducer`, no external state library) is the single source of truth already threaded into `EstimateDocument` as `data`/`dispatch` — the SAME state the overlay needs to recompute `blocksFromModel()`'s input from.
- **Structural changes** (`ADD_SECTION`, item add/remove, `REORDER_SECTIONS`, item reorder) should trigger IMMEDIATE recomputation — these are already distinct, easily-identified dispatch action types (confirmed `ADD_SECTION`/`REORDER_SECTIONS` action types exist in the reducer, called from `estimate-document.tsx`'s handlers).
- **Free-text changes** (item description, summary, terms, notes — anything with `UPDATE_FIELD`-style actions feeding a `measurement`-bearing block) should debounce at **400ms** (185-UI-SPEC.md's own recommendation, the midpoint of CONTEXT.md's 300-500ms range) — implement via a `useDeferredValue`-adjacent pattern or a plain `setTimeout`-based debounce on a derived "pagination-relevant snapshot" of `state`, decoupled from the live `dispatch`-driven input value (per PITFALLS.md Pitfall 5's explicit recommendation).
- **Focus/cursor preservation** is a structural consequence of the overlay strategy (rows are keyed by `item.id`/`section.id` today, confirmed in the `.map(section => <SortableDocumentSection key={section.id} ...>)` / `.map(item => <SortableDocumentItemRow key={item.id} ...>)` calls — no index-based keys found) — since the DOM tree never re-parents or re-keys, native browser focus survives automatically; this is NOT extra code to write, it falls out of the "decoration overlay, not re-parenting" architecture.

### PGMODE-05 guard (share webview import purity)

Confirmed by reading `components/share/estimate-view.tsx`'s full import list: it imports `SYSTEM_COLORS`, `lib/color/contrast`, `lib/queries/share` types, `lib/i18n/*`, `lib/money/currency`, `SignaturePad` — **zero** import of `estimate-document.tsx` or any `lib/estimate/pagination/*` module (it dynamically imports the read-only `estimate-document-modern.tsx`, a structurally separate file, per ARCHITECTURE.md's existing System Overview diagram). No existing automated test enforces this boundary going forward, though. **Recommendation:** add a new boundary test (e.g. `tests/unit/estimate/share-webview-pagination-boundary.test.ts`) mirroring the existing `pagination-engine-boundary.test.ts`/`document-engine-boundary.test.ts` grep pattern — assert `app/estimate/[token]/**` and `components/share/**` source files never match `from ['"].*lib/estimate/pagination` or the new paginated-editor-overlay component's path. This closes PGMODE-05 with an automated, durable guard rather than a one-time manual check.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text-wrap line counting for pagination math | A second, DOM-only line-counting heuristic (`charCount / charsPerLine`, or a fresh `getBoundingClientRect()` measurement pass) | The EXACT SAME `fontkit`+`linebreak` line-packer (`packLines()`) already validated against real Chromium in Phase 184's drift spike | A second heuristic reintroduces exactly the "two engines independently guessing" anti-pattern PITFALLS.md Pitfall 1 warns against — the whole point of this phase is reusing Phase 184's already-proven measurement, not inventing a new one |
| Page-break decision logic | A parallel page-assignment algorithm inside the editor | `lib/estimate/pagination/engine.ts`'s `computePageBreaks()`, imported and called identically to `render-estimate-pdf.ts` | Any independent reimplementation, even a "simpler" one, breaks the single-source-of-truth guarantee PGBRK-01 requires |
| Page-content-budget derivation | A new, web-specific "content height" formula | `measureHeaderHeightPt()`/`CONTINUATION_TABLE_HEADER_HEIGHT_PT`/`SAFETY_MARGIN_LINES`/`PDF_RENDER_SAFETY_MARGIN_PT`, all already pure and importable | See the "constraints-parity finding" above — a second derivation is the single most likely way this phase silently fails its own acceptance bar |
| Drag-and-drop across a "page boundary" | A page-scoped `SortableContext`/third dnd-kit axis | The existing two-tier `DndContext`/`SortableContext` pair, unmodified, operating on logical (unpaginated) order | PITFALLS.md Pitfall 7 — page membership is a derived, read-only projection; dnd-kit must never see it |
| Toggle state management | Zustand store, URL param, or a new Context provider | The existing `VersionSlot` Context (`estimate-version-context.tsx`) — add 2 fields | CONTEXT.md's explicit locked decision; also the only mechanism structurally guaranteed to never leak into the public share route (a URL param risks that; a Context scoped to the authenticated workspace tree cannot) |

**Key insight:** almost every "don't hand-roll" item in this phase reduces to the same instruction: reuse Phase 184's engine and its exact numeric constants, verbatim, on both ends of the split. The phase's entire risk profile is concentrated in accidentally introducing a SECOND, subtly-different copy of already-solved math — not in inventing new pagination logic.

## Common Pitfalls

This phase inherits `.planning/research/PITFALLS.md` in full (Pitfalls 1, 2, 5, 6, 7, 11, 14 are directly load-bearing for this phase specifically — reflow thrash, focus loss, dnd-kit page-boundary handling, react-pdf/DOM import-boundary discipline, GUARD-03 math-purity during any `estimate-document.tsx` touch). Two NEW pitfalls surfaced by this research, not present in the prior document:

### Pitfall 15 (new): Deriving a "web-specific" safety margin instead of reusing the PDF path's constraints verbatim
**What goes wrong:** Following Phase 184's own handoff-note suggestion literally ("run your OWN drift-calibration sweep") produces a smaller `safetyMarginPt` for the web path than the PDF path uses, since there's no Yoga-engine drift to correct for on the web side.
**Why it happens:** The handoff note assumed a true-DOM-measurement architecture; this research recommends a different (arithmetic-reuse) architecture where that advice no longer applies.
**How to avoid:** Extract one shared `computeEstimatePageConstraints()` function; both PDF and web call it identically, including `PDF_RENDER_SAFETY_MARGIN_PT`.
**Warning signs:** A test fixture near a page-capacity boundary (e.g. the existing `buildFixtureEstimate({})` two-page baseline, or a dedicated "summary + deposit only" fixture, both already used by Phase 184's own tests) produces a different page count in the web path than the PDF path.

### Pitfall 16 (new): `preparedBy` silently absent from the web pagination input
**What goes wrong:** The web overlay computes `blocksFromModel()` without a `preparedBy` value (since the editor doesn't have one today), while the PDF has one whenever `estimate.created_by_user_id` resolves to a company member — an estimate with a real "prepared by" value could paginate differently between web and PDF.
**Why it happens:** `preparedBy` was added to the PDF path (Phase 183) as a server-only lookup, never threaded to the editor.
**How to avoid:** Thread `preparedBy` as a new prop into `EstimateEditor`, resolved server-side alongside `company`/`companyDefaults` in `app/(app)/projects/[id]/page.tsx`, reusing `render-estimate-pdf.ts`'s exact lookup logic.
**Warning signs:** A parity test using a fixture WITH a `preparedBy`/`created_by_user_id` value produces different page counts between the two paths; a fixture without one does not (this asymmetry is the tell).

## Code Examples

### VersionSlot extension (matches the existing `saveStatus` pattern exactly)
```ts
// components/workspace/estimate-version-context.tsx
export interface VersionSlot {
  // ...existing 9 fields unchanged...
  /** Phase 185 (PGMODE-01) — document view mode, bridged from EstimateEditor
   *  to ProjectHeader exactly like saveStatus/projectName already are. */
  viewMode: 'width' | 'page'
  onViewModeChange: (mode: 'width' | 'page') => void
}
```

### Reusing the identical pipeline client-side (illustrative shape, not final code)
```ts
// A NEW client-only hook, e.g. components/workspace/estimate/use-paginated-preview.ts
import { blocksFromModel } from '@/lib/estimate/pagination/blocks-from-model'
import { computePageBreaks } from '@/lib/estimate/pagination/engine'
import { computeEstimatePageConstraints } from '@/lib/estimate/pagination/page-constraints' // NEW, shared with render-estimate-pdf.ts
import { createBrowserFontkitMeasurementProvider } from '@/lib/estimate/pagination/measure/browser-estimator' // NEW

// Called with the SAME shape render-estimate-pdf.ts builds for blocksFromModel(),
// derived from EstimateEditorState + company + (new) preparedBy prop.
// constraints MUST come from the same computeEstimatePageConstraints(company, templateId)
// the PDF path uses -- never a separately-derived margin.
```

### Server-side reference this phase must match exactly (already shipped, Phase 184)
```ts
// lib/pdf/render-estimate-pdf.ts:214-220 (existing, read verbatim)
const safetyMarginPt =
  SAFETY_MARGIN_LINES * (geometry.tableCellFontSizePt * LINE_HEIGHT[fontFamily]) + PDF_RENDER_SAFETY_MARGIN_PT
const constraints: PageConstraints = {
  contentHeightPt: LETTER_HEIGHT_PT - geometry.topPaddingPt - geometry.bottomPaddingPt - headerHeightPt,
  continuationTableHeaderHeightPt: CONTINUATION_TABLE_HEADER_HEIGHT_PT[templateId],
  safetyMarginPt,
}
```

## Open Questions

1. **Should the web paginated preview's continuation pages (2+) visually repeat a company mini-header chrome, mirroring the PDF's `fixed` `PdfHeader`?**
   - What we know: the PDF renders this on every page; it's excluded from the block-assignment model entirely (pure chrome, doesn't affect `PageAssignment[]`).
   - What's unclear: CONTEXT.md/185-UI-SPEC.md never explicitly asked for this specific piece of chrome — only "Page N of M" + repeated table header were specified.
   - Recommendation: default to NOT adding it (matches the explicit spec, keeps scope tight); note it as a fast-follow if the owner's pending reference image shows it.

2. **Exact wiring for `preparedBy` threading — new prop vs. a small dedicated query.**
   - What we know: the PDF path's lookup logic is simple and already proven (`render-estimate-pdf.ts:174-189`).
   - What's unclear: whether `app/(app)/projects/[id]/page.tsx`'s existing `Promise.all` fetch batch is the right place to add this, or whether it needs its own server action callable on-demand.
   - Recommendation: add to the existing `Promise.all` batch (same page load, same request), since it's needed unconditionally once paginated mode exists (not gated behind the toggle being active).

3. **Should `computeEstimatePageConstraints()` live in `lib/estimate/pagination/` or move `measureHeaderHeightPt`/`CONTINUATION_TABLE_HEADER_HEIGHT_PT`/`PDF_RENDER_SAFETY_MARGIN_PT` out of `lib/pdf/measure-header-height.ts` entirely?**
   - What we know: `lib/pdf/measure-header-height.ts` is technically client-safe today (verified: only a type-only import touches `components/pdf/*`), so importing it as-is from a client component works without any file move.
   - What's unclear: whether keeping pagination-critical constants inside a `lib/pdf/`-named module reads as confusing/risky to future maintainers (the naming implies PDF-only).
   - Recommendation: leave the file in place (avoid unnecessary churn to a just-stabilized Phase 184 module) but add the shared `computeEstimatePageConstraints()` wrapper in `lib/estimate/pagination/`, which internally imports from `lib/pdf/measure-header-height.ts` — and add a boundary test asserting that file never gains a real (non-type) react-pdf import in the future.

## Validation Architecture

(`workflow.nyquist_validation` not set to `false` in `.planning/config.json` at time of research — section included per default-enabled rule. Verify at plan time.)

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4, `environment: 'jsdom'` (default, per `vitest.config.ts`), `@testing-library/react` 16.3.2 |
| Config file | `vitest.config.ts` (repo root) — `include: tests/unit/**/*.test.{ts,tsx}` etc. |
| Quick run command | `npx vitest run tests/unit/pagination tests/unit/estimate tests/unit/components/estimate-floating-actions.test.tsx tests/unit/workspace` |
| Full suite command | `npx vitest run tests/unit tests/eval` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PGBRK-01/04 (web clause) | Same fixture → IDENTICAL `PageAssignment[]` via browser provider vs. server provider | unit (jsdom, no real browser needed — both providers run as plain JS) | `npx vitest run tests/unit/pagination/measure/browser-estimator-parity.test.ts -x` | ❌ Wave 0 — new file |
| PGBRK-01/04 (constraints parity) | `computeEstimatePageConstraints()` returns identical values to `render-estimate-pdf.ts`'s inline derivation | unit | `npx vitest run tests/unit/pagination/page-constraints.test.ts -x` | ❌ Wave 0 — new file |
| PGMODE-01 | Toggle renders, `aria-pressed`, tooltips, calls `onModeChange` | component (jsdom + RTL) | `npx vitest run tests/unit/components/view-mode-toggle.test.tsx -x` | ❌ Wave 0 — new file |
| PGMODE-02 | Paginated canvas renders N page sheets matching engine's page count for a fixture | component (jsdom + RTL) | `npx vitest run tests/unit/estimate/paginated-preview-canvas.test.tsx -x` | ❌ Wave 0 — new file |
| PGMODE-03 | Editing (dispatch) inside paginated mode still mutates state; focus/cursor survives a cross-page-boundary edit (simulated via key-stability assertion, not real focus in jsdom) | component (jsdom + RTL) | `npx vitest run tests/unit/estimate/paginated-editing-preserved.test.tsx -x` | ❌ Wave 0 — new file |
| PGMODE-04 | Legacy toggle buttons/props fully removed; no dangling `viewMode` prop on `EstimateFloatingActions` | unit (update existing) | `npx vitest run tests/unit/components/estimate-floating-actions.test.tsx -x` | ✅ exists, needs edit |
| PGMODE-05 | Share webview source never imports pagination/paginated-editor modules | unit (static grep, mirrors existing boundary tests) | `npx vitest run tests/unit/estimate/share-webview-pagination-boundary.test.ts -x` | ❌ Wave 0 — new file |
| (regression) | `pageView` boolean prop's existing CSS behavior unchanged | component | `npx vitest run tests/unit/estimate/document-page-view.test.tsx -x` | ✅ exists, no change expected |
| (regression) | GUARD-03: no client-side money math introduced during this touch of `estimate-document.tsx`/`estimate-editor.tsx` | unit (existing goldens) | `npx vitest run tests/unit/estimate` (broad) | ✅ exists |

### Sampling Rate
- **Per task commit:** the narrow `npx vitest run tests/unit/pagination tests/unit/estimate tests/unit/components` slice above.
- **Per wave merge:** `npx vitest run tests/unit tests/eval` (full suite, matches CI's own gate — `tsconfig.ci.json` scope for typecheck).
- **Phase gate:** full suite green + `npx tsc -p tsconfig.ci.json --noEmit` clean before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `tests/unit/pagination/measure/browser-estimator-parity.test.ts` — the single most important new test: feed an identical fixture through the server (`createFontkitMeasurementProvider`) and browser (`createBrowserFontkitMeasurementProvider`) providers with IDENTICAL `PageConstraints`, assert `computePageBreaks()` output is deep-equal.
- [ ] `tests/unit/pagination/page-constraints.test.ts` — asserts the new shared `computeEstimatePageConstraints()` matches `render-estimate-pdf.ts`'s existing inline formula exactly (regression-guard against the two derivations drifting apart).
- [ ] `tests/unit/components/view-mode-toggle.test.tsx`, `tests/unit/estimate/paginated-preview-canvas.test.tsx`, `tests/unit/estimate/paginated-editing-preserved.test.tsx` — new component tests per the table above.
- [ ] `tests/unit/estimate/share-webview-pagination-boundary.test.ts` — new static-grep boundary test for PGMODE-05.
- [ ] Update `tests/unit/pagination/pagination-engine-boundary.test.ts` to add `browser-estimator.ts`/`line-packer.ts` to the fontkit/linebreak exclusion list, and add an inverse assertion that `browser-estimator.ts` contains zero `node:fs`/`node:path`/`server-only` imports.
- [ ] Update `tests/unit/estimate/pt-px-conversion-source.test.ts`'s `CLEAN_SOURCES` array to include any new file that reads page geometry (the new overlay component, `page-constraints.ts`).
- [ ] Update/trim `tests/unit/components/estimate-floating-actions.test.tsx` (remove the 5 `viewMode`-specific test cases once the prop is deleted).
- [ ] Framework install: none — Vitest/RTL/jsdom already fully configured; no new test-infra package needed.

No real-browser (Playwright) test is required to SHIP this phase — the parity claim is proven by identical-input/identical-output unit tests in jsdom (both measurement providers are plain JS once their fonts are loaded; jsdom's `fetch`/`ArrayBuffer` support is sufficient for the browser provider's font-loading shell in tests, verified: Node 18+/jsdom both support `ArrayBuffer`/`fetch` natively). A real-browser check would only be needed if re-validating the drift spike itself (unnecessary — Phase 184 already did this and the constants are being reused unchanged).

## Sources

### Primary (HIGH confidence — direct codebase reads this session)
- `.planning/phases/185-paginated-editable-editor-mode/185-CONTEXT.md`, `185-UI-SPEC.md` — locked decisions and design contract
- `.planning/REQUIREMENTS.md` — PGMODE-01..05, PGBRK-01/04 partial status
- `.planning/phases/184-consolidated-pagination-engine/184-05-SUMMARY.md`, `184-DRIFT-REPORT.md` — the load-bearing drift-spike evidence and handoff contract
- `.planning/research/ARCHITECTURE.md`, `FEATURES.md`, `PITFALLS.md` — prior milestone research, largely still valid, two gaps closed by this document
- `lib/estimate/pagination/{types,engine,rules,blocks-from-model}.ts`, `measure/{types,estimator,safety-margin}.ts` — full reads
- `lib/estimate/document/tokens.ts`, `lib/pdf/measure-header-height.ts`, `lib/pdf/render-estimate-pdf.ts` — full reads
- `components/workspace/project-header.tsx`, `estimate-version-context.tsx` — full reads
- `components/workspace/estimate/estimate-editor.tsx` (targeted, ~450 lines read), `estimate-floating-actions.tsx` (full), `estimate-document.tsx` (targeted, ~350 lines read across key sections), `use-estimate-reducer.ts` (partial)
- `tests/unit/pagination/pagination-engine-boundary.test.ts`, `tests/unit/estimate/document-engine-boundary.test.ts`, `pt-px-conversion-source.test.ts`, `document-page-view.test.tsx`, `measure/estimator.test.ts` — full reads
- Hands-on verification in this session: `node -e` scripts confirming `fontkit`'s browser build parses the real vendored TTF with zero `fs` dependency; `linebreak`'s zero Node-coupling; gzip sizes of both bundles; `next.config.ts` (no special webpack config needed, CSP already permits `worker-src`/`connect-src 'self'`)

### Secondary (MEDIUM confidence)
- Next.js/webpack automatically resolving fontkit's `browser` export condition for client bundles — standard, well-documented bundler behavior, not yet verified against a real build of THIS app (residual implementation risk, low probability of failure, cheap to smoke-test early in Wave 0)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version/capability claim verified directly against installed `node_modules`, not training-data assumption
- Architecture (measurement-provider decision): HIGH — decision is grounded in a REAL prior drift spike (Phase 184's own committed evidence) plus this session's own functional verification of fontkit's browser build against the real vendored font
- Pitfalls: HIGH for the 2 new pitfalls (grounded in direct code reads); HIGH (inherited) for the pre-existing PITFALLS.md pitfalls, unchanged
- Validation architecture: HIGH — test framework/commands verified against `vitest.config.ts`/`package.json`; specific new test files are proposed (Wave 0 gaps), not yet created

**Research date:** 2026-07-28
**Valid until:** ~2026-08-11 (30 days) for the architectural decision and stack facts; the exact line numbers cited throughout will drift faster (re-verify at plan/implementation time, as this research itself found several already-stale line-number citations in prior research documents)
