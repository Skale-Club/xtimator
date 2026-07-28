# Phase 185: Paginated Editable Editor Mode - Context

**Gathered:** 2026-07-27
**Status:** Ready for planning
**Source:** Owner conversation (2026-07-27) + v4.23 research

<domain>
## Phase Boundary

The workspace estimate editor gains a paginated mode that mirrors the PDF like a PDF preview — fully functional AND editable — toggled by two icon buttons to the LEFT of "Edit with AI" in the project header. Requirements: PGMODE-01..05. Depends on: Phase 184 (pagination engine + measurement provider interface).

</domain>

<decisions>
## Implementation Decisions

### Toggle UI (PGMODE-01)
- Two icon buttons placed immediately LEFT of the "Edit with AI" button in the project page header (components/workspace/ project header — exact component identified in ARCHITECTURE.md as project-header.tsx).
- Button 1: full-width mode (CURRENT DEFAULT — today's continuous document view). Button 2: paginated mode (PDF-preview look).
- State bridges via the existing `VersionSlot` context pattern (components/workspace/estimate-version-context.tsx) — the proven ProjectHeader ↔ EstimateEditor bridge. NOT zustand, NOT URL params. Session-only state (persistence deferred — DEFER-04).
- Icon choice: conventional (e.g., lucide `StretchHorizontal`/`Rows` style for full-width vs `BookOpen`/`FileStack`/`File` page-stack for paginated) — pick clean, distinct icons; aria-labels + tooltips. OWNER REFERENCE IMAGE PENDING: the owner will send a preview of the desired pagination UI — build to standard PDF-preview conventions now; leave the visual layer trivially adjustable (tokens/classes), and note in the summary where to adjust when the reference arrives.

### Paginated rendering (PGMODE-02)
- Letter-size page boxes (geometry from lib/estimate/document — 816×1056px equivalent of 612×792pt), centered on a neutral canvas with page gaps, subtle shadow/border, page number chrome ("Page N of M") — like a PDF viewer.
- Page breaks come from the Phase 184 engine with the DOM measurement provider (measure real rendered block heights; the engine decides assignments). Same rules as PDF → mirror behavior.
- Both templates (classic + modern) work in paginated mode.

### Editing inside pages (PGMODE-03)
- ALL existing editing keeps working: inline field edits, add/remove items/sections, drag-reorder (dnd-kit), presentation-settings gear, photos, refine — the paginated view renders the SAME editable components, sliced into page boxes; no forked read-only copy.
- Page membership is a DERIVED read-only projection — never persisted, never a third dnd-kit axis. Reorder semantics operate on the document order exactly as today.
- Repagination: immediate on structural changes (add/remove/reorder); debounced (~300-500ms) while typing; focus must survive repagination (key by stable ids, never index-of-page).
- Performance guard: the 2000-line document component currently has zero memoization — add the minimal memoization needed so repagination doesn't thrash (measure, don't blanket-memo).

### Consolidation (PGMODE-04)
- The legacy `viewMode: 'width' | 'page'` CSS-zoom toggle (estimate-editor.tsx state + estimate-floating-actions.tsx "Full page"/"Full width" UI) is RETIRED/absorbed into the new header toggle — one "page" concept in the product. Remove the old buttons from the floating pill; keep whatever zoom-to-fit behavior is still useful inside the new paginated mode if trivial, else drop.

### Share webview untouched (PGMODE-05)
- The public share webview stays a single-page scroll — zero changes to app/estimate/[token] surfaces in this phase.

### Claude's Discretion
- Virtualization: only if measured necessary (avoid premature complexity).
- Exact debounce timing (research suggests 300-500ms; pick and document).
- How table header repetition renders in DOM pages (mirror the PDF's repeated header).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/research/ARCHITECTURE.md` — toggle placement, VersionSlot bridge, editing-reuse strategy, derived-projection rule
- `.planning/research/PITFALLS.md` — reflow thrash, focus loss, dnd-kit page-boundary, memoization traps
- `.planning/research/FEATURES.md` — paginated-editor UX conventions (toggle, debounce, no manual breaks)
- `lib/estimate/pagination/` — Phase 184 engine + measurement provider interface (input contract)
- `components/workspace/estimate/estimate-editor.tsx` + `estimate-floating-actions.tsx` — legacy toggle being consolidated
- `components/workspace/project-header.tsx` (or the actual header component) + `components/workspace/estimate-version-context.tsx` — toggle mount + state bridge
- `components/workspace/estimate/estimate-document.tsx` — the editable document being paginated

</canonical_refs>

<specifics>
## Specific Ideas

- Owner: "ao lado esquerdo de onde hoje está o edit with AI, precisa ter dois botões de icones ali — um para deixar o estimate em full width igual o estado default e um outro que é o sistema de paginação, igual um preview de pdf".
- Owner: "o paginado precisa ser completamente funcional e editável".
- Owner: "o webview continua normal, em uma página, e o sistema paginado fica como se fosse um espelho do pdf".
- Owner reference preview image: PENDING — will arrive after this phase may have started; build adjustable.

</specifics>

<deferred>
## Deferred Ideas

- Toggle state persistence per user/estimate → DEFER-04 (v2).
- Print-from-browser in paginated mode → future.
- Webview aesthetics → Phase 186.

</deferred>

---

*Phase: 185-paginated-editable-editor-mode*
*Context gathered: 2026-07-27 via owner conversation + milestone research*
