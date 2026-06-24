# Phase 105: `price_source: 'researched'` Threading - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous; milestone decisions locked in REQUIREMENTS.md + research/SUMMARY.md)

<domain>
## Phase Boundary

Plumb a third `price_source` provenance value — `'researched'` — end to end through the estimate stack (AI output schema, TS types, DB CHECK constraint, persistence, and the estimate editor price badge), shipped **dormant**: nothing tags an item `researched` yet, so there is zero runtime behavior change. This is the foundation that unblocks the real research wiring in Phase 107/108.

Scope is RPRICE-02 and the **type/schema-layer parts only** of RPRICE-03 (a price-book match must still win at the type layer — precedence is fully enforced at runtime in Phase 108). Do NOT add any research/lookup behavior here.
</domain>

<decisions>
## Implementation Decisions

### Threading the `'researched'` value
- DB: widen the `estimate_items.price_source` CHECK constraint to accept exactly `price_book | ai_estimate | researched` (idempotent migration; follow the existing migration conventions and the deploy-via-CI posture — do not build on the VPS).
- AI output schema (`lib/ai/schema.ts`): relax the D-15 `price_source` preprocess so `'researched'` is a valid value (today anything != 'price_book' coerces to 'ai_estimate' — that coercion must now also preserve 'researched').
- Types (`lib/ai/types.ts`) + `lib/ai/price-anchoring.ts`: type-widen only. `anchorAndClampSections` precedence is unchanged — a price-book match still overrides. No behavioral change.
- Editor badge (`components/workspace/estimate/item-row.tsx` + `item-card-mobile.tsx`): add a distinct "Researched" badge as a third variant alongside "Price book" and "AI estimate". The existing `Edited` rule (editing clears `price_source` to null) already covers researched items — confirm, do not re-implement.

### Dormant / behavior-preserving
- Nothing in this phase tags an item `researched`. The full unit + eval suite must stay green with the badge dormant — proving the threading is additive.
- Keep the v4.5 eval harness + CI regression gate green.

### Claude's Discretion
- Exact badge icon/label/variant styling for "Researched" (match the existing badge component conventions).
- Migration file naming/timestamp per existing convention.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/REQUIREMENTS.md` — RPRICE-02, RPRICE-03 (the milestone's locked acceptance criteria + locked decisions block)
- `.planning/research/SUMMARY.md` — synthesized research; the `'researched'` threading is the foundation phase
- `.planning/research/ARCHITECTURE.md` — the exact "~8 files to modify" list for the `'researched'` thread + precedence notes
- `lib/ai/schema.ts` — the D-15 `price_source` preprocess to relax
- `lib/ai/price-anchoring.ts` — precedence boundary (`price_book` wins); type-widen only
- `lib/ai/types.ts` — `LineItemOutput` / `price_source` type
- `components/workspace/estimate/item-row.tsx` + `item-card-mobile.tsx` — existing price badges (CheckCircle2 "Price book", Zap "AI estimate"), add the third
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Existing two-variant price-badge rendering in the estimate editor (`item-row.tsx` / `item-card-mobile.tsx`) — extend to three.
- `estimateOutputSchema` (`lib/ai/schema.ts`) zod preprocess pattern for `price_source`.
- The existing `estimate_items.price_source` CHECK constraint migration (from Phase 19 / v1.3) is the template for the widening migration.

### Established Patterns
- Migrations applied via CI→GHCR→Coolify (never built on the VPS); idempotent SQL.
- `price_source` is nulled on manual edit (the `Edited` badge path) — already implemented.

### Integration Points
- This phase ships dormant; Phase 108 is where `researched` actually gets written.
</code_context>

<specifics>
## Specific Ideas

No source-citation / range / confidence UI this milestone (deferred). The badge is the only user-visible surface in this phase.
</specifics>

<deferred>
## Deferred Ideas

None — phase scope is the dormant threading only. Runtime research wiring is Phases 107–108.
</deferred>
