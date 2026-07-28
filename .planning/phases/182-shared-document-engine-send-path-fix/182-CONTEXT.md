# Phase 182: Shared Document Engine + Send-Path Fix - Context

**Gathered:** 2026-07-27
**Status:** Ready for planning
**Source:** Owner conversation (2026-07-27) + v4.23 research (SUMMARY/ARCHITECTURE/STACK/PITFALLS)

<domain>
## Phase Boundary

Foundation phase of milestone v4.23. Delivers (a) the shared document engine — one source for document model, label maps, design tokens, and formatting helpers consumed by all four renderers — and (b) the standalone TRUST-01 send-path fix (one shared in-process PDF renderer resolver used by download/email/WhatsApp). This phase is STRUCTURAL: rendered output of all four surfaces must stay visually unchanged (parity redesign is Phase 183; pagination is Phase 184). Requirements: ENGINE-01, ENGINE-02, ENGINE-03, PDFPAR-04.

</domain>

<decisions>
## Implementation Decisions

### Shared document engine (ENGINE-01..03)
- One shared source (suggested `lib/estimate/document/`) for: document model types, label maps (en/pt/es), design tokens (colors/spacing/typography roles per template), and formatting helpers (money, date with the local-midnight timezone fix, address).
- The four renderers — `components/workspace/estimate/estimate-document.tsx`, `components/share/estimate-document-modern.tsx`, `components/pdf/estimate-pdf.tsx`, `components/pdf/estimate-pdf-modern.tsx` — consume the shared source; their duplicated local copies (PDF_LABELS, DOC_LABELS, formatAddress, formatDate, DATE_LOCALE) are deleted.
- Only ONE of the four current copies has the local-midnight date fix — the shared helper must be the fixed version, and all four surfaces adopt it.
- Page geometry defined once: LETTER 612×792pt; pt↔px conversion (1.333× @96dpi) in the same module (ENGINE-02). The existing hardcoded 816×1056px approximation in the webview must reference this module.
- Template identity stays the existing registry (`lib/estimate/templates/registry.ts`, ids `classic`/`modern`); per-template design tokens layer over shared structure (ENGINE-03).
- CRITICAL server/client boundary: the shared module must be importable from BOTH client components and the server PDF path — no react-pdf imports in the shared core, no DOM/browser APIs in it either (see PITFALLS.md shared-code traps).
- Visual output unchanged this phase: refactor-only for the four renderers. Existing tests must stay green.

### Send-path fix (PDFPAR-04)
- Extract the proven pattern from `app/api/estimates/[id]/pdf/route.ts` (template registry resolution + `loadLatestSignedSnapshot` + `applySignedSnapshot` + preparedBy + photos) into ONE shared in-process resolver (suggested `lib/pdf/render-estimate-pdf.ts`) returning the rendered buffer.
- All three call sites consume it: `app/api/estimates/[id]/pdf/route.ts`, `app/api/estimates/[id]/send/route.ts`, `lib/whatsapp/pdf-delivery.ts`.
- NEVER an HTTP fetch from `pdf-delivery.ts` — Inngest/webhook context has no auth cookies; the resolver must accept an injected Supabase client (service-role in webhook context, user-session in routes) — this constraint is load-bearing and documented at `pdf-delivery.ts:5-8`.
- Email and WhatsApp PDFs must now honor: tenant `estimate_template_style`, signed snapshot (TRUST-01 — a signed estimate's emailed PDF must equal the signed content), preparedBy, attached photos.
- File-disjoint from the engine extraction stream → separate wave-parallel plans.

### Orchestration
- Model tiers: Sonnet executes plans; Opus validates (plan-check/verify); parallelize file-disjoint plans in the same wave.
- Work in-place on main, commit per task, NEVER `git push` from any agent.

### Claude's Discretion
- Exact module layout inside `lib/estimate/document/` (types.ts / labels.ts / tokens.ts / format.ts split).
- Whether the document-model mapping currently inlined in `components/share/estimate-view.tsx:134-223` moves into the shared module now or in 183.
- Test approach: prefer extending existing unit tests; add snapshot/structural tests for label parity if cheap.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone research (all four)
- `.planning/research/SUMMARY.md` — synthesis + phase derivation
- `.planning/research/ARCHITECTURE.md` — file-level extraction plan, parity checklist, new-vs-modified breakdown (primary source for this phase)
- `.planning/research/STACK.md` — react-pdf 4.4.0 constraints, fontkit/linebreak, do-not-add list
- `.planning/research/PITFALLS.md` — shared-code traps (client bundle vs server path), send-path traps, pt/px mismatch

### Live code (source of truth for current state)
- `app/api/estimates/[id]/pdf/route.ts` — the CORRECT pattern to extract (registry + snapshot + preparedBy + photos + ETag)
- `app/api/estimates/[id]/send/route.ts` — defect site (hardcoded Classic, live rows)
- `lib/whatsapp/pdf-delivery.ts` — defect site + no-HTTP-route constraint at lines 5-8
- `lib/estimate/templates/registry.ts` — template ids
- `lib/estimate/presentation-settings.ts` — existing shared resolver pattern to mirror
- `lib/queries/share.ts` — `loadLatestSignedSnapshot` (lines ~35-48)

</canonical_refs>

<specifics>
## Specific Ideas

- Owner: "o webview é o benchmark... o pdf precisa copiar os recursos dele" — but THIS phase only builds the shared foundation; visual copying is 183.
- Owner confirmed model split: "fable faz a orquestracao, opus valida, sonnet executa tudo, haiku faz o trabalho simples; tudo o que for possivel de fazer em paralelo vamos fazer".
- The `?deliveryLog=true` query param on the PDF route is dead (never read) — safe to clean while touching the route, low priority.

</specifics>

<deferred>
## Deferred Ideas

- Signature block + photo captions rendering → Phase 183 (PDFPAR-02/03).
- Pagination module → Phase 184.
- Email `attachPdf: false` hardcode in `send-hub-dialog.tsx:229` ("Email PDF" sends no PDF) — UI-side defect adjacent to PDFPAR-04; if the planner can include flipping it safely once the shared resolver exists, do it in this phase's send-path plan; otherwise defer to 183 with a note.
- ETag staleness on branding changes (route-level caching) — out of milestone scope.

</deferred>

---

*Phase: 182-shared-document-engine-send-path-fix*
*Context gathered: 2026-07-27 via owner conversation + milestone research*
