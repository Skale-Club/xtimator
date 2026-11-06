---
id: SEED-057
status: execution plan, reviewed 2026-11-06 against the code
planted: 2026-11-06
planted_during: SEED-055 rollout (no active milestone)
trigger_when: With SEED-056 (same program: "the estimate, delivered well"). Owner asked for it on 2026-11-06.
scope: Large (6 phases; prompt, schema, pipeline, evals)
related: SEED-056 (document blocks), SEED-058 (speed)
---

# SEED-057 — A smarter estimator: structure, grounding, reliability

## 0. The ask

"A IA precisa ficar mais inteligente, melhor e executar um orçamento mais bem
estruturado … entregue de uma maneira mais confiável." This seed is the deep
review of how an estimate is produced today and the plan to raise its
quality floor, make its structure predictable, and make the result
trustworthy enough to send without rework.

## 1. How an estimate is produced today (verified 2026-11-06)

```
capture → transcribe-audio (Whisper via OpenRouter, Inngest step)
        → analyze-photos  (claude-sonnet-5 vision, 1 step per photo, PHOTO_PROMPT
                            or structured extract_photo tool, 450-token cap)
        → generate-estimate job (Inngest, retries 2, concurrency 1 per project)
            graph: ingest → generate → assess → (autoRefine → generate → assess) → finalize
            generate = context → drafting (ONE tool call, claude-sonnet-5 via OpenRouter,
                       temperature 0.3, max_tokens 8192, Gemini 2.5 Flash fallback,
                       one schema-repair retry) → pricing (price-book anchor +
                       batched web price research for `ai_estimate` items, cap 25)
                       → saving (dedupe, server totals, version bump, writes)
            assess   = isVagueEstimate: total <= 0 OR no items
            autoRefine (cap 1) = re-run generate with a generic "be more detailed" hint
            finalize (still vague) = revert, awaiting_details + needs-details questions
```

Files: `lib/services/generate-estimate.ts` (905 lines, the pipeline),
`lib/ai/prompt-builder.ts` (system + user prompt), `lib/ai/providers/openrouter.ts`
(tool schema), `lib/ai/schema.ts` (zod gate), `lib/ai/price-anchoring.ts`,
`lib/estimate/price-research/*`, `lib/estimate/quality/*`,
`lib/estimate/graph/*`, `lib/inngest/functions/{transcribe-audio,analyze-photos,generate-estimate}.ts`.

### 1.1 What is already strong (keep)

- Server-side authority over every number (anchoring, clamping, dedupe,
  computed totals, no AI calculator). Prompt-injection hardening on every
  untrusted field. Provider fallback + schema retry + truncation detection.
  Journal-driven phases and cost attribution. Price research is
  evidence-gated. Photo structured extraction (surfaces, measurements,
  damage) is persisted and serialised into the prompt.

### 1.2 Where the quality is lost

| # | Finding | Evidence | Effect on the estimate |
|---|---|---|---|
| Q1 | **The system prompt is generic.** One paragraph: "professional estimator… break into logical sections (Materials, Labor, Equipment)… realistic US pricing". No trade playbooks, no structure contract, no quantity-derivation rules, no exclusions/assumptions discipline. | `prompt-builder.ts:64` | Section layout and granularity vary run to run; a cleaning job and a roof job get the same instructions. |
| Q2 | **Measurements are not turned into quantities deterministically.** Photo extraction yields `measurements[]` with units and confidence, but the prompt only asks the model to "estimate"; there is no instruction to compute area/linear ft from stated dimensions, to carry the unit through, or to flag estimated vs stated. | `photo-extraction-schema.ts`, `prompt-builder.ts` | Quantities are guessed even when the walkthrough stated "12 by 14 room". |
| Q3 | **The output schema cannot express uncertainty or scope boundaries.** No `assumptions[]`, `exclusions[]`, `open_questions[]`, no per-item `confidence`, no `optional`/`alternate` items. The only prose fields are `summary/notes/timeline/payment_terms/warranty_terms`. | `lib/ai/schema.ts`, `openrouter.ts:30-120` | The model hides assumptions inside `notes` prose or drops them; the owner cannot see what was guessed; the needs-details flow only fires when the whole estimate is $0. |
| Q4 | **The AI authors boilerplate it should not own** (payment/warranty terms, timeline, notes on every run). | SEED-056 §1 | Covered by SEED-056 Phase C. |
| Q5 | **Vagueness is binary and only catches $0.** `isVagueEstimate` = total <= 0 or no items. A three-line "$2,400 misc" estimate passes. | `quality/vagueness.ts` | Thin estimates ship; the auto-refine loop (one generic hint) almost never triggers on them. |
| Q6 | **Auto-refine is a blind retry.** Same input + "please be more detailed". No diagnosis of what was missing. | `graph/nodes/auto-refine.ts` | A second 75-second drafting pass that usually reproduces the first. |
| Q7 | **Price research runs per line, not per trade.** Each `ai_estimate` item is searched as its own string ("Install toilet"), in one batched prompt, evidence-gated. Prices for the same concept differ by wording; the cache key is the normalised name. No unit normalisation (per sq ft vs per job). | `price-research/orchestrator.ts`, `search-prompt.ts` | Inconsistent unit prices across runs; research misses when the model phrases an item unusually. |
| Q8 | **The company Knowledge base is never fed to the estimator.** `lib/knowledge/retrieve.ts` exists; nothing in `lib/services`, `lib/ai` or `lib/estimate` imports it. Only the Security block mentions `<knowledge>` tags. | grep 2026-11-06 | Owners type their rules and prices into Settings → Knowledge and the estimate ignores them. |
| Q9 | **No trade-specific pricing memory beyond the price book.** Researched prices are cached per (name, region) with a TTL; accepted/sent estimates are not mined. | `price-research/cache.ts` | Every company starts from zero; the model's "US market rate" is the baseline. |
| Q10 | **Evals do not measure quality.** 5 fixture cases with mocked providers assert schema validity, item count, total, and non-vagueness. No live-model eval, no structure rubric, no regression on prompt changes. | `tests/eval/*` | Prompt changes ship with no quality signal. |
| Q11 | **The model is asked for everything in one shot.** Project name, trade detection, client name, summary, all sections and items, prose, classification, cost/markup, in one 8k-token tool call at temperature 0.3. | `openrouter.ts:233-260` | Long outputs drift; the structure contract competes with the pricing task; no reasoning step before the numbers. |
| Q12 | **Photo analysis is per photo, with no cross-photo synthesis.** Each photo gets its own 450-token description; the estimator receives N independent paragraphs. | `analyze-photos.ts`, `photo-context.ts` | Duplicated items (the same wall counted twice), no consolidated room/measurement list. |

## 2. Target: what "well structured and reliable" means

A generated estimate must satisfy a **structure contract** that is the same
for every run and every trade:

1. **Scope narrative** (summary): what, where, for whom, in 2–4 sentences,
   in the estimate language.
2. **Sections follow the trade's playbook order** (e.g. cleaning: Areas →
   Add-ons; remodel: Demo → Rough → Finish → Cleanup; roofing: Tear-off →
   Underlayment → Shingles → Flashing → Cleanup). Section titles come from a
   fixed vocabulary per trade, with a free "Other" allowed.
3. **Every line item** has: description in the imperative ("Remove and haul
   away…"), a quantity derived from stated measurements when they exist, a
   unit from a closed list (`each, hour, sq ft, linear ft, cu yd, day, job`),
   a unit price, `tax_category`, and `price_source`.
4. **Assumptions and exclusions are explicit** and rendered as the
   Notes/Assumptions block (SEED-056) only when non-empty.
5. **Open questions** are a first-class output: anything the model had to
   guess that moves the price by more than ~10% becomes a question, surfaced
   in the capture result and the editor, not buried.
6. **Numbers are grounded in this order**: price book → company knowledge
   → researched regional price → model estimate, and the source is visible
   per line.
7. **Confidence** is reported per line and aggregated; a low-confidence
   estimate is still delivered, with a banner, never silently.

## 3. Plan

### Phase A — Output contract v2 (schema + tool + zod, additive)

Files: `lib/ai/schema.ts`, `lib/ai/types.ts`, `lib/ai/providers/openrouter.ts`
(`estimateToolSchema`), `lib/ai/providers/gemini.ts`, `lib/ai/providers/anthropic.ts`,
`tests/unit/ai/tool-schema-fields.test.ts`, migration for
`estimates.ai_meta JSONB` and `estimate_items.confidence`/`assumption`.

- Add, all optional (legacy outputs keep parsing): top-level `assumptions:
  string[]`, `exclusions: string[]`, `open_questions: { question, impact:
  'low'|'medium'|'high' }[]`, `scope_confidence: 'low'|'medium'|'high'`;
  per section `purpose?: string`; per item `confidence?: 'low'|'medium'|'high'`,
  `basis?: string` (one line: "from the 12×14 ft room stated in the audio"),
  `optional?: boolean`, `unit` restricted to the closed list with a
  normaliser for synonyms (sqft → sq ft, hrs → hour).
- Persist: `assumptions/exclusions/open_questions/scope_confidence` in
  `estimates.ai_meta`; `confidence`, `basis`, `optional` on items.
- Remove `payment_terms`/`warranty_terms` from the generate-mode tool
  (SEED-056 Phase C) and gate `timeline`/`notes` the same way.
- Tests: parity test extended to the new keys on all three adapters; schema
  tests for the unit normaliser.

### Phase B — Prompt v2: trade playbooks + structure contract + grounding

Files: `lib/ai/prompt-builder.ts`, new `lib/ai/playbooks/{index,cleaning,
painting,landscaping,plumbing,electrical,hvac,roofing,remodel,general}.ts`,
`lib/ai/prompt-sections.ts` (pure builders, unit-tested), `tests/unit/ai/prompt-builder.test.ts`.

1. **Structure contract block** (§2 items 1–7) in the system prompt, in
   every mode.
2. **Trade playbook block**, selected by `detected_trade` from a cheap
   pre-pass (Phase C) or `company.industry`: section vocabulary and order,
   typical unit per task, what must always be itemised (disposal, permits,
   prep, protection), what must be an exclusion by default, typical
   quantity formulas (paint: wall area = perimeter × height − openings,
   coverage 350 sq ft/gal; flooring: area + 10% waste; roofing: squares).
   One file per trade, plain data, reviewed by the owner.
3. **Quantity derivation rules**: use stated measurements first (audio, photo
   `measurements[]` with `stated` confidence), then estimated ones with a
   `basis`, never silent guesses; carry units; round sensibly.
4. **Company knowledge block** (closes Q8): `retrieveKnowledge(companyId,
   query)` top-k entries, injected as `<knowledge>` tagged untrusted text
   with a one-line instruction ("apply these house rules and prices").
5. **Few-shot**: one compact exemplar per playbook (5–8 items) showing the
   contract. Kept under ~600 tokens each; only the selected trade's exemplar
   is sent.
6. Prompt size budget asserted in a test (system prompt < 6k tokens for any
   trade).

### Phase C — Two-step generation: plan, then price

Files: `lib/services/generate-estimate.ts`, new `lib/ai/plan-scope.ts`,
`lib/ai/providers/openrouter.ts` (second tool `plan_scope`), journal phase
vocabulary (`generation-phases.ts`: add `planning`).

1. **Step 1 `plan_scope`** (fast, ~1–3k output tokens, same model or Haiku):
   from transcripts + photo extractions + knowledge, return `detected_trade`,
   a consolidated **measurement table** (deduped across photos: room/surface,
   dimension, value, unit, source), the section plan (titles + purpose), the
   assumption/exclusion/question lists, and `scope_confidence`. No prices.
2. **Step 2 `create_estimate`** receives the plan as structured context and
   fills items + prices under the playbook. The plan's measurement table is
   the only source for quantities; the model cites `basis` per item.
3. Auto-refine (Q6) becomes targeted: if assess finds a problem, the hint is
   specific ("section Demo has no disposal line", "3 items have no unit",
   "quantity for 'Paint walls' lacks a basis although the plan has a stated
   wall area").
4. Latency: step 1 adds ~10–20 s but step 2 gets shorter and more
   deterministic; the net is measured in Phase F before enabling by default
   (feature flag `ESTIMATOR_TWO_STEP`, default off until the eval passes).

### Phase D — Quality gates that see thin estimates

Files: `lib/estimate/quality/{vagueness,consistency,quality-signal}.ts`,
new `lib/estimate/quality/structure-score.ts`, `graph/nodes/assess.ts`.

- `scoreStructure(estimate, playbook)` → 0–100 from: items per section ≥ 1,
  units from the closed list, every item has quantity > 0 and a basis when a
  measurement exists, playbook mandatory lines present (prep, disposal,
  cleanup where applicable), no duplicate descriptions, no "misc/other"
  line above 15% of the total, summary present, open questions ≤ 5.
- Assess routes: score < 50 → autoRefine with the specific findings;
  50–70 → deliver with an "AI needs review" banner listing the findings;
  ≥ 70 → deliver. The $0 rule stays as the hard floor.
- `needs-details` (clarifying questions) now comes from `open_questions`
  first and only falls back to the classification call when the list is empty.

### Phase E — Pricing grounding

Files: `lib/estimate/price-research/{orchestrator,normalize,search-prompt}.ts`,
`lib/ai/price-anchoring.ts`, new `lib/estimate/pricing/company-history.ts`,
migration for `price_observations` (company_id, concept_key, unit, unit_price,
source: 'accepted_estimate'|'price_book'|'researched', observed_at).

1. **Concept keys**: research and cache by `(trade, task_concept, unit,
   region)` where `task_concept` comes from the playbook vocabulary the
   model now uses, not the free description. Synonyms collapse.
2. **Company history as a price source** (Q9): when an estimate is accepted
   or sent, record its line prices as observations; at generation, anchor
   to the company's own median for the same concept+unit before researching
   (precedence: price book > company history > researched > model).
   `price_source` gains `'company_history'` (DB CHECK update).
3. **Unit-aware research prompt**: ask for the price in the item's unit and
   reject results in another unit.
4. Keep the evidence gate and the $0 ladder unchanged.

### Phase F — Evals that measure quality, and a live canary

Files: `tests/eval/*`, new `tests/eval/rubric.ts`, `tests/eval/live/*`
(skipped in CI unless `EVAL_LIVE=1`), `.github/workflows/eval-live.yml` (manual).

1. **Rubric** reusing the production `scoreStructure` + checks per golden
   case: expected sections present (by vocabulary), expected item concepts
   present, quantities within ±20% of the stated measurements, total within
   a band, assumptions non-empty when the fixture omits a dimension, open
   questions raised for the deliberately ambiguous case.
2. **Golden set**: 15–20 real-shaped cases across the trades the customers
   use (cleaning, painting, landscaping, plumbing, electrical, HVAC,
   roofing, remodel), each with transcript and photo-extraction fixtures in
   en and pt. Built from anonymised production captures.
3. **Live canary** (manual workflow, real model, ~$1/run): runs the golden
   set against the current prompt and posts the rubric scores; blocks a
   prompt/playbook change from merging when the mean drops > 5 points.
4. Latency and cost per case are recorded alongside the score so Phase C's
   two-step mode is judged on all three.

### Phase G — Surfacing in the product (small, after SEED-056 Phase D)

- Editor: "AI assumptions" and "Open questions" panel under the summary
  (editable; answering a question re-runs refine with the answer); per-line
  confidence dot with the `basis` on hover; "AI needs review" banner from
  Phase D.
- Capture result popup: the open questions replace the generic
  "awaiting details" copy when present.

## 4. Decisions for the owner

| # | Decision | Proposed |
|---|---|---|
| E1 | Two-step generation (plan → price) | Build behind a flag; enable only when the live eval shows ≥ +10 rubric points at ≤ +15 s median. |
| E2 | Trade playbooks | Start with the 8 trades above; the owner reviews each file (they are plain data). |
| E3 | Company history as a price source | Yes, from accepted estimates only (not drafts), per concept+unit, median of the last 10. |
| E4 | Model | Keep `anthropic/claude-sonnet-5` for `create_estimate`; use `claude-haiku-4-5` for `plan_scope` only if the eval shows no loss. |
| E5 | Knowledge base injection | Yes, top-5 entries by similarity, hard cap 1.5k tokens. |

## 5. Risks

- Prompt growth raises cost and latency: budget asserted by test; playbook
  is per trade, not all trades.
- Schema v2 must stay additive; Gemini and Anthropic adapters must carry the
  same keys (parity test).
- A stricter assess could block more estimates: the 50–70 band delivers with
  a banner instead of blocking; only < 50 refines, cap 1 as today.
- Live evals cost money: manual trigger, capped case count.

**Deploy order (migration `20261108000001_estimator_intelligence.sql`).**
Unlike SEED-056, the code is written to survive running BEFORE the migration:
no SELECT on a hot path names a new column (the editor reads `estimates` with
`select('*')` and items through `estimate_items(*)`), the new columns are
written in the same insert and the insert is retried without them when the
database says the column does not exist (`isMissingColumnError`), the
company-history source is silent until `price_observations` exists and has
rows, and observation recording is best-effort. Recommended order anyway:
apply the migration first, verify `estimates.ai_meta`,
`estimate_items.confidence/basis/optional`, the widened `price_source` CHECK and
`price_observations` exist, then push. Until it is applied the AI assumptions /
open questions simply are not persisted. `ESTIMATOR_TWO_STEP` needs no schema.
