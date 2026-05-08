# Phase 23: Estimate Editor Price Badges - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Add price-origin badges to every line item in the estimate editor:
- `price_source = 'price_book'` → "✓ Price book" badge
- `price_source = 'ai_estimate'` → "⚡ AI estimate" badge
- `price_source = null` → no badge (pre-v1.3 estimates, or after manual save)

When the user manually edits a unit price, the origin badge is replaced with a neutral "Edited" indicator until the estimate is saved, at which point `price_source` is set to `null` in the DB and the badge disappears permanently.

**In scope:** `EditorItem` type extension, badge rendering in estimate-editor.tsx, `UPDATE_ITEM` reducer behavior, saveEstimate action update to persist `price_source: null` on manual overrides.
**Not in scope:** "Save to price book after manual override" (explicitly deferred per REQUIREMENTS.md). PDF badge rendering. Share page badges. Per-company AI provider (Phase 22 scope). EDITPRICE-03+ (future).

</domain>

<decisions>
## Implementation Decisions

### Data Layer

- **D-01:** Add `price_source: 'price_book' | 'ai_estimate' | null` to `EditorItem` interface in `use-estimate-reducer.ts`. Add `isManuallyEdited?: boolean` as a client-only flag (never sent to DB).

- **D-02:** In the `EditorSection` mapping that builds `EditorItem` from DB rows (lines 94-99 of `estimate-editor.tsx`), include `price_source: i.price_source ?? null` and `isManuallyEdited: false`.

- **D-03:** In the `UPDATE_ITEM` reducer case for `field === 'unit_price'`: set `isManuallyEdited: true` on the updated item. This flag toggles the badge from origin → "Edited" without touching the original `price_source`.

- **D-04:** In `saveEstimate` (or wherever the save action maps `EditorItem` to DB rows): for items with `isManuallyEdited: true`, write `price_source: null` to `estimate_items`. For items with `isManuallyEdited: false`, preserve existing `price_source`. The DB CHECK constraint already allows `null`, so no migration is needed.

### Badge Visual

- **D-05:** Use the existing `Badge` component from `components/ui/badge.tsx` (shadcn/ui). No new component needed.

- **D-06:** Badge placement: **inline, to the right of the unit_price field** within the item row. Compact — icon (3×3 SVG) + short text. Does not push other columns.

- **D-07:** Badge variants and copy:
  - `price_source === 'price_book'` → `<Badge variant="secondary"><CheckCircle2 className="h-3 w-3" /> Price book</Badge>` — secondary variant gives a subtle filled look
  - `price_source === 'ai_estimate'` → `<Badge variant="outline"><Zap className="h-3 w-3" /> AI estimate</Badge>` — outline/muted; secondary role
  - `isManuallyEdited === true` (regardless of price_source) → `<Badge variant="outline">Edited</Badge>` — neutral, no icon, signals user override
  - `price_source === null && !isManuallyEdited` → no badge rendered (pre-v1.3 estimates — SC-3 zero-error requirement)

- **D-08:** Icons from `lucide-react` (already installed): `CheckCircle2` for price_book, `Zap` for ai_estimate. Both currently used elsewhere in the editor shell.

- **D-09:** Badge font-size inherits from the Badge component defaults (text-xs). Matches the existing auto-save status indicator style.

### EDITPRICE-02 Flow (manual override lifecycle)

- **D-10:** User edits unit_price → `dispatch({ type: 'UPDATE_ITEM', field: 'unit_price', ... })` → reducer sets `isManuallyEdited: true` → badge immediately shows "Edited" (client-side only, no network call).

- **D-11:** On save (auto-save or explicit save button) → `saveEstimate` serializes items → items with `isManuallyEdited: true` write `price_source: null` to DB → after successful save, re-fetch or reset `isManuallyEdited` to `false` (price_source is now `null` from DB) → badge disappears (null + !isManuallyEdited = no badge).

- **D-12:** If the user edits, then reverts the price back to the original value: the "Edited" badge stays until save (tracking exact-value equality adds complexity for no UX benefit). Simpler rule: once unit_price is touched in a session, `isManuallyEdited` stays true until save.

### Claude's Discretion

- Exact CSS/layout for badge positioning within the item row (flex/grid alignment)
- Whether to reset `isManuallyEdited` after save by re-initializing state from the saved estimate data (cleaner) or by mutating the flag in the reducer (simpler)
- Text copy for badges: "Price book" / "AI estimate" / "Edited" — keep English-only (i18n of editor strings is deferred per existing pattern)
- Whether `isManuallyEdited` is tracked on `EditorSection` or just `EditorItem` — item level is sufficient

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core Files to Modify
- `components/workspace/estimate/use-estimate-reducer.ts` — add `price_source` + `isManuallyEdited` to `EditorItem`; update `UPDATE_ITEM` case; update `LOAD_ESTIMATE` case
- `components/workspace/estimate/estimate-editor.tsx` — map `price_source` when building `EditorItem`s; render badge inline with unit_price; pass `price_source` to save action
- `lib/actions/estimate.ts` — update `saveEstimate` to write `price_source: null` for manually-edited items (find the `estimate_items` update block)

### Prior Phase Artifacts
- `.planning/phases/22-ai-price-anchoring/22-03-SUMMARY.md` — confirms `price_source: item.price_source` is now persisted to `estimate_items` by the generate-estimate route
- `.planning/phases/19-price-book-db-foundation/19-01-SUMMARY.md` — confirms `estimate_items.price_source` CHECK constraint: `'price_book' | 'ai_estimate' | null`
- `types/database.types.ts` — `estimate_items.price_source: string | null` in Row/Insert/Update

### Roadmap & Requirements
- `.planning/ROADMAP.md` §"Phase 23" — 3 success criteria (SC-1 badges visible, SC-2 badge clears on edit, SC-3 null = no badge)
- `.planning/REQUIREMENTS.md` §EDITPRICE-01 and EDITPRICE-02

### Existing Component References
- `components/ui/badge.tsx` — shadcn Badge with variants: default, secondary, destructive, outline, ghost, link
- `components/workspace/estimate/estimate-editor.tsx` — full file; understand item row layout before adding badge
- `components/workspace/estimate/use-estimate-reducer.ts` — full file; understand EditorItem type and reducer shape

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`Badge` component** — `components/ui/badge.tsx` — direct reuse, `variant="secondary"` for price_book, `variant="outline"` for ai_estimate and "Edited"
- **`CheckCircle2`, `Zap` icons** — both from `lucide-react`, already imported elsewhere in the editor shell
- **Auto-save status indicator** — `estimate-editor.tsx` lines ~285-305 — uses similar small icon+text pattern; badge can adopt the same visual weight

### Established Patterns
- **`EditorItem` extension:** Previous phases added fields to this interface without issues; `price_source` and `isManuallyEdited` follow the same pattern as `sort_order` (operational field not directly from DB)
- **Reducer dispatch:** `dispatch({ type: 'UPDATE_ITEM', sectionId, itemId, field, value })` — `UPDATE_ITEM` already handles unit_price; need to add `isManuallyEdited: true` side effect in the reducer case
- **DB save:** `lib/actions/estimate.ts` maps `EditorItem[]` to DB rows — add `price_source` to the mapped fields (or set to `null` for edited items)

### Integration Points
- **Badge appears in:** `estimate-editor.tsx` — the item row where `unit_price` is rendered (currently just an `<input>`)
- **`price_source` flows from:** DB `estimate_items` → `EstimateWithSections` query type → editor initialization → `EditorItem` → badge render
- **`price_source` flows to:** `lib/actions/estimate.ts` saveEstimate → DB update (set null for edited items)

</code_context>

<specifics>
## Specific Ideas

- The "Edited" badge should visually feel different from both origin badges — no icon, just the word "Edited" in outline style — so users know it's a signal about their action, not about origin
- Pre-v1.3 estimates have `price_source = null` from the start; they silently render no badge with zero code changes needed (the `null → no badge` path is the natural fallback)

</specifics>

<deferred>
## Deferred Ideas

- **PDF badges** — not in scope; PDF uses `@react-pdf/renderer` and would need separate badge text rendering; deferred to v2 if requested
- **Share page badges** — the public estimate share view (`components/share/estimate-view.tsx`) is read-only; badges deferred there
- **"Save to price book?" prompt after override** — explicitly discarded in REQUIREMENTS.md ("descartado intencionalmente — preço ajustado é exceção per-cliente")
- **i18n for badge copy** — deferred; "Price book", "AI estimate", "Edited" stay English-only in v1.3 (no LanguageContext in editor item rows currently)
- **Bulk "Edited" reset** — if user wants to restore original badges, would require re-running AI generation; out of scope

</deferred>

---

*Phase: 23-estimate-editor-price-badges*
*Context gathered: 2026-05-08*
