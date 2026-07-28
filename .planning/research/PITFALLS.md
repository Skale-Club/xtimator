# Pitfalls Research

**Domain:** Unifying a DOM webview and `@react-pdf/renderer` PDF engine onto one shared document structure with deterministic, mirrored pagination, plus a new editable paginated editor mode (Xtimator v4.23 Unified Estimate Document Engine)
**Researched:** 2026-07-27
**Confidence:** MEDIUM-HIGH (codebase evidence is HIGH confidence — read directly from the repo; react-pdf/Yoga internals are MEDIUM — WebSearch + training knowledge, Context7 was unavailable in this research session)

## Codebase Baseline (grounds every pitfall below)

- `components/pdf/estimate-pdf.tsx` (860 lines) and `components/pdf/estimate-pdf-modern.tsx` (861 lines) are independent, duplicated `@react-pdf/renderer` trees — zero shared layout code with each other or with the webview.
- `components/workspace/estimate/estimate-document.tsx` is **2037 lines**, is the editable webview, uses a custom `useEstimateReducer`/`dispatch` model (NOT react-hook-form), has **zero `useMemo`/`useCallback`** anywhere in the file, and already has two separate `dnd-kit` `DndContext`/`SortableContext` pairs (one for sections, one for items-within-a-section at lines 838 and 1875).
- `components/share/estimate-document-modern.tsx` (579 lines) is the read-only share webview and design benchmark.
- An existing `pageView?: boolean` prop ("Quick-260718-p3v", `estimate-document.tsx:404-407, 1664-1665`) already renders a "print-preview letter sheet" — but it is **cosmetic only**: a single continuous `min-h-[1056px]` / implied `max-w-[816px]` box at **96dpi CSS px** (11in × 96 = 1056, 8.5in × 96 = 816). It does not compute real page breaks.
- `estimate-pdf.tsx:491` uses `<Page size="LETTER">`, which react-pdf resolves to **612 × 792pt at 72dpi** — a **1.333× (96/72) unit mismatch** against the webview's existing 816/1056px approximation. Any shared numeric design token must convert through this ratio explicitly.
- Fixed header/footer already exist in the classic PDF (`estimate-pdf.tsx:492-495` header `fixed`, `~852` footer `fixed`).
- `app/api/estimates/[id]/pdf/route.ts` is the **only one of three PDF call sites already done right**: it resolves `templateId` from `company.estimate_template_style`, applies `applySignedSnapshot()` over `loadLatestSignedSnapshot()` (TRUST-01), and resolves photo signed URLs (1-hour TTL) server-side before constructing the element tree.
- `app/api/estimates/[id]/send/route.ts:7,192-200` (email attach) **hardcodes `EstimatePDF`** (Classic only) and renders straight from the **live** `estimate` object — no `applySignedSnapshot`, no template lookup. This is a live, confirmed bug today, not a hypothetical.
- `lib/whatsapp/pdf-delivery.ts:15,48-56` **also hardcodes `EstimatePDF`**, also skips `applySignedSnapshot`, and its own header comment explicitly forbids calling the `/api/estimates/[id]/pdf` route internally because the webhook/Inngest caller context has no auth cookies (`createClient()` would fail). Its signed photo-URL TTL is 24h (86400s) vs. the download route's 1h (3600s) — an existing inconsistency, not yet a bug, but a trap for anyone assuming the two are interchangeable.
- Some non-visual logic is already correctly shared across DOM and PDF today (`SYSTEM_COLORS`, `formatMoney`, `deriveDepositDisplay`, `resolvePresentationSettings`/`isSectionVisible`) — proof that pure-data/pure-function sharing works; the milestone's job is to extend this pattern to structure/layout decisions, not to invent it from scratch.
- `lib/estimate/compute-totals.ts` is the GUARD-03 server-authoritative math module — no financial arithmetic should ever move into `estimate-document.tsx`, the PDF templates, or the new pagination module.

## Critical Pitfalls

### Pitfall 1: Chasing Pixel-Perfect Dual-Engine WYSIWYG Is a Doomed Goal

**What goes wrong:**
Trying to make the browser (CSS text layout, subpixel font hinting, kerning tables from the *installed/loaded webfont*) and react-pdf (Yoga flexbox + its own glyph-metrics text engine reading embedded TTF/AFM data) independently compute the **exact same line-wrap and page-break points** for the same content. They almost never will, even at identical font-size/line-height/width, because the two are different text-layout implementations reading different metric sources.

**Why it happens:**
It's the intuitive first approach — "render both from the same JSX-like structure and they'll agree" — because both use flexbox-shaped APIs (`<View>`≈`<div>`, `<Text>`≈`<span>`), which hides how different their line-breaking algorithms actually are underneath.

**How to avoid:**
Don't let either engine be the source of truth for **where breaks fall**. Build ONE shared, deterministic pagination module that decides break points from a conservative height estimation model (per-row/per-block height budget with safety margin) or, better, from precomputed explicit break indices baked into the document's rendered structure. Both the DOM paginated preview and the react-pdf renderer then *place* content according to that single precomputed plan — they don't each run their own layout engine to *discover* breaks. Treat "the two engines emergently agree" as an anti-goal.

**Warning signs:**
Any design that says "we'll fine-tune CSS and react-pdf styles until they line up" without a single arbiter module; a spec that asks for `<1px` pixel parity between the two renders instead of "same items on the same page, in the same order."

**Phase to address:**
The Consolidated Page-Break Rule phase (the milestone's own "central open question") — must ship BEFORE the paginated editor mode and PDF parity phases, since both consume its output.

---

### Pitfall 2: px vs pt Unit Confusion Corrupts the Page Canvas Itself

**What goes wrong:**
`estimate-pdf.tsx` already uses `<Page size="LETTER">` → **612 × 792pt at 72dpi**. The existing `pageView` webview toggle approximates Letter at **816 × 1056 CSS px at 96dpi** (`estimate-document.tsx:1664-1665`). 96/72 = 1.333. If a shared design-token value (padding, row height, font size) is copied 1:1 between the two without converting through this ratio, the *page itself* is a different physical size in the two renderers before a single line of content is even measured — every downstream break calculation is then comparing apples to oranges.

**Why it happens:**
Both APIs accept bare numbers with no unit suffix in the style object, so `padding: 24` "looks" portable between a Tailwind/CSS `<div>` and a react-pdf `<View>` even though CSS resolves it as 24px (96dpi) and react-pdf resolves it as 24pt (72dpi) — a silent 33% size difference with no compiler warning.

**How to avoid:**
Centralize a single conversion constant (`PT_PER_PX = 72/96` or its inverse) in the shared design-token module, and pick ONE canonical unit for the token source (recommend pt, since that's what defines the actual page geometry: 612×792). Every consumer — the DOM paginated preview's inline styles/CSS variables AND the react-pdf `StyleSheet` — derives from that same source through the same conversion function, never a hand-copied literal.

**Warning signs:**
Any PR that hardcodes a raw number in both a Tailwind class/inline style AND a react-pdf `StyleSheet.create` value without going through a shared token; visually "close but subtly larger/smaller" PDF output compared to the paginated preview during side-by-side review.

**Phase to address:**
Shared Document Engine / design-token phase — this is foundational and blocks the page-break rule phase, since page-break math is meaningless if the two renderers disagree on page dimensions.

---

### Pitfall 3: Text-Wrapping and Hyphenation Differences Break Line-Level Mirroring

**What goes wrong:**
Even with identical page dimensions and font sizes, the browser's Unicode/ICU line-breaking (plus whatever webfont is actually loaded in that browser) and react-pdf's own text-layout engine (reading the *registered* TTF/AFM font) can wrap a long line differently — especially on long unbroken tokens (URLs in notes, SKUs, long client addresses, long line-item descriptions). One engine hyphenates or breaks a word the other doesn't.

**Why it happens:**
`@react-pdf/renderer`'s text layout converts characters to glyphs using the *specific font it has registered* (via `Font.register`) — if that isn't the *exact same font file/weight* the browser is using (not just the same font-family name — different subsetted webfont vs. desktop-installed vs. bundled TTF can have different kerning/width tables), glyph widths differ, so wrap points differ even at identical content and container width.

**How to avoid:**
Register the SAME font files (same TTF, same weights) in react-pdf that the DOM preview loads via `next/font` or `@font-face`, not a same-named-but-different-source font. Add a safety margin to the shared pagination module's per-line width estimate rather than trusting exact character-width equality between engines. For any field prone to long unbroken tokens (URLs, SKUs), apply an explicit break-opportunity strategy (word-break/overflow-wrap equivalent) consistently in both renderers rather than relying on hyphenation to save the day.

**Warning signs:**
A long client address or item description that wraps to a different number of lines in the paginated preview vs. the PDF — this cascades into different page-break positions for everything after it.

**Phase to address:**
PDF Parity phase (font registration) in coordination with the Page-Break Rule phase (safety-margin estimation) — flag both PDF templates for a font audit (are Classic and Modern currently registering the same fonts as each other, let alone as the webview?).

---

### Pitfall 4: Non-Deterministic Font Registration / Hyphenation Breaks the "Preview Mirrors PDF" Contract Across Requests

**What goes wrong:**
If `Font.register` or a custom `hyphenationCallback` is set up per-request (inside the route handler) instead of once at module scope, or if the hyphenation logic depends on non-pinned locale data or any non-pure input, two renders of the identical estimate content can produce *different* line breaks on different requests. That silently breaks the core promise of this milestone (deterministic, mirrored pagination) — a customer viewing the paginated preview then downloading the PDF a minute later could see the pages disagree even though nothing about the estimate changed.

**Why it happens:**
It's easy to colocate registration with the render call "for locality," and to reach for `Intl`-based or environment-dependent word-break heuristics without realizing they aren't guaranteed stable across Node versions/ICU data.

**How to avoid:**
Register fonts and any hyphenation callback exactly once at module load (top-level, outside the request handler), and keep the callback a pure function of the input word only (no environment/locale lookups beyond a hardcoded, pinned rule set). Add a regression test that renders the same estimate content twice and asserts byte-identical (or break-index-identical) output.

**Warning signs:**
Flaky PDF-vs-preview parity tests that fail intermittently rather than deterministically; font registration code living inside `app/api/estimates/[id]/pdf/route.ts`'s request handler instead of a shared module-scope initializer.

**Phase to address:**
Shared Document Engine phase (font/hyphenation setup should be a single shared initializer imported by both PDF templates) — add a determinism test as an explicit success criterion, not an afterthought.

---

### Pitfall 5: Reflow Thrash on Every Keystroke in the Paginated Editor

**What goes wrong:**
`estimate-document.tsx` today has **zero memoization** across its 2037 lines and re-renders the whole tree on every controlled-input `onChange` via `dispatch`. Layering "recompute page breaks" on top of that (measuring row heights or re-running the shared pagination module) on every keystroke will make typing in the paginated mode visibly laggy or freeze on larger estimates, because a single-character edit in one item can cascade into a full re-pagination of every page after it.

**Why it happens:**
The natural implementation is "repaginate whenever content changes" wired directly to the same `dispatch` that already drives every input's `onChange` — with no debouncing or decoupling between "the value the user is typing" and "the value that feeds pagination."

**How to avoid:**
Decouple live input value (updates instantly, no repagination) from the pagination-triggering value (debounced/deferred, e.g., on blur, on a `useDeferredValue`/idle-callback boundary, or throttled). Memoize per-item/per-section height inputs so an edit in item 40 doesn't force height recalculation of items 1-39. This is also the moment to introduce the memoization this component currently lacks entirely — don't let pagination be the second missing-memoization debt layered onto the first.

**Warning signs:**
Visible input lag or dropped keystrokes when typing in the paginated mode on an estimate with many line items; the whole page-break plan being recalculated from scratch on every render in DevTools Profiler.

**Phase to address:**
Paginated Editor Mode phase — should budget explicit performance testing against a large (many-item, many-section, many-photo) estimate before shipping, not just a demo-sized one.

---

### Pitfall 6: Focus Loss When Repagination Moves the Edited Item to Another Page

**What goes wrong:**
When an edit grows an item's height enough to push it (and everything after it) onto the next page box, if the paginated layout re-renders that item as a *new* DOM node in a different page container (rather than the same node being visually relocated), the input loses focus and cursor position mid-keystroke — a jarring, data-loss-feeling bug (the user's next keystrokes go nowhere or into the wrong field).

**Why it happens:**
Naive pagination implementations map "which page does item N belong to" freshly on every render and key/render page contents by page-index-then-item-index, so React sees a different key path for the same logical item once its page assignment changes, and re-mounts it.

**How to avoid:**
Key every editable row by a STABLE item id (not by page+index), independent of which page box it currently renders inside, so React's reconciliation preserves the DOM node (and hence focus) across a page-boundary move. Consider deferring the *visual* page reassignment slightly (e.g., only re-slot on blur, not on every keystroke) so an in-progress edit isn't visually relocated while the user is still typing in it.

**Warning signs:**
Cursor jumps to the start/end of a field, or focus drops to the document body, when a user's edit causes a nearby page break to shift while they're still typing.

**Phase to address:**
Paginated Editor Mode phase — this should be an explicit test case ("type a long value that pushes the item across a page boundary; verify focus/cursor position survive"), not something caught only in manual QA.

---

### Pitfall 7: Drag-and-Drop Across Page Boundaries Has No Existing Primitive to Reuse

**What goes wrong:**
The existing `dnd-kit` setup has two independent `DndContext`/`SortableContext` pairs (sections; items-within-a-section). Pagination adds a THIRD grouping axis — visual page membership — that is *derived* from content, not stored data. A naive port would try to make page-scoped `SortableContext`s, which breaks reordering across a page boundary (dropping the last item of page 1 onto page 2) because dnd-kit's sortable strategy assumes a stable list per context, and page membership changes as a side effect of *any* edit, not user intent.

**Why it happens:**
It's tempting to mirror the visual page layout in the data structure (e.g., "sections grouped by page") because that's how the UI looks — but the underlying section/item order is the single source of truth, and page assignment must be a pure, recomputed *projection* of that order plus the shared pagination module, never something dnd-kit's drop targets are allowed to mutate directly.

**How to avoid:**
Keep the SAME single flat/nested ordering data model (sections → items) that drives both the full-width and paginated views; the pagination module computes page assignment as a derived read-only property for rendering only. Drag targets stay scoped to the logical (unpaginated) order — dropping "near the bottom of what's visually page 1" should insert at the correct logical position, and the next repagination pass naturally reflows the pages. Do not add a `page_number` column/field to items or sections.

**Warning signs:**
Any schema or reducer-action change that persists a page number on an item/section; drag interactions that work fine within a page but silently fail or reorder incorrectly when dragged across a visual page boundary.

**Phase to address:**
Paginated Editor Mode phase, in explicit coordination with the Page-Break Rule phase (which owns "what page is item N on" as a pure function of order + content, not stored state).

---

### Pitfall 8: `renderToBuffer` Blocks the Node.js Event Loop — and This Milestone Makes Renders Bigger

**What goes wrong:**
`@react-pdf/renderer`'s `renderToBuffer` (used today in all three PDF call sites: `pdf/route.ts`, `send/route.ts`, `pdf-delivery.ts`) is CPU-bound and runs on the single Node.js thread — it's a documented upstream limitation (diegomura/react-pdf issue trackers describe it hogging the main thread and causing request timeouts under concurrent load). This milestone is adding MORE content per render (signature images, photo captions, unified/richer layout) and a NEW consumer (the send-path fix routes both email and WhatsApp through the same converged renderer), which raises both per-render CPU cost and concurrent-render frequency at exactly the same time.

**Why it happens:**
It's invisible in local dev (one request at a time) and only shows up under real concurrent traffic (multiple estimates being emailed/sent/downloaded around the same moment), so it's easy to ship without noticing.

**How to avoid:**
Don't treat this as something this milestone must fully solve (offloading to worker threads is a bigger infrastructure change), but DO: (1) avoid making renders unnecessarily larger than needed (e.g., don't re-render a PDF from scratch when the existing ETag/cache logic in `pdf/route.ts` already avoids it — extend that caching discipline to the new send-path resolver rather than bypassing it), and (2) flag this as a known scaling constraint in the phase that converges all 3 PDF paths, so a future milestone has a paper trail if concurrent-send volume becomes a real bottleneck.

**Warning signs:**
Slow or timed-out unrelated API requests during a burst of estimate sends/downloads; production latency spikes correlated with PDF generation volume.

**Phase to address:**
Send-Path Correctness phase (don't triple the blocking cost by wiring three converging call sites to a heavier unified template without reusing the existing caching pattern).

---

### Pitfall 9: One Failed Remote Image Fails the Entire PDF Render

**What goes wrong:**
react-pdf's `<Image>` component fetching a remote URL (a signed Supabase Storage URL for a photo or, newly, a signature image) that 404s, times out, or hits a transient network blip throws and **aborts the whole `renderToBuffer` call** — not just that one image. Today this risk is scoped to attached photos; this milestone adds signature images as a NEW remote-image source, doubling the surface area, and the signed-URL TTLs are already inconsistent across paths (1h in `pdf/route.ts`, 24h in `pdf-delivery.ts`) — meaning a signature/photo whose signed URL happens to be closer to expiry (or resolved with a shorter TTL) is more likely to trip this failure mode in one call site than another.

**Why it happens:**
It's natural to pass the storage row's signed URL straight into `<Image src={url}>` and assume "if it worked in the browser preview, it'll work here" — but react-pdf's fetch has no visibility into the same CORS/network context.

**How to avoid:**
`pdf/route.ts` already resolves photo signed URLs server-side, in a `Promise.all`, BEFORE constructing the element tree (`pdf/route.ts:124-132`) — extend this exact pattern to signature images in all 3 call sites, and wrap each per-image resolution so an individual failure degrades gracefully (omit that one image, log it) rather than throwing out of the whole render. Standardize the signed-URL TTL across all 3 PDF paths as part of the send-path convergence work, rather than leaving 1h vs 24h as an accident of which file was written first.

**Warning signs:**
A signed estimate PDF that intermittently fails to generate/send with no clear pattern; error logs showing `renderToBuffer` throwing on an image-fetch error rather than a template/data error.

**Phase to address:**
PDF Parity phase (signature image block) and Send-Path Correctness phase (converging the 3 call sites) — both must inherit the pre-resolve-then-render pattern, not just the download route.

---

### Pitfall 10: `minPresenceAhead` / `fixed` / `wrap` Have Known Upstream Combinatorial Bugs — Don't Depend on Emergent Behavior

**What goes wrong:**
react-pdf's own widow/orphan-control primitives have open, documented bugs: `minPresenceAhead` combined with `fixed` elements doesn't work as expected (diegomura/react-pdf #2238), and certain combinations of padding/margin/`break` with `minPresenceAhead` have caused infinite-loop hangs in the layout pass (#2659). The milestone's explicit rules ("never split a line item," "section header keeps with first row," "subtotal keeps with last row," "totals/photos blocks keep together") map naturally onto these props — but leaning on them as the *primary* mechanism risks inheriting upstream instability, especially once fixed headers/footers (already present) interact with new fixed elements this milestone might add (e.g., a fixed footer beneath a keep-together totals block).

**Why it happens:**
These props look purpose-built for exactly this milestone's break rules, so it's the obvious first reach — but they're heuristics inside react-pdf's own layout pass, which is precisely the "emergent per-engine layout" this milestone is trying to move away from (see Pitfall 1).

**How to avoid:**
Prefer explicit break decisions computed by the SHARED pagination module (which page each block starts on, e.g., forcing a manual page break before a section that must start fresh) over relying on `minPresenceAhead`'s heuristic. Where `wrap={false}`/`fixed` are still used (e.g., today's fixed header/footer), keep them isolated from `minPresenceAhead` on the same subtree, and add a render-time smoke test for every "keep together" rule against a deliberately awkward test estimate (an item long enough to nearly-but-not-quite fit before a break) to catch pathological combinations before they ship.

**Warning signs:**
A PDF render that hangs or times out on a specific estimate shape; a "keep together" block that works in isolation but splits or overlaps once combined with the fixed header/footer.

**Phase to address:**
Page-Break Rule phase — the break-rule module's design should explicitly decide, per rule, whether it's implemented as an explicit precomputed break vs. a react-pdf native prop, rather than defaulting to native props everywhere.

---

### Pitfall 11: react-pdf Leaking Into Client Bundles, or DOM Assumptions Leaking Into the Server PDF Path

**What goes wrong:**
Two symmetric failure modes: (a) a "shared" module (design tokens, the pagination engine, or a literally-shared component) that imports anything from `@react-pdf/renderer` gets pulled into a `'use client'` file (e.g., `estimate-document.tsx`, the new paginated editor) — react-pdf's layout/font engine is not meant for browser bundling in this way and will bloat or break the client bundle; (b) conversely, a "shared" component written assuming `document`/`window`/Tailwind class names is imported into a PDF template, where react-pdf's `<View>`/`<Text>` tree has no DOM, no CSS cascade, and no React context (already noted in-repo: `estimate-pdf.tsx`'s own comment says "react-pdf runs server-side with no React context — plain lookups").

**Why it happens:**
"Shared structure" is easy to interpret as "share the literal JSX/component," which works for neither direction — `<div>`/`<span>` and `<View>`/`<Text>` are not interchangeable, and Yoga's default `flex-direction: column` (vs. the browser default `row`) means even superficially similar flex code behaves differently.

**How to avoid:**
Make the truly shared layer DATA, not JSX: a typed tree of section/row/block descriptors plus pure formatting/token functions (following the precedent already in place — `SYSTEM_COLORS`, `formatMoney`, `resolvePresentationSettings` are shared today with zero react-pdf or DOM imports). Each renderer (the DOM paginated preview, and each PDF template) has its own thin interpreter that turns that data into `<div>`s or `<View>`s respectively. Enforce the boundary with either a lint rule / import restriction (e.g., ESLint `no-restricted-imports` banning `@react-pdf/renderer` from client-marked files and vice versa) or at minimum a code-review checklist item, since Next.js won't always catch this at build time for shared utility modules that don't declare `'use client'`/`'use server'` themselves.

**Warning signs:**
Client bundle size jump after a refactor touching PDF templates; a new PDF template import failing to build with Yoga/native-binding resolution errors; a webview component suddenly needing `next/dynamic`+`ssr:false` to avoid pulling in server-only PDF code.

**Phase to address:**
Shared Document Engine phase — this is the architectural decision that determines whether every later phase (page-break rule, PDF parity, paginated editor) is buildable without cross-contamination. Get the data-vs-JSX boundary right here or every subsequent phase inherits the mistake.

---

### Pitfall 12: The 3 PDF Call Sites Are Already at Divergent Parity — Converging Them Wrong Reproduces the Same Bug in a New Place

**What goes wrong:**
Today, `pdf/route.ts` correctly resolves `templateId` and applies `applySignedSnapshot()`; `send/route.ts` and `pdf-delivery.ts` do neither (both hardcode `EstimatePDF`/Classic, both render from the live, possibly-post-signature-edited `estimate`). If the send-path fix is implemented as "copy `pdf/route.ts`'s logic into the other two files" rather than "extract `pdf/route.ts`'s resolve-template + apply-snapshot + resolve-signed-URLs logic into one shared helper function used by all three," the milestone will ship 3 near-identical-but-independently-maintained copies of trust-critical logic — the next person to add a 4th PDF surface (or to fix a bug in one) will silently miss the other two, exactly reproducing today's problem one refactor later.

**Why it happens:**
The three call sites have different function signatures and different available context (route handler with `createClient()` cookies vs. Inngest/webhook context with only a service client) — copy-paste feels like the path of least resistance to avoid touching call-site-specific auth/plumbing.

**How to avoid:**
Extract a single shared function — e.g., `resolveEstimatePdfElement(estimateId, supabase, { source: 'download' | 'send' | 'whatsapp' })` — that does exactly what `pdf/route.ts` does today (template lookup, `loadLatestSignedSnapshot` + `applySignedSnapshot`, signed photo/signature URL resolution) and returns the `createElement(...)` tree ready for `renderToBuffer`. All 3 call sites call this ONE function, differing only in how they obtain their Supabase client and what they do with the resulting buffer. Add a shared regression test that asserts all 3 call sites produce byte-identical PDF bytes for the same signed estimate (proving true convergence, not just "looks similar").

**Warning signs:**
A code review that adds template/signature logic to `send/route.ts` and `pdf-delivery.ts` as separate, similar-but-not-identical blocks rather than a shared import; any future PDF-affecting bug fix that touches only one of the three files.

**Phase to address:**
Send-Path Correctness phase — this is the phase's actual acceptance bar: not "email now supports templates" but "all 3 call sites call the same resolver function."

---

### Pitfall 13: Deduplicating pdf-delivery.ts Into the HTTP Route Silently Breaks Production Webhook Sends

**What goes wrong:**
`lib/whatsapp/pdf-delivery.ts`'s header comment is explicit: it must NEVER call `/api/estimates/[id]/pdf` internally, because that route's `createClient()` requires auth cookies that don't exist in the Inngest/webhook execution context that calls this file. When converging the 3 PDF paths (Pitfall 12), a plausible-looking simplification is "just have all 3 call the existing route via `fetch()`" — this will pass every test run from an authenticated browser/dev session and fail (401) only in production webhook-triggered sends, which is exactly the kind of gap that reaches prod undetected (this project has prior history with silent Inngest-context failures — see `.planning/debug/whatsapp-inbound-no-reply-recurrence.md`).

**Why it happens:**
Route handlers are the natural, DRY-looking place to centralize logic in a Next.js app, and the cookie-dependency failure mode is invisible unless you specifically test from a cookie-less/service-role-only context.

**How to avoid:**
The shared resolver from Pitfall 12 must be a plain importable function (not an HTTP endpoint), taking an explicit `SupabaseClient` parameter (as `pdf-delivery.ts` already does) so both cookie-authenticated route handlers AND service-role webhook contexts can call it directly in-process. Never introduce an internal `fetch()` to `/api/estimates/[id]/pdf` from server code. Keep the existing header-comment warning (or a stronger lint/test guard) attached to whatever new shared module replaces `pdf-delivery.ts`'s direct-render logic.

**Warning signs:**
Any PR that adds a `fetch('/api/estimates/...')` call inside `lib/whatsapp/` or an Inngest function; WhatsApp PDF delivery working in manual/local testing but failing silently (or with a caught-and-swallowed error falling back to `share_link`, per the function's own doc comment) in production.

**Phase to address:**
Send-Path Correctness phase — should be called out explicitly as a non-negotiable constraint in that phase's plan, not left to be rediscovered.

---

### Pitfall 14: Refactoring the 2037-Line Editable Document Component Risks Reintroducing Client-Side Math

**What goes wrong:**
`estimate-document.tsx` is large and renders totals/subtotals/tax/discount/deposit values that must ALL originate from `lib/estimate/compute-totals.ts` (the GUARD-03 server-authoritative math engine) — never be recomputed inline during a UI refactor. A large structural refactor (splitting the file, extracting the shared document-tree data model, wiring in pagination) creates many opportunities to "helpfully" inline a derived value (e.g., recompute a section subtotal from visible rows for a paginated sub-view) that silently diverges from the server-computed total once any filtering/pagination view is involved.

**Why it happens:**
Once content is split across page boxes, there's a natural temptation to compute a per-page or per-section running total for display purposes locally, rather than always reading the pre-computed values threaded down as props — especially if the pagination module operates on a filtered/sliced view of the item list.

**How to avoid:**
Treat `compute-totals.ts` output as the ONLY source for every money value anywhere in the refactored tree, including inside the new pagination-aware rendering paths — the pagination module's job is to decide *where the pre-computed row/section values are drawn*, never to derive new ones. Keep (or add) an explicit regression test suite asserting the refactored component renders byte-identical totals to the pre-refactor component for the existing golden-value test estimates the project already has from prior GUARD-03-related milestones (e.g., the v4.11 pricing-model goldens). Run that suite as a gate before and after each incremental extraction step of the 2037-line file, not just once at the end.

**Warning signs:**
Any new `Math.round`/multiplication/addition of money fields appearing inside `estimate-document.tsx`, the paginated editor, or a PDF template during this milestone's diffs; a pagination-scoped subtotal that doesn't trace back to a `compute-totals.ts` field.

**Phase to address:**
Should be a standing constraint across every phase that touches `estimate-document.tsx` (Shared Document Engine extraction AND Paginated Editor Mode), verified by a goal-verifier / regression-test gate at the end of each phase, not a single "final" phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Reusing the existing `pageView` CSS toggle (96dpi px box) as the paginated editor's page container | Saves building new page-frame styling from scratch | Its dimensions are wrong for a real page-break engine (px vs pt mismatch, single continuous box not discrete pages) unless explicitly re-derived from the shared pt-based token source | Only as a visual/cosmetic starting point for page *chrome* (border, shadow), never as the source of page-break math |
| Relying on react-pdf's native `minPresenceAhead`/`wrap`/`break` props for ALL keep-together rules instead of explicit precomputed breaks | Less code, faster to prototype | Inherits documented upstream combinatorial bugs (hangs, unexpected interaction with `fixed`); non-portable to the DOM engine, which has no equivalent primitive | Acceptable for simple, isolated cases (e.g., a single `wrap={false}` block) that don't interact with `fixed` elements; never for the milestone's core cross-engine break contract |
| Estimating text-wrap height with a simple `lines = ceil(charCount / charsPerLine)` heuristic instead of true font-metric measurement | Fast, framework-agnostic, works identically in both engines | Inaccurate for variable-width fonts / mixed content (numbers, currency symbols, bold labels) — risks off-by-one-line break errors | Acceptable ONLY if paired with a generous safety margin and validated against real font metrics for the specific registered font, not blindly trusted |
| Copy-pasting the classic PDF template's structure into the modern template (as happened historically — both are ~860 lines, already diverged) | Fast to ship a second template | Every future fix must be applied twice, and the two silently drift (exactly the state PROJECT.md describes today) | Never acceptable going forward once the shared engine exists — this milestone's whole point is eliminating this pattern |
| Debouncing repagination on a fixed timer (e.g., 300ms) rather than a content-aware trigger | Simple to implement, avoids reflow thrash | Can feel laggy (breaks don't reflect the latest edit for up to 300ms) or, if too short, doesn't actually solve the thrash problem under fast typing | Acceptable as a v1 shipped behavior if paired with an on-blur/explicit "commit" repagination for correctness, not as the only mechanism |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| `@react-pdf/renderer` `<Image>` with Supabase signed URLs | Passing a signed URL straight into `<Image src>` and letting a fetch failure abort the whole render | Pre-resolve all signed URLs server-side in a `Promise.all` before constructing the element tree (already the pattern in `pdf/route.ts:124-132`); degrade a single failed image gracefully rather than throwing |
| `@react-pdf/renderer` `Font.register` | Registering fonts/hyphenation callback inside the request handler | Register once at module scope; keep the hyphenation callback a pure function with no environment-dependent lookups |
| `dnd-kit` `SortableContext` | Creating a page-scoped sortable context that mirrors the visual pagination | Keep sortable contexts scoped to the LOGICAL (unpaginated) order; page assignment is a derived read-only projection, never a drop target's source of truth |
| Supabase signed URL TTLs across the 3 PDF paths | Assuming the 1h TTL in `pdf/route.ts` and the 24h TTL in `pdf-delivery.ts` are interchangeable when converging the paths | Standardize the TTL as part of the shared resolver (Pitfall 12); pick a TTL long enough for the slowest realistic delivery path (WhatsApp/email queuing), not the fastest |
| Next.js App Router server/client boundary | Importing the new shared pagination/design-token module without verifying it has zero `@react-pdf/renderer` or DOM-only dependencies before it's imported by a `'use client'` editor component | Keep the shared module free of both React DOM globals and react-pdf imports; add an import-boundary lint rule |
| Inngest/webhook execution context (WhatsApp send) | Calling an internal Next.js API route via `fetch()` from webhook-triggered server code (no auth cookies available) | Call shared logic in-process as a plain function taking an explicit `SupabaseClient`, never via an internal HTTP round-trip (Pitfall 13) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Un-memoized 2037-line `estimate-document.tsx` re-rendering entirely on every keystroke, now with pagination math layered on top | Visible input lag, dropped keystrokes, slow typing in the paginated editor | Memoize per-item/per-section height/content inputs; decouple live typing value from the (debounced) pagination-triggering value | Noticeable on estimates with roughly a dozen+ line items or multiple sections; severe on larger/multi-page estimates |
| `renderToBuffer` blocking the single Node.js event loop, now handling bigger documents (signature images, captions) from 3 converged call sites | Unrelated API requests slow down or time out during concurrent estimate sends | Keep/extend the existing ETag caching in `pdf/route.ts` to avoid redundant re-renders; avoid needlessly larger documents; consider flagging worker-thread offload as a future item if volume grows | Breaks under concurrent send bursts (multiple business owners emailing/WhatsApp-ing estimates around the same time), not single-user local testing |
| Recomputing the full page-break plan from scratch on every render instead of incrementally | Editor stutters as estimates grow past a handful of sections | Memoize per-block height/estimate computations keyed by content hash or item id; only recompute the tail of the plan from the first changed block forward | Scales badly past a few dozen line items / several photo blocks; fine for typical small estimates |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Resolving signature image signed URLs with an overly long TTL "to be safe" (mirroring `pdf-delivery.ts`'s existing 24h pattern) | A leaked/logged PDF URL grants extended access to a legally-significant signature image | Scope signature-image signed URLs to the shortest TTL that reliably covers the actual delivery window per channel, and standardize per-channel TTLs deliberately (not by copying whichever file was written first) |
| Treating the paginated editor's client-side page-break computation as authoritative for anything security/trust-relevant | None directly (it's a rendering concern), but conflating "what page it's on" with "what data is allowed" could leak into access-control thinking if pagination and permissions are implemented in the same reducer pass | Keep pagination purely a rendering/derived concern with no bearing on which fields are editable/visible — that stays governed by existing `isReadOnly`/signed-snapshot/presentation-settings logic, unchanged by this milestone |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| A page break falling in the middle of the new signature block or a photo-caption pair | Looks broken/unprofessional on a document meant to be sent to a paying client | Treat signature block and each photo+caption pair as explicit "keep together" units in the shared break-rule module, tested against edge-case estimate shapes |
| An input visually relocating to a different page box while the user is still typing in it | Feels like data loss/a bug, erodes trust in the editor | Defer visual re-slotting until blur/idle (see Pitfall 6); keep stable React keys by item id, not by page position |
| The paginated mode silently diverging from what will actually print/send (if the break rule and renderer drift even slightly) | Owner sends an estimate expecting what they saw in the editor, PDF looks different — a real business-facing trust break, mirroring the milestone's TRUST-01 lineage | Make the shared break-rule module + regression test (preview pages == PDF pages, same items per page) a hard gate, not just a visual QA pass |

## "Looks Done But Isn't" Checklist

- [ ] **The existing `pageView` toggle:** Looks like "pagination already exists" — verify it's still cosmetic-only (single 96dpi box, no real page breaks) before assuming it's a foundation to build on rather than replace.
- [ ] **PDF template selection:** `pdf/route.ts` already does template lookup — verify `send/route.ts` and `pdf-delivery.ts` ACTUALLY route through the same resolver after this milestone, not just "support templates" via a second, separately-written lookup.
- [ ] **Signed-snapshot correctness:** A signed estimate rendering correctly via "Download PDF" does NOT mean it renders correctly via email/WhatsApp send — verify all 3 call sites independently (a shared regression test, per Pitfall 12, is the only reliable check).
- [ ] **PDF/preview parity:** "The pages look similar in a quick side-by-side glance" is not the bar — verify same item count per page, same break positions, across at least one edge-case estimate (long descriptions, many photos, a near-boundary item length), not just a typical demo estimate.
- [ ] **Signature block in PDF:** Confirm both templates (Classic AND Modern) render it, not just the one that was tested — the two PDF templates have a documented history of silently diverging.
- [ ] **Drag-and-drop in paginated mode:** Confirm dragging an item FROM the bottom of one page TO the top of the next (and vice versa) actually works, not just reordering within a single visible page.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| Pixel-perfect WYSIWYG chased and failed (Pitfall 1) | MEDIUM | Reframe the acceptance bar from "identical pixels" to "identical item-to-page assignment" (the shared break-rule module's actual contract); this is a scope/spec fix, not a rewrite |
| 3 PDF paths converged via HTTP fetch and broke prod webhook sends (Pitfall 13) | LOW-MEDIUM | Revert the fetch-based call, restore the in-process shared function pattern (git history/this document provides the correct pattern) |
| Client-side money math crept back into `estimate-document.tsx` during refactor (Pitfall 14) | MEDIUM-HIGH | Diff the refactor against `compute-totals.ts` output field-by-field; replace any inline derivation with a prop read; re-run the GUARD-03 golden-value regression suite |
| Un-memoized paginated editor shipped with severe input lag (Pitfall 5) | LOW-MEDIUM | Add memoization incrementally (item-level first, then section-level) guided by a profiler flame graph rather than a rewrite |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| 1. Pixel-perfect dual-engine WYSIWYG is doomed | Page-Break Rule | Spec explicitly defines the contract as "same items per page," not "identical pixels" |
| 2. px vs pt unit confusion | Shared Document Engine | A single conversion constant exists and is used everywhere; no raw numeric literal appears in both a Tailwind/CSS value and a react-pdf `StyleSheet` value |
| 3. Text-wrap/hyphenation divergence | PDF Parity + Page-Break Rule | Same font files registered in react-pdf as loaded in the DOM preview; safety margin present in height estimation |
| 4. Non-deterministic font/hyphenation setup | Shared Document Engine | Determinism regression test: render same content twice, assert identical break output |
| 5. Reflow thrash on keystroke | Paginated Editor Mode | Profiler-verified no full-tree repagination per keystroke on a large test estimate |
| 6. Focus loss on repagination | Paginated Editor Mode | Explicit test: edit causes cross-page move, cursor position/focus preserved |
| 7. Drag-and-drop across page boundaries | Paginated Editor Mode | Explicit test: drag item across a page boundary in both directions |
| 8. `renderToBuffer` blocks event loop | Send-Path Correctness | Existing ETag caching pattern extended to converged resolver, not bypassed |
| 9. Remote image fetch fails whole render | PDF Parity + Send-Path Correctness | Signed URLs pre-resolved server-side in all 3 call sites; single-image failure degrades gracefully |
| 10. `minPresenceAhead`/`fixed`/`wrap` combinatorial bugs | Page-Break Rule | Each "keep together" rule's implementation choice (native prop vs. explicit break) documented and tested against an adversarial estimate shape |
| 11. react-pdf in client bundle / DOM in server path | Shared Document Engine | Shared module is data-only (no react-pdf, no DOM globals); import-boundary lint or review checklist in place |
| 12. 3 PDF paths diverge silently | Send-Path Correctness | Regression test asserts byte-identical PDF bytes from all 3 call sites for the same signed estimate |
| 13. pdf-delivery.ts calling the HTTP route | Send-Path Correctness | Shared resolver is a plain function taking an explicit `SupabaseClient`; no internal `fetch()` to the PDF route exists anywhere in `lib/whatsapp/` or Inngest functions |
| 14. GUARD-03 math regression during refactor | Shared Document Engine + Paginated Editor Mode (every phase touching `estimate-document.tsx`) | GUARD-03 golden-value regression suite green after every incremental extraction step, not just at milestone end |

## Sources

- Direct codebase evidence (HIGH confidence, read 2026-07-27): `components/pdf/estimate-pdf.tsx`, `components/pdf/estimate-pdf-modern.tsx`, `components/share/estimate-document-modern.tsx`, `components/workspace/estimate/estimate-document.tsx`, `app/api/estimates/[id]/pdf/route.ts`, `app/api/estimates/[id]/send/route.ts`, `lib/whatsapp/pdf-delivery.ts`, `lib/estimate/compute-totals.ts`, `lib/estimate/templates/registry.ts`, `.planning/PROJECT.md` (v4.23 milestone section).
- [diegomura/react-pdf Issue #2659 — infinite loop hanging megathread (minPresenceAhead, margin, break)](https://github.com/diegomura/react-pdf/issues/2659)
- [diegomura/react-pdf Issue #2238 — `fixed` in conjunction with `minPresenceAhead` does not work as expected](https://github.com/diegomura/react-pdf/issues/2238)
- [diegomura/react-pdf Issue #955 — minPresenceAhead calculating the meaning of "presence" on next sibling element](https://github.com/diegomura/react-pdf/issues/955)
- [diegomura/react-pdf Issue #2595 — minPresenceAhead with Row and Column Layout, children break](https://github.com/diegomura/react-pdf/issues/2595)
- [react-pdf.org — Advanced usage docs (`fixed`, `break`, `minPresenceAhead` semantics)](https://react-pdf.org/advanced)
- [diegomura/react-pdf discussion — Support non-blocking rendering (Node/Web Workers), Issue #464](https://github.com/diegomura/react-pdf/issues/464)
- [diegomura/react-pdf Issue #2460 / #3074 — renderToBuffer/renderToStream issues under Next.js App Router](https://github.com/diegomura/react-pdf/issues/2460)
- [diegomura/react-pdf Issue #2651 / #1253 — Image component failing to render / CORS issues with remote URLs](https://github.com/diegomura/react-pdf/issues/2651)
- [react-pdf.org — Rendering process docs (Yoga layout, points-based units, text-layout glyph process)](https://react-pdf.org/rendering-process)
- `.planning/debug/whatsapp-inbound-no-reply-recurrence.md` (referenced in project context re: silent Inngest-context failure history — informs Pitfall 13's severity)

---
*Pitfalls research for: Xtimator v4.23 Unified Estimate Document Engine (dual-engine DOM/react-pdf pagination, editable paginated editor mode)*
*Researched: 2026-07-27*
