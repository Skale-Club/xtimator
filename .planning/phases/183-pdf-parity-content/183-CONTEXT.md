# Phase 183: PDF Parity Content - Context

**Gathered:** 2026-07-27
**Status:** Ready for planning
**Source:** Owner conversation (2026-07-27) + v4.23 research

<domain>
## Phase Boundary

The PDF copies the webview benchmark's design/features for BOTH templates (classic + modern), and the net-new content blocks land on all surfaces: signature block and photo captions. Requirements: PDFPAR-01, PDFPAR-02, PDFPAR-03. Builds on Phase 182's shared document engine (labels/tokens/formatters) and shared PDF resolver. Pagination is NOT this phase (184). Depends on: Phase 182 complete.

</domain>

<decisions>
## Implementation Decisions

### Benchmark parity (PDFPAR-01)
- The webview is the BENCHMARK (owner-locked): the PDF must match the webview's structure and visual design per template — company header/branding, ESTIMATE title, project/bill-to grid, summary, sections with per-section subtotals, items tables, totals block (subtotal → discount → tax → total → deposit → balance due), terms cards, photo grid.
- Reference screenshots (owner-provided 2026-07-27): the workspace/webview modern doc has a solid brand-color ESTIMATE banner and brand-color section headers; the current modern PDF uses accent-only styling — the PDF moves TOWARD the webview look, not vice versa.
- Both templates covered; template-specific styling expressed via the Phase 182 per-template token layer (this phase completes ENGINE-03's structural de-duplication of the ~860-line PDF template pair — carried over from 182 as explicitly partial there).
- Typography: PDF should adopt the same font family the web renders (registered TTF via Font.register — see STACK.md; groundwork may land here or in 184's measurement work; if landing here, keep it consistent with what 184 needs).
- Discount display: fix the `discount_type` fragmentation at the PDF layer (schema 'percentage'|'fixed', AI writes 'amount', totals engine 'percent'|'amount') so percentage discounts show the (x%) suffix consistently — shared normalization helper, server math (GUARD-03) untouched.

### Signature block (PDFPAR-02 — net-new on ALL surfaces)
- A signed estimate renders a signature block: signer name, signed date, signature image (from estimate_signatures.signature_data base64 PNG) — on the share webview, the workspace doc (view mode), and both PDF templates.
- Placement: after totals/terms, standard document convention; atomic block (Phase 184 will treat it as unsplittable — define it as one component).
- Data: signature comes from `loadLatestSignedSnapshot` / the signatures table; PDF paths already load it via the Phase 182 shared resolver.
- Unsigned estimates: no signature block (no placeholder/empty state on PDF; webview keeps its existing signature-capture pad flow unchanged).

### Photo captions (PDFPAR-03 — net-new on all surfaces)
- Captions render under each photo in the webview photo grid AND the PDF photo grid (caption data already resolved by the PDF route and dropped today — components/pdf props already type `caption`).
- No caption → no empty space (conditional render).

### Claude's Discretion
- Exact signature block layout (keep it professional/minimal; match benchmark typography).
- How much of the PDF StyleSheets collapse into shared tokens vs stay per-template (target: shared structure components with per-template token styling — the react-pdf side gains shared layout components under components/pdf/shared/ or similar).
- Whether webview visual polish beyond structure parity belongs here or in 186 (bias: structure/content here, aesthetics in 186).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone research
- `.planning/research/ARCHITECTURE.md` — exhaustive parity checklist (what the PDF must copy), new-vs-modified breakdown
- `.planning/research/PITFALLS.md` — react-pdf traps (remote Image failures, base64 images, style limits)
- `.planning/research/STACK.md` — Font.register TTF guidance, WOFF2 caveat, do-not-add list

### Phase 182 outputs (must exist before planning)
- `lib/estimate/document/` — shared model/labels/tokens/format
- `lib/pdf/render-estimate-pdf.ts` — shared resolver (all 3 PDF paths)
- `.planning/phases/182-shared-document-engine-send-path-fix/182-SUMMARY*.md` (per-plan summaries, if present)

### Live code
- `components/share/estimate-document-modern.tsx` + `components/workspace/estimate/estimate-document.tsx` — THE benchmark
- `components/pdf/estimate-pdf.tsx` + `estimate-pdf-modern.tsx` — surfaces being rebuilt
- `components/share/estimate-view.tsx` — signature capture flow + where the webview signature display block mounts
- `lib/estimate/signed-snapshot.ts`, `lib/queries/share.ts` (loadLatestSignedSnapshot)

</canonical_refs>

<specifics>
## Specific Ideas

- Owner: "o pdf precisa copiar os recursos dele [webview]" — parity direction is webview → PDF.
- Owner screenshots show the modern webview doc with solid blue ESTIMATE banner + blue section header bars; current modern PDF is accent-only — visible divergence to close.
- A signed estimate's PDF must be visibly distinguishable (signature block) — today it is indistinguishable from unsigned (prior session analysis).

</specifics>

<deferred>
## Deferred Ideas

- Pagination/page-break control → Phase 184.
- Invoices/payment state in PDF → DEFER-02 (v2).
- "Prepared by" on webview → DEFER-03 (v2).
- General webview aesthetic polish → Phase 186.

</deferred>

---

*Phase: 183-pdf-parity-content*
*Context gathered: 2026-07-27 via owner conversation + milestone research*
