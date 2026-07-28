# Feature Research

**Domain:** Paginated document editors / PDF-preview modes for estimate & invoice documents (comparable products: PandaDoc, Proposify, QuickBooks Online, Invoice2go, Canva Docs, Google Docs, Notion PDF export, CKEditor 5 Pagination)
**Researched:** 2026-07-27
**Confidence:** MEDIUM-HIGH (page-break mechanics and toggle-UX conventions are well-documented across multiple independent sources; live-reflow-while-typing internals are sparsely documented by vendors and are triangulated from general WYSIWYG-editor performance guidance — flagged LOW where relevant)

**Scope note:** This research is scoped to the v4.23 "Unified Estimate Document Engine" milestone's THREE new capabilities only: (1) unified webview/PDF design, (2) a new paginated editor mode toggle in the workspace, (3) one consolidated deterministic page-break rule shared by web preview and PDF. It assumes — and does not re-research — everything already shipped (editor, AI generation, public share webview, PDF send, two templates, presentation settings, signatures, Stripe invoices).

## Grounding in the existing codebase

Two facts from the codebase materially shape what's realistic here and are referenced throughout:

1. **`@react-pdf/renderer` lays out with Yoga (flexbox) + its own font-metrics engine (fontkit) — not the browser's CSS engine.** The webview/web-preview renders with normal browser CSS layout. These are two independent measurement pipelines. They can be made to agree on *where content breaks* (the page-break decisions) but cannot be made to agree on *pixel-for-pixel rendering* (subpixel text metrics differ by engine). This directly answers question (d) below.
2. **An analogous toggle already exists** in `components/workspace/estimate/estimate-floating-actions.tsx`: `viewMode: 'width' | 'page'`, rendered with `File` ("Full page") / `StretchHorizontal` ("Full width") lucide icons in the floating action pill. That toggle only constrains column WIDTH to letter-width — it does not paginate with page breaks. It is a different feature from this milestone's paginated mode, but it establishes an existing icon/label vocabulary ("Full page" wording, `File` icon) that the new toggle risks colliding with. Flagged as a dependency/naming risk below.
3. **The estimate document's actual block structure** (from `components/share/estimate-document-modern.tsx`): company header/logo, Bill To, one or more line-item **sections** (each with a section header, its rows, and a section subtotal), an overall totals block (Subtotal → Discount → Tax → Total → Deposit → Balance Due), a Terms area (payment terms / timeline / warranty terms / notes — plain text, each optional), a Photos block, and a signature block. Break rules below are written against these real blocks, not generic invoice theory.

## Feature Landscape

### Table Stakes (Users Expect These)

Features/behaviors every comparable paginated business-document editor gets right — missing these makes the paginated mode feel broken, not just unpolished.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Never split a line-item row across a page break | Universal across QuickBooks, invoicing tools, and general CSS-to-PDF guidance: a row's qty/description/price/amount must stay on one page. `break-inside: avoid` (web) / `wrap={false}` on the row `View` (react-pdf) is the direct mechanism | LOW | Both engines support this natively; the work is making ONE module decide row placement so both obey the same decision, not each independently avoiding mid-row splits |
| Section header stays with its first row ("keep-with-next") | An orphaned section title alone at the bottom of a page, with all its rows starting the next page, is the single most commonly cited page-break defect in invoice/table PDF guidance | LOW-MEDIUM | Standard `break-after: avoid` on the header / no native react-pdf equivalent — must be encoded as a rule in the shared module ("if header + row 1 don't both fit, push both to next page") |
| Section subtotal stays with its section's last row | A lone subtotal number at the top of a new page, disconnected from the rows it totals, is confusing and matches nobody's expectation of "the subtotal is the section's own line" | LOW-MEDIUM | Same "keep-with-previous" pattern as above, applied at the tail of a section instead of the head |
| Totals block (Subtotal→Discount→Tax→Total→Deposit→Balance Due) is one atomic, never-split unit | This is the money the customer is agreeing to — splitting it across pages is jarring and, unlike a table row, actively damages trust in the document. No comparable invoicing tool splits this block | LOW | `wrap={false}` / `break-inside: avoid` treats the whole block as indivisible; if it doesn't fit remaining space, it moves to a fresh page entirely (not "shrink to fit") |
| Repeating column header row on every continuation page of a multi-page line-items table | Confirmed as "the single most important CSS rule for long tables in PDFs" in general HTML-to-PDF guidance (`display: table-header-group` / `<thead>` repetition); QuickBooks/invoicing forums cite reader confusion without it | MEDIUM | `react-pdf` has NO native `<thead>` repeat-on-continuation semantics — its `fixed` prop repeats a view on literally every page of the whole document, not just "while this table continues." Must be hand-built: only render the repeated header when the shared pagination module says a section's rows actually span a page boundary |
| Toggle between continuous (full-width, current default) and paginated (letter-size pages) view, via an icon+label button | Exactly the Word "Print Layout ⇄ Web Layout" / Google Docs "Pages ⇄ Pageless" pattern; already scoped in PROJECT.md as two icon buttons left of "Edit with AI" | LOW (UX is already decided by the milestone) | Use icon + text label, not icon-only — no competitor uses a universally recognizable icon-only glyph for this toggle (Word/Google Docs pair the icon with a menu label or tooltip); matches Xtimator's own existing convention on the width toggle |
| Full inline editing keeps working inside paginated mode | The milestone's explicit, non-negotiable requirement; CKEditor 5's Pagination feature (the closest general-purpose analog) is built specifically so editing stays live inside the paginated view, not a separate read-only preview | HIGH | The hard part of the whole milestone — see reflow discussion under Differentiators/dependencies |
| Page 1 always carries letterhead (logo, company info) + Bill To; these never repeat or re-flow onto later pages | Universal convention in every invoicing tool surveyed (QuickBooks, generic invoice templates) — only the line-items table and totals continue past page 1 | LOW | Encode explicitly as "always-page-1, non-repeating" blocks in the shared module, distinct from the repeating table header |
| Same page-break DECISIONS (same content on the same page) between web preview and PDF | This is the milestone's central ask ("one deterministic module... shared by the web paginated preview and the react-pdf renderer") | HIGH | See Fidelity section below — this is achievable; pixel-identical rendering is not, and should not be the bar |

### Differentiators (Competitive Advantage)

Features that go beyond bare correctness and set the paginated mode apart — valuable, not required for MVP.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Live, debounced reflow while typing (not full-document read-only preview) | Most direct estimate/invoice competitors (QuickBooks, Invoice2go) only show a static PDF preview AFTER generation — no live in-app paginated editing. Matching PandaDoc/Proposify/CKEditor-5-Pagination's "edit live inside the paginated view" differentiates Xtimator from the QuickBooks-class competitors specifically named in the milestone's comparable-product set | HIGH | See "editing inside a paginated view" analysis below — debounce, don't recompute per keystroke |
| "Page X of Y" footer + page numbers | Standard on printed multi-page business documents; several invoicing-tool user threads specifically request it when missing | LOW | Trivial via `fixed` in react-pdf + a sticky/absolute footer on web; genuinely low-value for the common 1-2 page estimate but cheap to add once the module tracks total page count |
| "Continued" indicator when a section's rows span a page boundary | Referenced in multi-page-invoice discussions as reducing reader confusion, distinct from the repeating header (signals mid-section continuation, not just "here's the table again") | LOW | Optional micro-copy driven off the same per-page item-range data the repeating header already needs |
| Smart totals placement: push the whole totals block to a fresh page rather than letting it half-fit awkwardly at a page bottom | Beyond bare atomicity (never split) — actively choosing a full-page-break over a cramped near-fit reads as more deliberate/professional | LOW-MEDIUM | A refinement rule layered on top of the base "totals block is atomic" table-stakes rule |
| Cursor/scroll-position preservation across a live repagination pass | The most commonly cited UX complaint about paginated WYSIWYG editors in general engineering discussion is the view "jumping" when content shifts pages mid-edit | MEDIUM | Real but second-order polish; do after the base toggle ships, not blocking it |
| Orphan/widow-aware wrapping in free-text blocks (terms, notes) | Standard word-processor courtesy (never leave 1 line alone at a page top/bottom) | LOW | Lowest priority of all break rules — Xtimator's terms/notes blocks are short; this matters far less than table/totals integrity |

### Anti-Features (Commonly Requested, Often Problematic)

Features that look reasonable by analogy to word processors or other document tools but actively fight this milestone's design principle or this document type's needs.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Per-keystroke full repagination | "Live preview should update instantly" | Causes visible jank/flicker; no surveyed competitor does this; estimate content is structured (discrete rows/sections), not free-flowing prose where every keystroke can shift a line-wrap — the cost/benefit is upside-down | Repaginate on structural change (item add/remove/reorder, section toggle) immediately; for free-text fields whose line-wrap can change (description, notes, terms), debounce ~300-500ms after typing pauses — the general WYSIWYG-editor norm |
| Byte-for-byte / pixel-identical rendering between webview/web-preview and the PDF | "Unified design" in the milestone name sounds like it implies visual identity down to the pixel | Impossible without abandoning `@react-pdf/renderer`'s Yoga+fontkit pipeline in favor of the browser's CSS engine (or vice versa) — the two are architecturally different renderers; chasing pixel parity is an unbounded, never-done scope trap | Target "same breaks, same content per page" — verify structurally (e.g., "page 2 starts at item index 7," same page count) rather than via visual pixel-diffing, which is fragile across font-rendering differences anyway |
| User-insertable manual page breaks (à la PandaDoc's Page Break content block) | PandaDoc offers exactly this, and it feels like "give the user control" | Directly undermines the milestone's core design principle of ONE deterministic, consolidated rule — manual overrides reintroduce per-document special-casing that the milestone exists to eliminate, and a manual break inserted in the web preview has no obvious analog to force in the independently-computed PDF | If a specific document genuinely needs a forced break in the future, that's a scoped v2 decision layered ON TOP of the deterministic module (e.g., an explicit "force new page before this section" flag persisted in data, evaluated BY the shared module) — not a free-floating editor insertion |
| A bindable keyboard shortcut for the continuous/paginated toggle | Power-user expectation carried over from word processors | Word and Google Docs — the two products with the most mature version of this exact toggle — do NOT expose a bindable shortcut for it (menu/status-bar only); PandaDoc/Canva/Notion don't either. Not a real competitive gap | Icon+label button only, as already scoped by the milestone; revisit only if users explicitly ask |
| Pagination applied to the public share webview | Consistency instinct ("shouldn't the customer-facing page paginate too?") | Explicitly out of scope per PROJECT.md — "the public share webview stays a normal single-page scroll — pagination never applies there." Customers reading on a phone/desktop scroll; only the internal editor's paginated-preview mode and the PDF need page semantics | Keep pagination logic entirely inside the workspace editor's new mode + the PDF renderer; the shared module's OUTPUT (page-break decisions) is irrelevant to the webview's single-scroll rendering |
| Adopting a general-purpose HTML pagination library (e.g., Paged.js) for the web side while the PDF continues using react-pdf's own layout independently | Paged.js is a legitimate, well-regarded library specifically built to paginate HTML content in the browser for print/PDF-like output | Using it ONLY on the web side re-creates exactly the "two engines independently guessing where breaks fall" problem this milestone is designed to eliminate — Paged.js would compute its own breaks from live DOM measurement, react-pdf would compute its own breaks from Yoga measurement, and nothing guarantees they agree | If a browser-side pagination *rendering* helper is wanted, it should be driven BY the shared deterministic module's page-break decisions (told where to cut), not used to independently DECIDE where to cut |
| Full word-processor-grade pagination features: running headers derived from content, footnotes, left/right (verso/recto) page styling | "Complete" pagination feature parity with Word/Google Docs/CSS Paged Media spec | Estimates are short (1-3 pages), structured, tabular business documents — not books or long-form prose. These features have essentially zero utility for this document type and would add real engineering surface for no user value | Skip entirely; the table-stakes list above already covers everything an estimate/invoice document needs |

## Feature Dependencies

```
[Shared document engine: design tokens, labels, section composition]
    └──precedes/parallels──> [Consolidated page-break module]
                                  └──requires──> [Paginated editor mode toggle]
                                  └──requires──> [PDF repeating table header]
                                  └──requires──> [PDF/web totals-block atomicity]

[PDF parity with webview benchmark — incl. signature block, photo captions]
    └──feeds──> [Consolidated page-break module]
         (the module needs the signature block defined as an atomic
          break-unit, so signature-block PDF parity should land at or
          before the module's block inventory is finalized)

[Paginated editor mode toggle]
    └──conflicts-in-naming-with (not a hard dependency, a UX risk)──> [existing viewMode: 'width'|'page' toggle in estimate-floating-actions.tsx]

[Live in-editor reflow while typing]
    └──requires──> [Consolidated page-break module]
    └──requires──> [Debounce strategy for free-text fields]
```

### Dependency Notes

- **Consolidated page-break module requires the shared document engine (or at least a stable block inventory) first:** the module needs to know the definitive list of atomic blocks (line-item row, section header, section subtotal, totals block, signature block, photo tile, terms paragraph) before it can encode break rules for them. Building the module against the CURRENT duplicated webview/PDF structure risks re-deriving the rules twice.
- **PDF repeating table header requires the consolidated module's per-page item ranges:** react-pdf has no native `<thead>`-repeat-on-continuation behavior (only a document-wide `fixed`), so "repeat the header only when a table actually continues" must be computed from the same page-assignment data the module already produces for the web side — this is a genuine shared-dependency, not two separate features.
- **Signature-block PDF parity (an already-known gap per PROJECT.md) feeds the page-break module:** the module treats the signature block as one atomic never-split unit; if the PDF doesn't yet render a signature block at all, the module's rule for it can't be validated end-to-end until that parity gap closes.
- **Naming/icon collision risk (not a blocking dependency, a planning flag):** the existing `viewMode: 'width' | 'page'` toggle already uses "Full page" wording and a `File` icon for a WIDTH constraint, unrelated to this milestone's new pagination toggle. The roadmap/plan should pick visually and semantically distinct icon/label choices for the new continuous/paginated toggle (e.g., pairing a rows/stack-style icon with explicit "Paginated"/"Continuous" or "PDF preview"/"Full width" labeling) to avoid two different "page" concepts confusing users in the same toolbar area.
- **Live reflow while typing requires a debounce strategy, which requires the module to expose an incremental/cheap re-layout path** — not a full document re-measure on every field edit. This should be scoped explicitly in planning as its own sub-requirement, since it's the highest-complexity item in the whole milestone.

## MVP Definition

### Launch With (v1)

The floor the milestone's own description already sets — a paginated mode that is correct, not just present.

- [ ] Never split a line-item row across pages — the most basic correctness bar; anything else fails visibly on the first multi-page estimate
- [ ] Section header keep-with-first-row; section subtotal keep-with-last-row
- [ ] Totals block (Subtotal→Discount→Tax→Total→Deposit→Balance Due) as one atomic, never-split unit
- [ ] Repeating line-items column header on continuation pages
- [ ] Page 1 always carries letterhead + Bill To, non-repeating
- [ ] Continuous/paginated toggle (icon + label) left of "Edit with AI," full inline editing preserved in paginated mode
- [ ] Identical page-break DECISIONS between web preview and PDF (same content lands on the same page in both), verified structurally

### Add After Validation (v1.x)

- [ ] Page numbers / "Page X of Y" footer — trigger: once multi-page estimates are common enough in real usage to justify it (many estimates will still be 1 page)
- [ ] "Continued" section-continuation indicator — trigger: user feedback that mid-section page breaks are confusing without it
- [ ] Cursor/scroll-position preservation across live repagination — trigger: if the debounced-reflow v1 approach produces a visibly jarring jump in practice
- [ ] Orphan/widow control in terms/notes text — trigger: only if real estimates start carrying long enough terms/notes text for it to matter

### Future Consideration (v2+)

- [ ] Explicit, data-persisted "force new page before this section" flag (a scoped, deliberate escape hatch — NOT a freeform manual page-break insertion) — defer until a real business case surfaces (e.g., legal boilerplate that must start on its own page)
- [ ] Smart totals-block "push to fresh page vs cramped near-fit" refinement — nice-to-have polish layered on the base atomicity rule

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Never split a line-item row | HIGH | LOW | P1 |
| Section header/subtotal keep-with rules | HIGH | LOW-MEDIUM | P1 |
| Totals block atomicity | HIGH | LOW | P1 |
| Repeating table header on continuation pages | HIGH | MEDIUM | P1 |
| Continuous/paginated toggle UX | HIGH | LOW | P1 |
| Live editable paginated mode (debounced reflow) | HIGH | HIGH | P1 |
| Web/PDF page-break decision parity | HIGH | HIGH | P1 |
| Page numbers / footer | MEDIUM | LOW | P2 |
| "Continued" indicator | LOW-MEDIUM | LOW | P2 |
| Cursor/scroll preservation on reflow | MEDIUM | MEDIUM | P2 |
| Orphan/widow control in text blocks | LOW | LOW | P3 |
| Manual forced-page-break data flag | LOW (no known current demand) | MEDIUM | P3 (v2+, only if requested) |

**Priority key:**
- P1: Must have for this milestone
- P2: Should have, add when possible in this milestone or a fast follow
- P3: Nice to have, defer to a future milestone with an explicit trigger

## Competitor Feature Analysis

| Feature | PandaDoc | Proposify | QuickBooks Online | Google Docs | CKEditor 5 Pagination | Xtimator's Plan |
|---------|----------|-----------|--------------------|--------------|------------------------|------------------|
| Continuous ⇄ paginated toggle | No true toggle — content flows continuously with optional manually-inserted page-break blocks | Not documented in sources found (page-based editor by default) | N/A — estimates aren't live-edited in a paginated view; only static PDF export | Format menu "Switch to Pageless" — no toolbar icon prior to 2024, now a quick-access toggle, no keyboard shortcut | Toolbar buttons for page navigation + page count display | Icon+label toggle in the toolbar (already scoped), no shortcut — matches Google Docs/Word convention, not PandaDoc's block-insertion model |
| Live editing inside paginated view | Yes, but breaks are driven by manual page-break blocks + estimated-break markers, not deterministic auto-layout | Yes (page-based by design) | No — static PDF only | Yes (mature, general-purpose word processor) | Yes — explicit design goal, "intelligent algorithms... on-screen exactly as it will appear in exported documents" | Yes — required by the milestone; closest analog is CKEditor 5's design goal, scoped down to Xtimator's much simpler structured-table content model |
| Never-split table rows | Not specifically documented | Not specifically documented | N/A | N/A (general prose editor, not table-centric) | Explicitly "avoids breaking table cells" | Table stakes — P1 |
| Repeating table header on continuation pages | Not confirmed in sources found | Not confirmed | Not confirmed for QBO specifically | N/A | Not confirmed in sources found | Build explicitly — general HTML-to-PDF guidance calls this the single most important long-table rule; react-pdf needs it hand-built |
| Manual page-break insertion | Yes (a first-class content block) | Likely (page-based editor) | N/A | Yes (Insert > Break > Page break) | Yes (dedicated Page Break feature, alongside automatic breaks) | Explicitly rejected as an anti-feature for v1 — conflicts with "one deterministic rule" |
| Pixel/byte-identical preview-vs-output | Not applicable/claimed | Not applicable/claimed | N/A | Preview IS the same rendering engine (no separate export renderer) | Claims WYSIWYG accuracy but is a single-engine web editor (no separate PDF-generation engine to diverge from) | NOT the bar — Xtimator has two genuinely different rendering engines (browser CSS vs react-pdf/Yoga); target same-breaks/same-content parity instead |

## Sources

- [How to Control Page Breaks in HTML to PDF Output — DEV Community](https://dev.to/accreditly/how-to-control-page-breaks-in-html-to-pdf-output-1maj) — MEDIUM confidence (aggregated web guidance, cross-checked against MDN CSS Paged Media)
- [CSS paged media — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Paged_media) — HIGH confidence (official spec documentation)
- [PandaDoc: Document design — Help Center](https://support.pandadoc.com/en/articles/9714603-document-design) — HIGH confidence (official vendor docs)
- [PandaDoc: Content builder blocks — Help Center](https://support.pandadoc.com/en/articles/9714573-content-builder-blocks) — HIGH confidence (official vendor docs)
- [How to Turn Off Pageless in Google Docs — Adazing](https://www.adazing.com/how-to-turn-off-pageless-in-google-docs/) — MEDIUM confidence (third-party but consistent across multiple independent write-ups)
- [Google Docs makes it easier to switch to Pageless mode — 9to5Google](https://9to5google.com/2024/01/31/google-docs-pageless-mode/) — MEDIUM confidence (tech press, consistent with vendor behavior)
- [react-pdf: Page Wrapping documentation](https://github.com/diegomura/react-pdf-site/blob/master/docs/page-wrapping.md) — HIGH confidence (official library source docs — `wrap`, `break`, `fixed` props verified directly)
- [react-pdf GitHub Issue #2099: Repeated Headers on Tables](https://github.com/diegomura/react-pdf/issues/2099) — MEDIUM confidence (maintainer/community issue thread; confirms no native repeat-on-continuation support as of investigation)
- [react-pdf GitHub Issue #827: Page break controlled](https://github.com/diegomura/react-pdf/issues/827) — MEDIUM confidence (community issue thread)
- [Word: Document Views — TeachUcomp / Word status bar guidance](https://www.teachucomp.com/document-views-in-word/) — MEDIUM confidence (third-party training material, consistent across multiple sources on Print Layout vs Web Layout)
- [CKEditor 5 Pagination feature announcement](https://ckeditor.com/blog/How-to-create-ready-to-print-documents-with-page-structure-in-WYSIWYG-editor---CKEditor-5-pagination-feature/) — MEDIUM confidence (official vendor blog; internals of reflow-timing not disclosed, flagged LOW for that specific sub-claim)
- [Paged.js — GitHub](https://github.com/pagedjs/pagedjs/) — HIGH confidence (official project README, referenced as an architectural precedent, not necessarily an adoption recommendation)
- [Canva: Page view settings — Help Center](https://www.canva.com/help/page-view-settings/) — HIGH confidence (official vendor docs)
- [Canva: Adjust your Canva Docs page set up — Help Center](https://www.canva.com/help/adjust-canva-docs-page-setup/) — HIGH confidence (official vendor docs)
- [QuickBooks Community: Lines broken on PDF invoice export](https://quickbooks.intuit.com/learn-support/en-us/other-questions/lines-broken-on-pdf-invoice-export/00/1508164) — LOW-MEDIUM confidence (user forum, illustrates real-world pain point rather than authoritative spec)
- Xtimator codebase (`components/workspace/estimate/estimate-floating-actions.tsx`, `components/share/estimate-document-modern.tsx`, `components/pdf/estimate-pdf.tsx`, `components/pdf/estimate-pdf-modern.tsx`) — HIGH confidence, direct inspection, 2026-07-27

---
*Feature research for: Paginated document editor / PDF-preview mode, estimate & invoice documents*
*Researched: 2026-07-27*
