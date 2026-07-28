# Phase 184: Consolidated Pagination Engine - Context

**Gathered:** 2026-07-27
**Status:** Ready for planning
**Source:** Owner conversation (2026-07-27) + v4.23 research

<domain>
## Phase Boundary

THE central phase of the milestone — the owner's stated biggest open question ("o importante é ter consolidado essa regra de quando a quebra de página vai ser feita"). Delivers ONE deterministic pagination module that computes per-page block assignments, consumed by BOTH the react-pdf renderer (explicit pages) and, in Phase 185, the web paginated preview. Requirements: PGBRK-01..05. Depends on: Phase 182 (shared engine) AND Phase 183 (final atomic-block inventory incl. signature block).

</domain>

<decisions>
## Implementation Decisions

### The consolidated rule (PGBRK-01/02)
- Module lives at `lib/estimate/pagination/` — pure TS, server+client safe (no react-pdf, no DOM imports in the core).
- Contract: (document model blocks + measurement provider + page geometry from `lib/estimate/document`) → ordered pages of block assignments. Deterministic: same input → same pages, byte-stable.
- Break rules (locked): line-item row never splits; section header keeps with ≥1 first row; section subtotal keeps with the last row; totals block atomic; signature block atomic; each terms card atomic; photo grid breaks only between rows; no manual page breaks.
- Explicit precomputed breaks — the PDF renders one `<Page>` per computed page (PGBRK-04); NEVER rely on emergent Yoga `wrap` for break decisions. `fixed` header/footer elements may remain for repeated chrome.

### Continuation chrome (PGBRK-03)
- Continuation pages repeat the items-table column header (hand-built from per-page item ranges — react-pdf has no thead-repeat).
- Every page: "Page N of M" (footer already exists in PDF via render callback — now driven by the module's page count).

### Measurement strategy (PGBRK-05)
- SPIKE FIRST (research-mandated, LOW-confidence area): quantify browser-DOM vs fontkit text measurement drift for representative estimate text with the SAME TTF font; pick the safety margin from measured data. Spike output is a short doc + the margin constant.
- Font: register the same TTF family the web renders (Font.register; TTF not WOFF2). Both PDF templates move to it — coordinate with what Phase 183 shipped (if 183 already registered fonts, reuse; do not have two font sources).
- Measurement provider interface with two implementations: (a) estimator (fontkit + linebreak — react-pdf's own transitive deps, promote to direct deps) used server-side for the PDF path; (b) DOM measurement (Phase 185 wires it; interface defined here).
- Fidelity bar (locked): same page-break decisions + same content per page — NOT pixel parity.

### PDF wiring (PGBRK-04)
- Both PDF templates consume the module's output: map pages → explicit `<Page>` elements, items sliced per page ranges, repeated table headers on continuations.
- The shared resolver (lib/pdf/render-estimate-pdf.ts) invokes pagination before rendering.
- Regression guard: existing PDF tests stay green; add structural tests (e.g., N-item estimate → expected page count + expected block assignment snapshot).

### Claude's Discretion
- Internal module layout (rules.ts / engine.ts / measure/*.ts / types.ts).
- Exact estimator implementation details (line-break iteration, per-block measurers) as long as deterministic + tested.
- Whether page-count metadata gets exposed to the ETag/contentKey of the PDF route.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/research/STACK.md` — fontkit/linebreak strategy, Font.register TTF, minPresenceAhead upstream bugs (avoid), do-not-add list
- `.planning/research/PITFALLS.md` — dual-engine convergence traps, pt/px, hyphenation determinism, renderToBuffer blocking
- `.planning/research/FEATURES.md` — estimate-document break-rule expectations, repeating headers, "continued" markers
- `.planning/research/ARCHITECTURE.md` — pagination engine contract sketch (engine + two measurement providers)
- `lib/estimate/document/` — Phase 182 shared model/tokens/geometry (input types)
- `components/pdf/*` — post-183 template structure being wired
- `lib/pdf/render-estimate-pdf.ts` — resolver that will invoke pagination

</canonical_refs>

<specifics>
## Specific Ideas

- Owner: "o importante é ter consolidado essa regra de quando a quebra de página vai ser feita... acho que essa é a maior dúvida que eu tenho sobre esse projeto" — this phase exists to answer that question with ONE module.
- Owner: paginated web mode "fica como se fosse um espelho do pdf" — the module is the mirror mechanism.

</specifics>

<deferred>
## Deferred Ideas

- The editable paginated web view (DOM measurement provider wiring, toggle UI) → Phase 185.
- Webview aesthetics → Phase 186.

</deferred>

---

*Phase: 184-consolidated-pagination-engine*
*Context gathered: 2026-07-27 via owner conversation + milestone research*
