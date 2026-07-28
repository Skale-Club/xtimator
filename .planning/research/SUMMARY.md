# Project Research Summary

**Project:** Xtimator — v4.23 Unified Estimate Document Engine
**Domain:** Cross-renderer document pagination (DOM webview editor mirrors `@react-pdf/renderer` PDF output) for structured business estimate/invoice documents
**Researched:** 2026-07-27
**Confidence:** MEDIUM-HIGH

## Executive Summary

This milestone unifies four independently-drifted document surfaces — the classic webview, the modern webview, the classic PDF, and the modern PDF — onto one shared document model, then layers a new paginated, fully-editable editor mode on top, powered by a single deterministic page-break rule engine shared between the DOM preview and `@react-pdf/renderer`. All four research tracks converge on the same central correction to the milestone's own framing: **pixel-identical rendering between a browser's CSS engine and react-pdf's Yoga+fontkit engine is architecturally impossible and must not be the acceptance bar.** The achievable, correct target is "same page-break decisions, same content per page" — verified structurally (same item-to-page assignment) rather than via pixel-diffing. This reframing is not a compromise; it is the only bar that is actually buildable, and every research file independently arrived at it.

The recommended approach is a greenfield `lib/estimate/pagination/` module: a pure, DOM/react-pdf-agnostic rule engine (`computePageBreaks()`) that consumes pre-measured block heights from two different measurement providers — a live DOM `ResizeObserver` provider for the web editor, and a `fontkit`+`linebreak` (both already transitive deps of the installed `@react-pdf/renderer@4.4.0`, so promoting them to direct dependencies costs nothing new) heuristic-measurement provider for the server-side PDF path. Both providers feed the same rule engine, which is the actual shared contract — not shared JSX, not shared CSS, not emergent agreement between two independent layout engines. This requires registering the same physical TTF font files (Inter for classic, one open-license serif for modern) in both react-pdf's `Font.register` and the web font stack, replacing today's mismatched built-in Helvetica/Times-Roman AFM fonts vs. browser system-font stacks — otherwise wrapped-line counts diverge regardless of how good the pagination engine is. An early, cheap spike comparing browser-rendered vs. `fontkit`-computed line-wrap counts for representative estimate text is flagged as the single biggest unresolved technical-risk unknown and should be resourced as its own early step, not assumed to "just work."

Three risks stand out for mitigation. First, the milestone's own PROJECT.md framing is factually wrong in one place: the webview does **not** currently render a signature block or photo captions either — this is net-new work on all four surfaces, not "copy the webview into the PDF," and architecture research corrects this explicitly. Second, a real live production bug exists independent of pagination: `send/route.ts` (email) and `lib/whatsapp/pdf-delivery.ts` (WhatsApp) both hardcode the Classic template and skip `applySignedSnapshot()`, violating the TRUST-01 signed-content contract — this is standalone-fixable by extracting the already-correct pattern from `pdf/route.ts` into one shared resolver function, with zero dependency on anything else in this milestone, and should ship first as the lowest-risk, highest-trust-value increment. Critically, that resolver must be a plain importable function taking an explicit `SupabaseClient`, never an internal `fetch()` to the HTTP route — `pdf-delivery.ts` runs in an Inngest/webhook context with no auth cookies. Third, a naive implementation risks two forms of thrash: per-keystroke full repagination on the already-unmemoized 2037-line `estimate-document.tsx`, and focus loss when an edit pushes an item across a page boundary and React remounts it under a new page-scoped key — both are avoidable with debouncing/stable item-id keys but easy to ship wrong on a first pass.

## Key Findings

### Recommended Stack

No new pagination framework is needed or recommended — the milestone's break-rule logic (never split a row, keep header with first row, keep subtotal with last row, totals/photos/signature blocks atomic) is domain-specific business logic best expressed as a small homegrown pure-TypeScript module, not a generic layout library. The stack work is almost entirely about **measurement primitives and font parity**, not new frameworks.

**Core technologies:**
- `@react-pdf/renderer@^4.5.1` (routine patch bump from installed `4.4.0`) — existing, unchanged PDF stack; Alpine container rules out puppeteer/chromium, so this remains the only viable renderer
- `fontkit@^2.0.4` — promote from transitive to direct dependency; it's the exact glyph-metrics library `@react-pdf/font`/`@react-pdf/pdfkit` already use internally, so measuring with it (rather than a second independent parser like `opentype.js`) guarantees the pagination engine's height estimates use the same metrics react-pdf itself renders with
- `linebreak@^1.1.0` — also already transitive; UAX#14 line-break-opportunity algorithm, pairs with `fontkit` to reimplement (at a stable, documented level) what react-pdf's internal, undocumented `@react-pdf/textkit` does — do not depend on `textkit` directly, it has no public API contract
- Self-hosted Inter TTF (Regular + Bold; the app already ships Inter via `next/font/google` for the UI, but that's WOFF2 — react-pdf needs the TTF variant specifically) + one self-hosted open-license serif TTF (e.g. Source Serif 4) for the modern template, replacing built-in `Helvetica`/`Times-Roman` AFM fonts and the generic `font-serif` Tailwind stack

**Explicitly rejected:** Paged.js/PagedJS (fights inline-editability, shares no measurement model with react-pdf — would add a third independent pagination algorithm, not converge to one), `@react-pdf/textkit` as a direct dependency (internal/unstable API), WOFF2 fonts in `Font.register` (documented rendering problems), remote-URL font fetching at render time (non-deterministic, adds a network failure mode to every PDF), a new global state library (no precedent in the codebase, not required).

### Expected Features

The comparable-product landscape (PandaDoc, Proposify, QuickBooks Online, Google Docs, CKEditor 5 Pagination) confirms the milestone's scoped feature set is correctly bounded — the real risk is scope creep toward word-processor-grade pagination (manual page breaks, running headers, footnotes) that no competitor offers for this document type and that directly undermines the "one deterministic rule" design principle.

**Must have (table stakes) — P1, all required for v1:**
- Never split a line-item row across a page break
- Section header keeps with its first row; section subtotal keeps with its section's last row
- Totals block (Subtotal→Discount→Tax→Total→Deposit→Balance Due) as one atomic, never-split unit
- Repeating line-items column header on continuation pages (react-pdf has NO native `<thead>`-repeat-on-continuation — must be hand-built from the pagination module's per-page item ranges)
- Page 1 always carries letterhead + Bill To, non-repeating
- Continuous/paginated toggle (icon + label, not icon-only — no surveyed competitor uses icon-only for this), full inline editing preserved in paginated mode
- Identical page-break decisions between web preview and PDF, verified structurally

**Should have (differentiators):** live debounced reflow while typing (not a static post-generation preview — this is what actually beats the QuickBooks-class competitors), page numbers/"Page X of Y" footer, "Continued" section-continuation indicator, cursor/scroll-position preservation across live repagination

**Defer (v2+):** explicit data-persisted "force new page before this section" flag (a scoped escape hatch, not freeform manual page-break insertion — deliberately rejected as an anti-feature for v1), smart totals-block "push to fresh page vs. cramped near-fit" refinement, orphan/widow control in terms/notes text (low value — estimates are short, structured documents, not long-form prose)

**Anti-features to actively avoid:** per-keystroke full repagination, pixel-identical rendering as the bar, user-insertable manual page breaks, pagination applied to the public share webview (explicitly out of scope per PROJECT.md — the customer-facing page stays a normal single-page scroll), adopting Paged.js on the web side only (recreates the "two engines independently guessing" problem this milestone exists to eliminate).

### Architecture Approach

Extract all cross-cutting concerns (data model, labels, formatters, design tokens) into a new `lib/estimate/document/` module and all pagination decision logic into a new `lib/estimate/pagination/` module — both pure TypeScript with zero React/react-pdf/DOM imports, consumed by thin per-renderer-family interpreters. This mirrors a pattern that already works in the codebase today (`formatMoney`, `deriveDepositDisplay`, `resolvePresentationSettings` are already shared pure functions with zero react-pdf or DOM dependency) — the milestone extends this proven pattern to structure/layout decisions rather than inventing a new sharing mechanism.

**Major components:**
1. `lib/estimate/document/{model,labels,format,tokens}.ts` — canonical `DocumentModel` type (superset of today's `EstimateDocumentData`), one label record, one `formatAddress()`/`formatDate()` (using the Classic webview's version, the only one of 4 with the local-midnight timezone fix), and `DesignTokens` as plain values (hex, pt/px numbers) — never Tailwind class strings, since react-pdf's `StyleSheet.create()` cannot consume Tailwind at all
2. `lib/estimate/pagination/{types,engine,blocks-from-model,measure-dom,measure-pdf}.ts` — the pure `computePageBreaks(blocks, constraints)` rule engine (zero DOM/react-pdf dependency, trivially unit-testable) plus two measurement providers (live `ResizeObserver` for DOM, `fontkit`-heuristic for server-side PDF) that feed it. This is the literal "single deterministic module" the milestone asks for.
3. A signature-display data helper (new — no existing renderer reads `estimate_signatures.signer_name`/`signature_data`/`signed_at` for display) + per-family signature-block renderers (one DOM component, one react-pdf JSX fragment — cannot be literally the same component across renderer families)
4. `components/workspace/estimate/estimate-document-paginated.tsx` (or a `paginated` branch on the existing component) — a **spacer/chrome-overlay** on the existing continuous DOM tree (Google Docs/Word Online's technique), not a re-parenting of rows into discrete page `<div>`s. This is the recommended strategy specifically because it requires zero forking of the existing `dispatch`/`EditorItem`/`DocumentSectionBlock`/`dnd-kit` editing machinery — `estimate-document.tsx` is already 2037 lines and forking it would double the maintenance surface.
5. `VersionSlot` context extension (`viewMode`/`onViewModeChange`) in `estimate-version-context.tsx` — the existing state-bridge pattern that already threads `saveStatus`/`projectName` from `estimate-editor.tsx` to `project-header.tsx`, reused (not duplicated) for the new toggle.

A hard unit-conversion fact anchors all of this: react-pdf's `<Page size="LETTER">` resolves to **612×792pt at 72dpi**, while the existing webview `pageView` approximation uses **816×1056 CSS px at 96dpi** (`min-h-[1056px]`/`max-w-[816px]`, `estimate-document.tsx:1663-1670`). That's a **1.333× (96/72) mismatch** — any shared numeric design token must convert through this ratio exactly once, centrally, never as a hand-copied raw literal in both a Tailwind class and a `StyleSheet.create()` value.

### Critical Pitfalls

1. **Chasing pixel-perfect dual-engine WYSIWYG is a doomed goal** — the browser's CSS text layout and react-pdf's Yoga+fontkit engine are different implementations reading different metric sources; they will never independently converge on identical line-wraps. Build ONE shared deterministic module that DECIDES breaks; both renderers PLACE content according to that decision, never running their own layout engine to discover breaks. This is the milestone's central architectural correction, echoed independently by all four research files.

2. **The webview does not render a signature block or photo captions today either** (a direct correction to PROJECT.md's framing) — zero renderers across all 4 surfaces display `estimate_signatures.signature_data`/`signer_name`/`signed_at`, and photo captions are set only as inert `alt` text nowhere as visible text. This is net-new data plumbing (a new query) plus net-new rendering on all four surfaces, not a "copy the webview" task — plan effort accordingly.

3. **The 3 PDF call sites are already at divergent parity, and converging them wrong reproduces the same bug in a new place** — `pdf/route.ts` correctly resolves template + applies the signed snapshot; `send/route.ts` and `pdf-delivery.ts` do neither (both hardcode Classic, both render live post-signature-edited content, both violate TRUST-01 today). The fix must be one shared, importable resolver function (not three copy-pasted blocks, and never an internal `fetch()` to the HTTP route — `pdf-delivery.ts` runs in a cookie-less Inngest/webhook context and would fail silently only in production).

4. **Reflow thrash and focus loss in the paginated editor** — `estimate-document.tsx` has zero memoization across 2037 lines today; layering repagination on every keystroke will visibly lag or freeze on larger estimates, and naive page-scoped React keys will cause focus/cursor loss when an edit pushes an item across a page boundary mid-typing. Decouple live input value from a debounced pagination trigger, and key every editable row by stable item id, never by page+index.

5. **Font/unit mismatches silently corrupt the shared page-break math before content is even measured** — the 1.333× px/pt ratio, and registering a *different* font file than the DOM loads (even under the same family name), both produce wrap-point divergence with no compiler warning. Both must be centralized through one conversion constant and one set of shared TTF font files, set up once at module scope (not per-request — non-deterministic if colocated with the render call).

## Implications for Roadmap

Architecture research (Q6) already proposes a dependency-ordered build sequence, cross-validated by Pitfalls' phase-mapping table and Features' dependency graph — all three converge on the same structure. Recommended roadmap:

### Phase 1: Shared Document Engine + Standalone Send-Path Fix
**Rationale:** Every later phase (parity content, pagination, paginated editor) depends on the shared `lib/estimate/document/` model existing first — building pagination or signature rendering against the current 4-independent-copies structure would re-derive every rule twice. The send-path fix is a genuinely independent, already-proven-pattern bugfix (copy `pdf/route.ts`'s template-resolution + snapshot-application logic) that can ship first as a fast, low-risk trust win.
**Delivers:** `lib/estimate/document/{model,labels,format,tokens}.ts` extracted from the 4 existing files (byte-identical golden-snapshot output required); `send/route.ts` and `lib/whatsapp/pdf-delivery.ts` fixed via one shared in-process resolver function (never HTTP fetch).
**Addresses:** the milestone's "shared document engine" target feature; fixes the live TRUST-01 violation (signed estimates sent via email/WhatsApp render unsigned/stale content).
**Avoids:** Pitfall 2 (px/pt unit confusion — centralize the conversion constant here), Pitfall 11 (react-pdf leaking into client bundles / DOM assumptions leaking into PDF templates — get the data-vs-JSX boundary right at the foundation), Pitfall 12/13 (3 divergent PDF paths, and the HTTP-fetch trap that breaks prod webhook sends).

### Phase 2: PDF Parity Content — Signature Block + Photo Captions
**Rationale:** Depends on Phase 1's shared model existing. Non-paginated, lower-risk than the pagination engine, and its output (a defined, atomic signature-block shape) is a prerequisite input to the pagination engine's block inventory in Phase 3 — do this before finalizing pagination's atomic-block list.
**Delivers:** new signature-display data query (`signer_name`/`signature_data`/`signed_at`), per-family signature-block renderers wired into all 4 document surfaces AND both send paths; `photo.caption` rendered as visible text (not just `alt`) across all 4 surfaces.
**Addresses:** the milestone's "PDF parity with webview benchmark" target feature — corrected per Architecture research to be net-new on all 4 surfaces, not a copy job.
**Avoids:** Pitfall 9 (one failed remote image — pre-resolve signature/photo signed URLs server-side in `Promise.all`, degrade gracefully on individual failure, standardize TTL across the 3 PDF paths instead of the current 1h/24h inconsistency).

### Phase 3: Consolidated Pagination Engine
**Rationale:** Depends on Phase 1 (shared model) and benefits from Phase 2 (signature block defined as an atomic unit). Independent of the paginated editor UI — this phase's output (the rule engine + PDF wiring) is what "PDF and paginated web preview mirror each other" actually means, and it should be provably correct before any editable UI is layered on top. Include the early browser-vs-fontkit measurement-drift spike as the first step of this phase, not a separate pre-phase — it directly determines the height-estimation formula the rest of the phase depends on.
**Delivers:** `lib/estimate/pagination/{types,engine,blocks-from-model}.ts` (pure, fixture-tested rule engine: never split a row, header keeps with first row, subtotal keeps with last row, totals/photos/signature atomic), `measure-pdf.ts`, and both PDF templates driven by explicit `break` props at the engine's computed boundaries — replacing react-pdf's implicit `wrap`/`fixed`/`minPresenceAhead` reflow as the primary decision-maker.
**Uses:** `fontkit`+`linebreak` (promoted to direct deps) for server-side height estimation; the same registered TTF fonts (Inter classic / serif modern) in both react-pdf and the DOM.
**Implements:** the `computePageBreaks(blocks, constraints)` contract (Architecture Q2) — the single deterministic module shared by both engines via different measurement providers.
**Avoids:** Pitfall 1 (pixel-perfect chasing — explicitly define success as "same items per page," not visual identity), Pitfall 3 (text-wrap/hyphenation divergence — same font files, safety margin in height estimates), Pitfall 4 (non-deterministic font/hyphenation setup — module-scope registration, determinism regression test), Pitfall 10 (don't lean on `minPresenceAhead`'s documented upstream combinatorial bugs — #2238, #2659, #2595 — as the primary keep-together mechanism).

### Phase 4: Paginated Editable Editor Mode
**Rationale:** Depends on Phase 3's rule engine existing and being provably correct — building the editable UI against an unproven pagination contract risks visible UI rework. This is the highest-complexity phase in the milestone (per Features' prioritization matrix) and should get dedicated performance/UX test budget, not be treated as "just wire up the toggle."
**Delivers:** `measure-dom.ts` (live `ResizeObserver` provider) + a spacer/chrome-overlay paginated layout wrapper on the existing continuous DOM tree (zero forking of `dispatch`/`EditorItem`/`DocumentSectionBlock`/`dnd-kit`); the two-icon header toggle in `project-header.tsx`, wired through an extended `VersionSlot` context; retirement of the old floating-pill "Full page/Full width" toggle and its `viewMode` CSS-zoom mechanism in `estimate-editor.tsx`/`estimate-floating-actions.tsx` (consolidate, do not duplicate — two competing toggles risks visible drift).
**Addresses:** the milestone's "paginated editor mode" target feature — full inline editing preserved, letter-size page rendering.
**Avoids:** Pitfall 5 (reflow thrash — decouple live typing from debounced repagination, memoize per-item/section height inputs), Pitfall 6 (focus loss on cross-page moves — stable item-id React keys, defer visual re-slotting to blur/idle), Pitfall 7 (drag-and-drop across page boundaries — keep `dnd-kit` `SortableContext` scoped to the logical unpaginated order; page assignment is a derived read-only projection, never a `page_number` persisted field), Pitfall 14 (GUARD-03 math regression during this large refactor — every money value must trace back to `compute-totals.ts`, gated by the existing golden-value regression suite after every incremental extraction step).

### Phase 5: Webview Design Polish
**Rationale:** Independent, best done after Phase 1 so it inherits the shared design tokens rather than needing its own later reconciliation. Lowest-risk, most deferrable phase — the reference design image is explicitly pending per PROJECT.md, so structure this phase to absorb that reference whenever it arrives rather than blocking on it.
**Delivers:** general visual refinement pass on `estimate-document.tsx`/`estimate-document-modern.tsx` using the Phase 1 token source.

### Phase Ordering Rationale

- Shared model (Phase 1) must exist before anything else can avoid re-deriving rules from 4 independently-diverged copies — this is a hard dependency every other phase inherits.
- The send-path fix rides inside Phase 1 specifically because it is provably independent (copies an existing, already-correct pattern) and delivers standalone trust value fast — no reason to gate it behind pagination work.
- Parity content (Phase 2) precedes the pagination engine (Phase 3) because the engine's atomic-block inventory needs the signature block defined first, per Architecture's explicit dependency note.
- Pagination engine (Phase 3) precedes the paginated editor (Phase 4) because the editor is UI built on top of a rule engine contract — validating the engine in isolation (fixture tests, PDF-only wiring) before adding live DOM measurement and editable-UI complexity avoids compounding two hard problems into one phase.
- Design polish (Phase 5) is sequenced last/parallel because it has no hard dependents and should inherit tokens rather than precede them.
- This order also naturally sequences pitfall avoidance: unit/font determinism foundations (Phase 1, Phase 3) are locked in before the highest-complexity, highest-pitfall-count phase (Phase 4, which alone accounts for 4 of the 5 "critical pitfalls").

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Consolidated Pagination Engine):** the browser-vs-fontkit measurement-determinism question is explicitly flagged LOW confidence / unverified by Stack research — no source directly benchmarks this. The spike itself is the research; budget it as a discrete early step with a clear go/no-go on the height-estimation formula before building the rest of the engine.
- **Phase 4 (Paginated Editable Editor Mode):** live-reflow-while-typing internals for comparable products (CKEditor 5 Pagination specifically) are sparsely documented by vendors and triangulated from general WYSIWYG-editor guidance (flagged LOW in Features research) — the debounce/re-slotting strategy will likely need empirical tuning against Xtimator's actual estimate-editor performance characteristics, not just literature.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Shared Document Engine + Send-Path Fix):** the extraction pattern and the send-path bugfix both copy an already-proven in-repo pattern (`pdf/route.ts`) — well-documented by direct codebase evidence, HIGH confidence throughout.
- **Phase 2 (PDF Parity Content):** signature/caption rendering is straightforward React/react-pdf JSX work once the data query exists; no novel technical risk.
- **Phase 5 (Webview Design Polish):** standard visual refinement work, explicitly deferred pending a reference design.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | react-pdf API surface and dependency graph verified against official docs + live `npm view` queries (HIGH); cross-renderer text-measurement determinism is engineering inference with no direct benchmark found (LOW) — the recommended early spike exists specifically to close this gap |
| Features | MEDIUM-HIGH | Page-break mechanics (never-split-row, keep-with-next/previous, repeating headers) are well-documented and cross-checked across MDN/react-pdf docs/multiple vendor sources; live-reflow-while-typing internals for the closest competitor (CKEditor 5) are vendor-blog-level detail only, not internals-verified (LOW for that sub-claim) |
| Architecture | HIGH | Every claim grounded in direct file reads with line-number citations across the actual repo, not inferred from the milestone description; includes two explicit corrections to PROJECT.md's own framing (signature block, photo captions) discovered by grep |
| Pitfalls | MEDIUM-HIGH | Codebase evidence (existing bugs, existing gaps, existing unmemoized component) is HIGH confidence (read directly); react-pdf/Yoga internal-bug claims (`minPresenceAhead` combinatorial issues) are MEDIUM — real, findable GitHub issues, but current-version status in `4.5.1` is unconfirmed, treated as "known risk class" not "definitely still broken" |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Cross-renderer measurement determinism (LOW confidence):** no source benchmarks browser-rendered vs. fontkit-computed line-wrap agreement for identical text/font/width. Resolve via the recommended early spike in Phase 3 before committing the pagination engine's height-estimation formula — this is the single biggest unresolved technical risk in the milestone.
- **"Prepared by" field asymmetry:** present in both PDF templates today but absent from both webviews — not explicitly required by the milestone's parity list. Flag as an open product decision for planning rather than assuming it must be added to the webview.
- **Estimate Terms structural placement:** rendered as a page-wrapper sibling in the webview vs. inside the document's `termsSection` in the PDF — content is present everywhere (not a missing-feature gap), but the roadmap should make one explicit decision (recommend: keep it a page-level webview concern, mirrored by a terms-block append in the PDF) rather than leaving it ambiguous into Phase 2 planning.
- **Live-reflow debounce strategy specifics:** general WYSIWYG-editor guidance (300-500ms debounce norm) is a starting point, not a validated number for this codebase's actual component performance — budget explicit profiling in Phase 4 rather than treating the literature number as final.
- **minPresenceAhead/fixed/wrap current-version bug status:** the cited upstream GitHub issues (#2238, #2659, #2595, #955) are real but their exact status against the recommended `4.5.1` is unconfirmed — treat as a risk class to design around (explicit precomputed breaks as primary, native props as redundant fallback only), not as a definitively-still-broken blocker to re-verify before starting.

## Sources

### Primary (HIGH confidence)
- `https://react-pdf.org/components`, `/fonts`, `/advanced`, `/rendering-process` — official react-pdf docs, fetched live (props, `Font.register`, TTF/WOFF support, Yoga/points-based layout)
- `npm view @react-pdf/renderer versions` / `npm view <pkg> dependencies` — live npm registry ground truth for installed/available versions and the fontkit/linebreak transitive-dependency graph
- Direct repository reads with line-number citations: `components/pdf/estimate-pdf.tsx`, `estimate-pdf-modern.tsx`, `components/share/estimate-document-modern.tsx`, `components/workspace/estimate/estimate-document.tsx`, `estimate-editor.tsx`, `estimate-floating-actions.tsx`, `app/api/estimates/[id]/pdf/route.ts`, `send/route.ts`, `lib/whatsapp/pdf-delivery.ts`, `lib/estimate/{compute-totals,presentation-settings,deposit-display}.ts`, `lib/estimate/templates/registry.ts`, `lib/queries/share.ts`, `components/workspace/{project-header,estimate-version-context}.tsx`, `.planning/PROJECT.md` (v4.23 section)
- `https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Paged_media` — official CSS Paged Media spec
- `https://github.com/diegomura/react-pdf-site/blob/master/docs/page-wrapping.md` — official library source docs (`wrap`, `break`, `fixed`)

### Secondary (MEDIUM confidence)
- PandaDoc, Canva, Google Docs official help-center/vendor docs — continuous/paginated toggle UX conventions
- diegomura/react-pdf Issue trackers #2658, #2659, #2238, #955, #2595, #2099, #827, #2651, #1253, #2460, #3074, #464 — community/maintainer issue threads on minPresenceAhead, renderToBuffer event-loop blocking, and remote Image failure modes
- CKEditor 5 Pagination vendor blog — live-reflow design goal claimed, internals not disclosed
- diegomura/react-pdf discussion #2073 — WOFF2 rendering caveat

### Tertiary (LOW confidence)
- QuickBooks Community forum thread on broken PDF line-wraps — illustrates real-world pain point, not authoritative spec
- Cross-renderer text-measurement determinism claim — no direct source found; flagged as requiring an empirical spike, not treated as verified

---
*Research completed: 2026-07-27*
*Ready for roadmap: yes*
