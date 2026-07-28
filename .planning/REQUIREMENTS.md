# Requirements: Xtimator — Milestone v4.23 Unified Estimate Document Engine

**Defined:** 2026-07-27
**Core Value:** A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.
**Milestone goal:** Unify the estimate webview and PDF onto one shared document structure/design (webview is the benchmark), with a single deterministic page-break rule powering a fully-editable paginated editor mode that mirrors the PDF.

> **Locked decisions (owner-confirmed):**
> - The **webview is the benchmark** — it is the most-finished surface; the PDF copies its features/design. Both templates (classic + modern) are covered.
> - The **public share webview stays a normal single-page scroll** — pagination never applies there.
> - The workspace editor gains **two icon buttons to the LEFT of "Edit with AI"**: (1) full-width mode (current default), (2) paginated mode that mirrors the PDF like a PDF preview.
> - The paginated mode is **fully functional AND editable** — all existing inline editing keeps working inside pages.
> - **ONE consolidated deterministic page-break rule** decides where breaks fall, shared by the web paginated preview and the react-pdf renderer so they mirror each other.
> - **Fidelity bar (research-locked):** "same page-break decisions, same content per page" — pixel-perfect parity between DOM and react-pdf is architecturally impossible and explicitly rejected as an anti-feature.
> - **No manual user-inserted page breaks** — they conflict with the single deterministic rule.
> - The owner will supply a **reference preview image for the paginated-mode UI** — pending; standard PDF-preview conventions (centered letter pages on neutral canvas, page gaps, shadows, page numbers) apply until it arrives, absorbed in the polish phase.
> - Research correction adopted: the webview does **not** render a signature block or photo captions today either — those are **net-new on all four surfaces**, not copy-from-webview items.
> - PDF stack stays `@react-pdf/renderer` (no puppeteer — Alpine container). `lib/whatsapp/pdf-delivery.ts` must never call the HTTP PDF route (webhook context has no cookies).
> - Model orchestration for execution: Fable orchestrates, Opus validates (plan-check/verify), Sonnet executes, Haiku simple work; maximize parallelism.

## v4.23 Requirements

### Shared Document Engine (ENGINE)

- [x] **ENGINE-01**: All four document renderers (workspace editor doc, share webview doc, classic PDF, modern PDF) consume one shared source for the document model, label maps (en/pt/es), design tokens, and formatting helpers (money, date with local-midnight fix, address) — no per-surface duplicated copies remain.
- [x] **ENGINE-02**: Page geometry (LETTER 612×792pt) and the pt↔px conversion (1.333× at 96dpi) are defined in exactly one shared module consumed by both renderers.
- [x] **ENGINE-03**: Classic and modern render from the shared structure with template-specific styling only (per-template tokens), replacing the current byte-duplicated ~860-line PDF template pair.

### PDF Parity with the Webview Benchmark (PDFPAR)

- [x] **PDFPAR-01**: The PDF (both templates) matches the webview benchmark's structure and design — company header/branding, title, project/bill-to, summary, sections with per-section subtotals, items tables, totals block (subtotal → discount → tax → total → deposit → balance due), terms, and photos.
- [x] **PDFPAR-02**: A signed estimate renders a signature block (signer name, signed date, signature image) on the webview AND in the PDF — net-new on all surfaces.
- [x] **PDFPAR-03**: Photo captions render in the webview photo grid AND in the PDF photo grid.
- [x] **PDFPAR-04**: All three PDF paths (download route, email attachment, WhatsApp document) resolve through one shared in-process renderer that honors the tenant's template choice, the signed snapshot (TRUST-01), preparedBy, and attached photos — eliminating the hardcoded-Classic + live-rows defects in `send/route.ts` and `pdf-delivery.ts`.

### Consolidated Page-Break Rule (PGBRK)

- [ ] **PGBRK-01**: One deterministic pagination module (`lib/estimate/pagination/`) computes per-page block assignments from the shared document model; it is the single source of truth consumed by BOTH the web paginated preview and the PDF renderer.
- [x] **PGBRK-02**: Break rules enforced: a line-item row never splits; a section header keeps with its first row; a section subtotal keeps with its last row; the totals block, signature block, and each terms card never split; the photo grid breaks only between rows.
- [x] **PGBRK-03**: Continuation pages repeat the items-table column header, and every page shows "Page N of M" numbering.
- [ ] **PGBRK-04**: The PDF renders explicit `<Page>` elements from the module's output (breaks are prescribed, never emergent Yoga wrap), and the paginated web preview shows the same content on the same pages for the same estimate + template.
- [x] **PGBRK-05**: Web and PDF use the same registered font family (TTF via `Font.register`, same family the web renders) with a measurement provider built on react-pdf's own transitive deps (`fontkit` + `linebreak`); a measurement-drift spike validates the approach and fixes the safety margin before the engine is finalized.

### Paginated Editor Mode (PGMODE)

- [x] **PGMODE-01**: The estimate editor header shows two icon toggle buttons to the left of "Edit with AI" — full-width (default) and paginated — switching the document view instantly.
- [ ] **PGMODE-02**: Paginated mode renders letter-size pages styled like a PDF preview (centered pages, gaps, shadows) mirroring the PDF's page breaks for the active template.
- [ ] **PGMODE-03**: All editing works inside paginated mode — inline field edits, add/remove items and sections, drag-reorder — with page membership as a derived read-only projection (never persisted), immediate repagination on structural changes, debounced repagination while typing, and no focus loss when content moves across pages.
- [x] **PGMODE-04**: The legacy `viewMode: 'width' | 'page'` CSS-zoom toggle is consolidated into the new control — one "page" concept in the UI, no colliding icons/wording.
- [ ] **PGMODE-05**: The public share webview remains a single-page scroll, byte-compatible with today's URLs and behavior.

### Webview Design Polish (POLISH)

- [ ] **POLISH-01**: The benchmark webview receives a design refinement pass (both templates, mobile included) and the refinements propagate to the PDF through the shared engine — the surfaces stay unified after polish.

## v2 Requirements (deferred)

- **DEFER-01**: Download-PDF button on the public share webview (PDF route is currently owner-authenticated only).
- **DEFER-02**: Invoices/payment state parity in the PDF (webview shows Stripe invoice pay links; PDF stays a static document this milestone).
- **DEFER-03**: "Prepared by" block on the webview (PDF-only today; open product decision).
- **DEFER-04**: Per-user/per-estimate persistence of the full-width vs paginated toggle (session-only state this milestone).

## Out of Scope

| Feature | Reason |
|---------|--------|
| Pixel-perfect DOM↔PDF parity | Different render engines (browser CSS vs Yoga+fontkit); anti-feature per research — bar is same breaks/same content per page |
| Manual user-inserted page breaks | Conflicts with the single deterministic page-break rule |
| Pagination on the public share webview | Owner-locked: share stays single-page scroll |
| puppeteer / HTML-to-PDF migration | Alpine container, known OOM history; @react-pdf stays |
| Rich-text editor frameworks (TipTap/Slate/Lexical) | Existing inline editing only needs page-box wrapping |
| paged.js / CSS Paged Media libs | Static-print-oriented, DOM-mutating, incompatible with live editing, shares no measurement model with react-pdf |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENGINE-01 | Phase 182 | Complete |
| ENGINE-02 | Phase 182 | Complete |
| ENGINE-03 | Phase 182 + 183 | Complete (182: token layer; 183: structural de-dup — templates now 519/536 lines composing 9 shared components, was 860/861) |
| PDFPAR-04 | Phase 182 | Complete |
| PDFPAR-01 | Phase 183 | Complete |
| PDFPAR-02 | Phase 183 | Complete |
| PDFPAR-03 | Phase 183 | Complete |
| PGBRK-01 | Phase 184 | Partial (184: engine + PDF side complete; web paginated preview consumes it in Phase 185) |
| PGBRK-02 | Phase 184 | Complete |
| PGBRK-03 | Phase 184 | Complete |
| PGBRK-04 | Phase 184 | Partial (184: engine + PDF side complete; web paginated preview consumes it in Phase 185) |
| PGBRK-05 | Phase 184 | Complete |
| PGMODE-01 | Phase 185 | Complete |
| PGMODE-02 | Phase 185 | Pending |
| PGMODE-03 | Phase 185 | Pending |
| PGMODE-04 | Phase 185 | Complete |
| PGMODE-05 | Phase 185 | Pending |
| POLISH-01 | Phase 186 | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-27*
*Last updated: 2026-07-27 after roadmap creation — 18/18 requirements mapped to Phases 182-186, 0 orphans, 0 duplicates*
