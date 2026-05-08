# Phase 22: AI Price Anchoring - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Three co-delivered capabilities:

1. **Multi-provider AI layer** — Extract the estimate generation logic from `app/api/generate-estimate/route.ts` into a provider-agnostic interface (`lib/ai/`). Ship two concrete adapters: Anthropic (Claude) and Google (Gemini). Admin panel controls which is active — no env vars, no redeploy required.

2. **Price book injection** — Before calling the AI, load the company's `company_price_book` rows and inject them as structured context in the system prompt. The AI uses those prices for matching line items and falls back to market-rate reasoning when there's no match.

3. **price_source tagging** — Add `price_source` to the AI tool schema (both adapters), persist it to `estimate_items.price_source` on insert.

**In scope:** `lib/ai/` provider layer, Claude adapter, Gemini adapter, admin panel provider selection UI, price book prompt injection, `price_source` in tool schema and DB insert.
**Not in scope:** Estimate editor price badges (Phase 23), per-company AI provider (platform-level only), fine-tuning, per-company model selection, "save to price book" from editor override (explicitly out of scope per REQUIREMENTS.md).

</domain>

<decisions>
## Implementation Decisions

### Multi-Provider Architecture

- **D-01:** Create `lib/ai/` directory with a provider interface. The route calls a factory, not the SDK directly. This decouples the route from any specific provider.

- **D-02:** File structure:
  ```
  lib/ai/
    types.ts               — EstimateInput, EstimateOutput, LineItemOutput (with price_source)
    provider.interface.ts  — AIProvider interface: generateEstimate(input): Promise<EstimateOutput>
    index.ts               — getAIProvider(): Promise<AIProvider> factory
    providers/
      anthropic.ts         — Claude adapter (migrates current route logic)
      gemini.ts            — Google Generative AI adapter (new)
  ```

- **D-03:** The `EstimateOutput` type mirrors the current `create_estimate` tool response shape, extended with `price_source` on every line item:
  ```typescript
  type LineItemOutput = {
    description: string
    quantity: number
    unit?: string
    unit_price: number
    price_source: 'price_book' | 'ai_estimate'  // NEW — required
  }
  ```
  Both adapters must return this shape. The route no longer parses raw SDK responses — it just calls the adapter and gets back `EstimateOutput`.

- **D-04:** `getAIProvider()` reads the selected provider from the DB (not from env). Researcher determines the exact storage mechanism using the existing `platform_integrations` table — options include: a special row with `provider = 'ai_config'` and `metadata: { selected_ai_provider: 'anthropic' | 'gemini' }`, or a new helper alongside `getIntegrationKey`. The constraint: (a) no env vars, (b) admin can switch without redeploy, (c) consistent with `getIntegrationKey` pattern in `lib/platform-config.ts`.

- **D-05:** Add `'gemini'` to `IntegrationProvider` in `lib/platform-config.ts` (currently `'resend' | 'anthropic' | 'openai'`). The Gemini API key is stored encrypted exactly like the Anthropic key — same `platform_integrations` table, same AES-256-GCM flow.

- **D-06:** **Zero env vars** — 100% admin panel → DB → `getIntegrationKey`. This is non-negotiable per user requirement and consistent with ADMIN-06 (Phase 8 decision).

- **D-07:** Anthropic adapter wraps the current route's Steps 2-4 (prompt build → Claude call → extract tool result). All existing prompt logic moves there verbatim, then price book injection is added on top.

- **D-08:** Gemini adapter implements the same `AIProvider` interface using `@google/genai` SDK (not Vertex AI — direct API key, simpler). Researcher recommends the current best Gemini model for structured/function-calling output. Gemini uses `functionDeclarations` (not `tools[].input_schema`) — the adapter normalizes this difference internally.

- **D-09:** The `generate-estimate` route becomes thin: auth → load context → `const provider = await getAIProvider()` → `const result = await provider.generateEstimate(input)` → insert sections/items. No more direct Anthropic SDK import in the route.

### Price Book Injection

- **D-10:** Load price book **before** building the prompt — call `getPriceBookItems(supabase, company.id)` (existing Phase 20 query) right after company fetch. If the company has 0 items → skip injection entirely → behavior identical to pre-v1.3 (AIPRICE-02, zero regression).

- **D-11:** When items exist, append to the system prompt:
  ```
  ## Your Company Price Book
  When a work item closely matches an entry below, use that exact unit_price and set price_source to "price_book". For all other items, estimate from US market rates and set price_source to "ai_estimate".

  - [Category] | [Name] | $[unit_price]/[unit or 'each']
  - Labor | General Labor | $65.00/hr
  - Materials | PVC Pipe 2in | $8.50/each
  ```
  This block is injected into the system prompt of both adapters (Anthropic and Gemini) via the `EstimateInput` type — not hardcoded inside each adapter.

- **D-12:** Inject **all** price book items (no cap). Researcher verifies token cost — 1000 items ≈ ~8-10 KB of text, well within the context budget of Sonnet/Flash class models. If researcher finds a specific model with tight limits, document a reasonable soft cap (e.g., first 500 items sorted by category) as a safeguard.

- **D-13:** Matching is **semantic** — the AI judges fuzzy matches ("general labor" → "Labor | General Labor"). No programmatic pre-matching required. The instruction is explicit and directive (not a soft suggestion).

### Tool Schema + price_source

- **D-14:** Add `price_source` as a **required** field to `items[]` in the function/tool schema for **both** adapters:
  ```json
  {
    "name": "price_source",
    "type": "string",
    "description": "'price_book' if this price came from the company's price book entry. 'ai_estimate' if you estimated it from market rates.",
    "enum": ["price_book", "ai_estimate"]
  }
  ```

- **D-15:** Defensive fallback in both adapters: if the model returns an item without `price_source`, default to `"ai_estimate"` before returning from `generateEstimate()`. This is a belt-and-suspenders guard — the schema requires it, but models occasionally ignore required fields.

- **D-16:** Persist `price_source` in the `estimate_items` insert block (currently around line 386 of the route — `item.price_source` added to `itemRows` map). Column already exists from Phase 19.

### Admin Panel — Provider Selection

- **D-17:** `/admin/integrations` page gets a new "AI Provider" section above or alongside the existing integration key cards. Admin sees:
  - Anthropic (Claude) — key card (existing)
  - Google Gemini — new key card (same pattern as existing cards)
  - Active provider selector — radio or select between the two (or any configured provider)

- **D-18:** The existing `testIntegrationKey` action in `app/admin/integrations/actions.ts` gets a new `'gemini'` case — makes a minimal API call (e.g., `countTokens` or a 1-token generation) to verify the key works. Same pattern as the existing `'anthropic'` test case.

- **D-19:** Admin panel shows which provider is currently active (badge or indicator). Switching providers is instant — no restart, no redeploy. The factory reads from DB on every request.

### Claude's Discretion
- Exact DB storage for the active provider selection (`platform_integrations.metadata` on a config row, new `platform_branding` column, or other clean option — researcher picks, planner specifies)
- Gemini model version (researcher recommends current best for function calling + structured output)
- Whether `EstimateInput` includes the formatted price book string or the raw items array (and adapter formats it) — either is fine
- Loading state / error UX in admin integrations for the Gemini key card (follow existing card pattern)
- Whether the existing `app/api/analyze-photos/route.ts` is also migrated to the adapter layer in this phase — probably not (scope creep); only `generate-estimate` migrates in Phase 22

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements
- `.planning/ROADMAP.md` §"Phase 22: AI Price Anchoring" — goal, 3 success criteria, AIPRICE-01/02/03
- `.planning/REQUIREMENTS.md` §"AI Integration" — AIPRICE-01/02/03 full text; §"Future Requirements" — what's explicitly deferred (per-company provider, "save to price book", etc.)
- `.planning/PROJECT.md` §"Current Milestone" + §"Core Value" — v1.3 Smart Pricing context

### Current Implementation (to migrate/extend)
- `app/api/generate-estimate/route.ts` — **FULL FILE** — the route being refactored (432 lines); understand every step before touching
- `lib/platform-config.ts` — `getIntegrationKey`, `IntegrationProvider`, `getBranding` — extend with `'gemini'` and provider selection
- `app/admin/integrations/actions.ts` — `saveIntegrationKey`, `testIntegrationKey`, `IntegrationProvider` — extend with Gemini
- `app/admin/integrations/page.tsx` — existing provider cards UI to extend

### Phase 20 Data Layer (price book query)
- `.planning/phases/20-price-book-crud-ui/20-01-SUMMARY.md` — `getPriceBookItems(supabase, companyId)` signature and return type (`PriceBookItem[]`)
- `lib/queries/price-book.ts` — direct source of the query function

### Phase 19 Schema
- `.planning/phases/19-price-book-db-foundation/19-01-SUMMARY.md` — migration that added `estimate_items.price_source` (TEXT, CHECK `'price_book'|'ai_estimate'`, nullable for pre-v1.3 rows)
- `types/database.types.ts` — `estimate_items.price_source: string | null` in Row/Insert/Update

### Prior Phase Decisions
- `.planning/phases/20-price-book-crud-ui/20-CONTEXT.md` — D-01..D-10 (price book page, patterns)
- `.planning/STATE.md` — accumulated decisions including ADMIN-06 (no env vars for API keys), SEC-03, D-07 (Phase 8)

### External Docs (researcher must fetch)
- Anthropic tool_use docs — https://docs.anthropic.com/en/docs/build-with-claude/tool-use (verify current `tools[].input_schema` format)
- Google Generative AI SDK — https://ai.google.dev/gemini-api/docs/function-calling (verify `functionDeclarations` format and TypeScript SDK `@google/genai`)
- Gemini model list — researcher picks current best model for structured/function-calling output

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`getIntegrationKey(provider)`** (`lib/platform-config.ts:152`) — fetches + decrypts API key for any `IntegrationProvider` string; adding `'gemini'` is a type extension, not a new function
- **`getPriceBookItems(supabase, companyId)`** (`lib/queries/price-book.ts`) — returns `PriceBookItem[]` sorted by category then name; ready to use in the route
- **Admin integration card pattern** (`app/admin/integrations/page.tsx`) — each provider is a card with key input, save, test, delete actions; Gemini card follows the same shape
- **`testIntegrationKey` action** (`app/admin/integrations/actions.ts:94`) — switch statement per provider; add `'gemini'` case

### Established Patterns
- **No env vars for API keys** — ADMIN-06 (Phase 8): all SDK clients initialized per-request using `getIntegrationKey()`. Gemini adapter follows the same pattern: `getIntegrationKey('gemini')` → initialize `@google/genai` client.
- **Discriminated union returns** from server actions: `{ ok: boolean; message?: string }` or `{ data } | { error: string }`
- **Service role for admin operations** — `createServiceClient()` for admin actions that bypass RLS

### Integration Points
- **Where the adapter plugs in:** `app/api/generate-estimate/route.ts` — currently Steps 2-4 (build prompt → call Claude → extract tool result). After refactor: `provider.generateEstimate(input)` replaces those steps.
- **Where price book loads:** In the route handler after company fetch (before prompt build). Passed to the adapter via `EstimateInput.priceBookItems`.
- **Where price_source persists:** The `itemRows` map at line ~386 of the route — add `price_source: item.price_source` to each row object.
- **Admin panel hook:** `app/admin/integrations/page.tsx` + `app/admin/integrations/actions.ts` — new provider card + testIntegrationKey case.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly stated: **"nada no env, tudo cadastrado no painel de super admin"** — this is a hard constraint, not a preference. No `AI_PROVIDER` or `GEMINI_API_KEY` env vars anywhere.
- The user confirmed **multiple providers NOW** (not deferred): both Claude and Gemini must be functional in Phase 22, with the admin able to switch between them.
- The matching logic in the system prompt should read like instructions to a human estimator, not like a regex rule — the AI responds better to natural-language guidance than programmatic constraints.

</specifics>

<deferred>
## Deferred Ideas

- **Estimate editor price badges** — Phase 23 (EDITPRICE-01/02). `price_source` is now persisted; Phase 23 reads it and renders visual indicators.
- **Per-company AI provider selection** — deferred. Phase 22 is platform-level (super admin picks). Per-company provider is a future requirement not in v1.3.
- **Photo analysis route migration** (`app/api/analyze-photos/route.ts`) — currently uses Anthropic Claude Vision directly. Out of scope for Phase 22; only `generate-estimate` migrates.
- **Additional providers** (OpenAI GPT-4, Mistral, etc.) — adapter pattern makes these easy to add later; Phase 22 ships Claude + Gemini only.
- **Model version selection UI** — admin selects provider (Claude vs Gemini), not specific model version. Model version is hardcoded in each adapter.
- **Price book token cost cap** — if researcher confirms 1000 items is safe, no cap needed. If a specific model variant has tight limits, a soft truncation can be added as a safety measure (not a user-facing decision).
- **"Save to price book" after manual price override** — explicitly discarded per REQUIREMENTS.md ("descartado intencionalmente — preço ajustado é exceção per-cliente").

</deferred>

---

*Phase: 22-ai-price-anchoring*
*Context gathered: 2026-05-08*
