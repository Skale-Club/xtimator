---
id: SEED-056
status: execution plan, reviewed 2026-11-06 against the code
planted: 2026-11-06
planted_during: SEED-055 rollout (no active milestone)
trigger_when: Next estimate-editor / settings work. Owner asked for it explicitly on 2026-11-06.
scope: Large (5 phases, ~30 files, 1 migration)
supersedes: the "Document Sections" half of SEED-041 (the gear panel shipped in Phase 162; this seed fixes its defaults)
program: "The estimate, delivered well" = SEED-056 (document blocks) + SEED-057 (estimator intelligence) + SEED-058 (speed). Execute 058 §1 first (local dev), then 056 A–C with 057 A–B, then 056 D–E with 057 C–G, with 058 §2 P1 scheduled independently.
---

# SEED-056 — Progressive estimate sections: start simple, add on demand

## 0. The problem in one paragraph

A brand-new estimate is born with **seven** extra blocks switched on (summary,
line sections, payment terms, timeline, warranty, notes, photos) plus the
company "Estimate Terms" card, and the AI fills five of them with prose on
every run. The owner never asked for any of it: onboarding force-seeds
`Net 30` / `1 year` into the company defaults even when the fields are left
blank, and the generator lets the model author its own payment and warranty
text, so a fresh AI estimate opens already marked **CUSTOMIZED** against a
default the owner never wrote (screenshot 1). A blank manual estimate opens
with four empty bordered cards to fill. The product promise is "job-site
recording → professional estimate in under 5 minutes"; the document should
start with what carries information (header, client, line items, totals) and
grow only when the company configured a block or the owner adds one.

## 1. What the code does today (verified 2026-11-06)

### 1.1 Data model and defaults

| Piece | Where | Behaviour today |
|---|---|---|
| Section visibility | `lib/estimate/presentation-settings.ts` `DEFAULT_SECTION_VISIBILITY` | All 7 keys `true`. `estimates.presentation_settings` is `NULL` on every new row, so every estimate resolves to "everything visible". |
| Company defaults | `companies.default_payment_terms`, `default_warranty_terms`, `default_tax_rate`, `default_validity_days`, `estimate_terms_enabled/_text` | Payment/warranty are plain text with **no enabled flag**; "configured" is inferred from non-empty text. |
| Onboarding seeding | `lib/schemas/onboarding.ts:52-53`, `lib/actions/company.ts:220-221`, `components/onboarding/onboarding-survey.tsx:19` | Blank input becomes `'Net 30'` and `'1 year'`. **It is impossible for a company to have no payment/warranty default.** |
| Copy at creation | `lib/actions/estimate.ts:469-486` (blank), `lib/services/generate-estimate.ts:643-649` (AI) | Both copy payment/warranty onto the estimate row. `presentation_settings` is never written at creation. |
| AI output | `lib/ai/schema.ts`, `lib/ai/providers/openrouter.ts:52-56`, `lib/ai/prompt-builder.ts` | Tool schema exposes `summary` (required), `notes`, `timeline`, `payment_terms`, `warranty_terms` (optional, one-line descriptions). The prompt **never passes** `defaultPaymentTerms` / `defaultWarrantyTerms` (the `EstimateInput` fields exist in `lib/ai/types.ts:61-62` but `prompt-builder.ts` ignores them). `generate-estimate.ts` uses `aiEstimate.payment_terms ?? company.default_payment_terms`, so **the model's invented text always wins** → "CUSTOMIZED" on birth. The model also writes timeline and notes on every run. |
| Validity days | `companies.default_validity_days` | Orphaned: editable in Settings, read by nothing (`lib/estimate/profile-field-map.ts`). |
| Digital signature toggle | `components/settings/defaults-form.tsx` **and** `components/settings/delivery-settings-form.tsx` | Same column edited from two forms; the Delivery page (`/settings/delivery`) is not in `settings-nav.tsx`. |

### 1.2 Rendering (the four surfaces + text channels)

| Surface | Terms blocks gate | Empty content |
|---|---|---|
| Editor preview `components/workspace/estimate/estimate-document.tsx:1625-1637, 1956-2030` | `isSectionVisible && (isEditable \|\| value != null)` | **Edit mode renders every visible block even when empty** (4 empty cards on a blank estimate). |
| Page view (same component, `isEditable=false`) and public share `components/share/estimate-view.tsx` | same predicate | hidden when `null` |
| Modern template `components/share/estimate-document-modern.tsx:128-131, 408-444` | same | hidden when `null` |
| PDF classic/modern via `lib/estimate/pagination/blocks-from-model.ts:606-623` + `components/pdf/shared/pdf-terms-section.tsx:119-123` | `isSectionVisible && !!text` | hidden when empty |
| WhatsApp text `lib/whatsapp/formatter.ts:147` | only the `sections` toggle is honoured; terms never sent | n/a |
| Plain-text template `lib/utils/estimate-template.ts` | `sections` toggle | n/a |
| Company "Estimate Terms" card | `company.estimate_terms_enabled && text` on every surface | **No per-estimate toggle** — the only block the gear panel cannot hide. |

Hiding is already non-destructive (content stays in the column; only
`presentation_settings.sections.<key>: false` is written). Keep that.

### 1.3 Controls

- Gear panel `components/workspace/estimate/presentation-settings-panel.tsx`:
  Pricing (tax/discount/deposit) + a flat 7-switch "Document Sections" grid.
  Semantics are *hide*, not *add*; nothing tells the owner where the default
  came from or how to change it for future estimates.
- Settings → Estimates (`app/(app)/settings/(tabs)/estimates/page.tsx`):
  `DefaultsForm` (tax, validity, payment text, warranty text, signature switch)
  + `EstimateTermsForm` (enable switch + text). No place to say "my estimates
  should / should not carry a timeline or notes".
- Settings → Message Template: the send-flow cover text (greeting / opener /
  closer / sign-off, `lib/utils/estimate-template.ts`). Unrelated to the
  document blocks; fine as is, only the nav label is ambiguous.

## 2. Target model

**Principle.** A block appears on an estimate only if one of these is true:

1. the company turned it on in Settings → Estimates → *Document blocks*, or
2. the owner added it on this estimate (gear panel or "+ Add block"), or
3. it is the AI summary and the company kept "AI summary" on (default on).

Everything else starts **off**. Turning a block on never writes content;
turning it off never deletes content (unchanged non-destructive rule).

### 2.1 Block catalogue

| Block | Kind | System default | Company default source | AI may author |
|---|---|---|---|---|
| Line items (`sections`) | core | on | — (not configurable) | yes (core output) |
| Summary | AI prose | **on** for AI estimates, **off** for blank manual ones | `document_blocks.summary` | yes |
| Payment terms | company text, per-estimate override | off | on iff `default_payment_terms` non-empty **and** `document_blocks.payment_terms !== false` | **no** (generate mode) |
| Warranty | company text, per-estimate override | off | same pattern with `default_warranty_terms` | **no** (generate mode) |
| Estimate terms (fine print) | company text, read-only on the estimate | off | `estimate_terms_enabled && text` (existing) | no |
| Timeline | per-estimate prose | off | `document_blocks.timeline` ("let the AI propose a timeline") | only when the block is on |
| Notes | per-estimate prose | off | `document_blocks.notes` ("let the AI add notes / assumptions") | only when the block is on |
| Photos | attachments | on when photos are attached (attachment is the opt-in) | `document_blocks.photos` | n/a |
| Valid until | header line | off | `default_validity_days` (currently orphaned) | no |

### 2.2 Resolution and the retrocompat rule

- `resolvePresentationSettings(raw)` **keeps its current signature and its
  all-visible fallback.** Legacy rows with `presentation_settings = NULL` must
  keep rendering exactly as they do today; sent and signed estimates are
  byte-identical. The 24 test files that pin the resolver are untouched.
- "Off by default" is achieved by **materialising** `presentation_settings.sections`
  at creation from the company's `document_blocks` (copy, not reference — the
  same rule `lib/estimate/profile-field-map.ts` already states for
  payment/warranty). Changing a company default later never alters existing
  estimates.
- One new key: `estimate_terms` joins `SectionKey` so the fine-print card can
  be hidden per estimate like every other block. Absent → visible (legacy).

### 2.3 Company-level storage

One nullable JSONB column, no new table:

```sql
ALTER TABLE companies ADD COLUMN document_blocks JSONB;
-- shape (all keys optional; absent = system default above):
-- { "summary": true, "payment_terms": true, "warranty_terms": false,
--   "timeline": false, "notes": false, "photos": true, "estimate_terms": false,
--   "valid_until": false }
```

Backfill (one-shot, idempotent):

```sql
UPDATE companies SET document_blocks = jsonb_build_object(
  'summary', true,
  'payment_terms', default_payment_terms IS NOT NULL AND btrim(default_payment_terms) <> '' AND default_payment_terms <> 'Net 30',
  'warranty_terms', default_warranty_terms IS NOT NULL AND btrim(default_warranty_terms) <> '' AND default_warranty_terms <> '1 year',
  'timeline', true,   -- existing customers keep today's behaviour (D3)
  'notes', true,      -- idem
  'photos', true,
  'estimate_terms', estimate_terms_enabled
) WHERE document_blocks IS NULL;
```

The literal seeds `'Net 30'` / `'1 year'` are treated as "never configured"
(they came from the schema default, not from the owner — D2). New companies
get `NULL` → system defaults (payment/warranty/timeline/notes **off**).

## 3. Decisions for the owner (defaults proposed; say "ok" or change)

| # | Decision | Proposed |
|---|---|---|
| D1 | Summary default | **On** for AI estimates (it is the walkthrough's narrative, not boilerplate), off for blank manual estimates. Company switch "AI summary" to turn it off globally. |
| D2 | Treat the forced `Net 30` / `1 year` as unset in the backfill | **Yes.** Owners who really want them re-type them in Settings (the text stays in the column; only the block flag is off). |
| D3 | Existing companies: timeline/notes blocks | **Keep on** for companies that already have estimates (no surprise change on a live account); **off** for new companies. |
| D4 | Validity days | **Wire it** as a "Valid until" header line (block off by default) rather than deleting the field. Small: `estimates.valid_until DATE`, set at creation from `estimate_date + default_validity_days`, editable in the header. If declined, delete the field from the form. |
| D5 | Signature switch | Keep it **only** in Delivery; add Delivery to the settings nav; remove it from `DefaultsForm`. |
| D6 | Settings nav label | "Message Template" → "Send Message" (what the client reads in the message, not the document). Copy-only. |

## 4. Phases

Each phase is independently shippable behind the current behaviour; the
visible change lands in Phase D. Commit per phase, run
`tsc -p tsconfig.ci.json` + `vitest run tests/unit tests/eval` before each
push (CI red blocks every deploy). Apply the migration to prod **before**
pushing Phase A.

### Phase A — Model and resolver (no UI change)

Files: `supabase/migrations/2026110700000_document_blocks.sql`,
`lib/estimate/presentation-settings.ts`, new `lib/estimate/document-blocks.ts`,
`lib/queries/company.ts`, `lib/schemas/estimate.ts`,
`lib/actions/estimate.ts` (`createBlankEstimate`),
`lib/services/generate-estimate.ts` (insert), `lib/estimate/profile-field-map.ts`,
`docs/estimate-profile-defaults.md`.

1. Migration + backfill from §2.3. Add `estimate_terms` to the
   `presentation_settings.sections` zod schema (`lib/schemas/estimate.ts:82-87`).
2. `lib/estimate/document-blocks.ts` (pure, no DB):
   - `type DocumentBlocks`, `resolveDocumentBlocks(raw, ctx)` → fully
     defaulted record, where `ctx = { hasPaymentText, hasWarrantyText,
     hasEstimateTerms, isAiEstimate }` drives the table in §2.1.
   - `initialSectionVisibility(blocks): Required<SectionVisibility>` → the
     object written to `presentation_settings.sections` at creation.
   - `aiAuthoredFields(blocks): { timeline: boolean; notes: boolean }`.
3. `SectionKey` gains `'estimate_terms'`; every `isSectionVisible` consumer
   of the fine-print card (editor, modern, `blocks-from-model.ts:606`,
   `pdf-terms-section.tsx:119`) adds the gate. Legacy absent → visible.
4. Both creation paths write `presentation_settings: { sections:
   initialSectionVisibility(...) }`. The AI path passes `isAiEstimate: true`.
5. Field-map + doc: `document_blocks` as profile-only; `valid_until` moves to
   default-with-override if D4 is accepted.
6. Tests: `tests/unit/estimate/document-blocks.test.ts` (goldens for every
   row of §2.1, legacy NULL, partial objects); creation-path tests assert the
   materialised sections object; existing resolver tests unchanged.

### Phase B — Settings → Estimates redesign + onboarding

Files: `components/settings/defaults-form.tsx` → split into
`document-blocks-form.tsx` and `pricing-defaults-form.tsx`;
`components/settings/estimate-terms-form.tsx` (folded into the blocks form);
`lib/actions/settings.ts` (`updateDocumentBlocks`); settings page;
`lib/schemas/onboarding.ts`, `lib/actions/company.ts:220-221`,
`components/onboarding/survey/steps/defaults-step.tsx`,
`components/onboarding/survey/steps/review-step.tsx`,
`components/onboarding/step-address-defaults.tsx`.

1. **Document blocks card** — one row per block from §2.1: switch, one-line
   explanation, and for text-backed blocks an inline textarea that expands
   when the switch is on. Saving non-empty payment/warranty text flips the
   switch on; switching off keeps the text. "Estimate terms" becomes a row in
   this card (its two columns stay as they are).
2. **Pricing defaults card** — tax rate only (plus validity days if D4).
3. Onboarding: `defaultPaymentTerms` / `defaultWarrantyTerms` become optional
   with empty defaults; `company.ts` stops substituting `'Net 30'` / `'1 year'`;
   the review step shows "—" when blank. The step copy says "Optional. You can
   add these later in Settings."
4. Signature switch and nav per D5/D6.
5. Tests: `tests/unit/settings/*` for the new action's zod + persisted shape;
   onboarding schema test for blank defaults; `tests/eval/harness.test.ts:168`
   fixtures keep explicit values (they are fixtures, not seeds).

### Phase C — AI generation stops authoring boilerplate

Files: `lib/ai/providers/openrouter.ts` (tool schema builder),
`lib/ai/providers/anthropic.ts`, `lib/ai/providers/gemini.ts` (same tool
definition), `lib/ai/prompt-builder.ts`, `lib/ai/schema.ts`,
`lib/services/generate-estimate.ts`, `lib/ai/types.ts`.

1. `EstimateInput` gains `aiBlocks: { timeline: boolean; notes: boolean }`
   (from `aiAuthoredFields`). Drop the never-read `defaultPaymentTerms` /
   `defaultWarrantyTerms` from the input type.
2. Generate-mode tool schema: remove `payment_terms` and `warranty_terms`;
   include `timeline` / `notes` only when the matching `aiBlocks` flag is on.
   Prompt adds a "## Document blocks" paragraph: "Do not write payment or
   warranty terms; the company's own text is attached automatically. Omit
   `timeline` / `notes` [when off]. When on, write a timeline only if the
   source material states dates or durations; write notes only for
   assumptions the client must know." Refine mode keeps the full schema (the
   owner may ask "change the payment terms to 50% upfront").
3. `generate-estimate.ts`: `payment_terms: company.default_payment_terms`,
   `warranty_terms: company.default_warranty_terms` unconditionally; `timeline`
   / `notes` persisted only when the block is on (server-side discard as
   belt-and-suspenders against model drift). The zod schema keeps the fields
   optional so cached/legacy outputs still parse.
4. Tests: prompt-builder snapshot for both flag states; a schema test that
   the generate-mode tool definition has no `payment_terms` key; eval harness
   asserts a fresh AI estimate is **not** "customized" (`payment_terms ===
   company default`).

### Phase D — Editor: render only enabled blocks, add on demand

Files: `components/workspace/estimate/estimate-document.tsx`,
`components/workspace/estimate/presentation-settings-panel.tsx`,
`components/workspace/estimate/estimate-editor.tsx`,
`components/workspace/estimate/estimate-floating-actions.tsx`,
`lib/estimate/document/labels.ts` (new labels in en/pt/es),
`components/workspace/estimate/use-estimate-reducer.ts`.

1. Edit mode renders a terms block **only when its section is visible**;
   drop the `isEditable ||` escape hatch at lines 1956-2030 (view/share/PDF
   already behave this way, so this is the one surface that changes).
2. **"+ Add block"** row under the last rendered block (and under the totals
   when none is rendered): chips for every hidden block — Summary, Payment
   terms, Warranty, Timeline, Notes, Photos, Estimate terms (only if the
   company has fine-print text). Clicking a chip dispatches
   `UPDATE_PRESENTATION_SETTINGS` with that key `true`, pre-fills
   payment/warranty from `companyDefaults` when the column is still `null`,
   and focuses the textarea. Reuses `handlePresentationSettingsChange`, so it
   also works on sent/locked estimates (presentation-only save path).
3. Gear panel: rename the group to **Document blocks**; each switch gets a
   muted hint — "Company default" / "Added on this estimate" / "Hidden on this
   estimate"; footer link "Change defaults for new estimates → Settings".
   Add the `estimate_terms` switch (only when the company has text). Mobile
   sheet gets the same body.
4. `DefaultStateIndicator` stays; with Phase C it only ever shows CUSTOMIZED
   after the owner edited the text.
5. Photos: unchanged logic (visible iff attached and switch on). The Photos
   button in the floating pill already is the "add" affordance.
6. Tests: RTL for the add-block row (chip appears iff hidden; click reveals
   the card with focused textarea and a pre-filled company default);
   `presentation-settings-panel.test.tsx` updated for the new labels and the
   8th switch; snapshot of a blank estimate = header + client + items +
   totals + the add-block row and nothing else.

### Phase E — Cross-surface verification, text channels, docs

1. Manual pass on the four renderings (editor preview, page view, public
   page, classic + modern PDF) for: blank estimate, AI estimate with all
   blocks off, AI estimate with timeline on, legacy estimate with
   `presentation_settings = NULL`, signed estimate (must not change).
2. WhatsApp formatter and plain-text template: append payment / warranty /
   timeline / notes lines when their section is visible and non-empty
   (today they are silently dropped). Golden-file tests in
   `tests/unit/whatsapp/formatter.test.ts` with the resolver argument.
3. `tests/unit/estimate/presentation-settings-cross-surface.test.tsx` gains
   the `estimate_terms` key.
4. Update `docs/estimate-profile-defaults.md`, the field map, and
   `.planning/quick/…/ONBOARDING-PT.md` (the walkthrough mentions the
   payment/warranty step).

### Phase F — Follow-ups (own seeds, not blocking)

- D4 "Valid until" wiring if accepted (column, creation default, header
  line on the four surfaces, `estimate-header.tsx` editor).
- Company-level block **presets** ("Simple", "Full", "Service agreement")
  from SEED-041 §4 — only once the above has lived for a while.
- Trade-aware defaults: a cleaning company rarely wants warranty; a roofer
  always does. The onboarding trade suggestion could pre-tick blocks.

## 5. Risks and guards

**Deploy order: migration 20261107000002 must be applied to prod and both columns verified BEFORE pushing commits 5365a345 onward — getAuthContext/generateEstimateForProject select companies.document_blocks by name and fail closed without it.**

| Risk | Guard |
|---|---|
| Legacy estimates losing blocks | Resolver fallback unchanged; defaults materialised at creation only. |
| Signed / sent estimates changing | No column other than `presentation_settings` is rewritten; the lock-exempt `savePresentationSettings` path and the "already seen by the client" notice already exist. `estimates.updated_at` is a concurrency token — never touch it outside that path. |
| AI output drift after the schema change | Server discards `payment_terms` / `warranty_terms` in generate mode regardless of what the model returns; zod keeps them optional. |
| Owners who typed `Net 30` on purpose | Text is preserved; only the block flag is off. One toggle in Settings restores it. |
| Red CI blocks deploys | Each phase runs the scoped `tsc` + vitest gate; new RTL tests use the renamed labels (grep `tests/` for every label you rename). |
| Migrations are applied by hand | Apply `document_blocks` to prod (MCP server f2b95485) before pushing Phase A. |

## 6. Done looks like

- A new company that skipped payment/warranty in onboarding creates an
  estimate that shows header, client, line items and totals, plus an AI
  summary — and one "+ Add block" row. Nothing is marked CUSTOMIZED.
- Typing payment terms in Settings → Estimates makes every **new** estimate
  carry that block; existing estimates are unchanged.
- On any estimate, the owner adds Timeline with one click, types two lines,
  and it appears identically in the editor, the page view, the public link,
  both PDFs and the WhatsApp text.
- An estimate signed before this seed renders byte-identically.
