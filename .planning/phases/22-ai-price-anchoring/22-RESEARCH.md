# Phase 22: AI Price Anchoring + Multi-Provider Architecture — Research

**Researched:** 2026-05-07
**Domain:** AI provider abstraction, Gemini function calling, price book prompt injection, DB-backed provider selection
**Confidence:** HIGH (core SDK patterns verified against official docs; token cost estimates are MEDIUM)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Create `lib/ai/` directory with a provider interface. The route calls a factory, not the SDK directly.
- **D-02:** File structure: `lib/ai/types.ts`, `lib/ai/provider.interface.ts`, `lib/ai/index.ts`, `lib/ai/providers/anthropic.ts`, `lib/ai/providers/gemini.ts`
- **D-03:** `EstimateOutput` type mirrors current `create_estimate` tool response, extended with `price_source: 'price_book' | 'ai_estimate'` on every line item. Both adapters return this shape.
- **D-04:** `getAIProvider()` reads selected provider from DB (not env). Researcher determines storage mechanism.
- **D-05:** Add `'gemini'` to `IntegrationProvider` in `lib/platform-config.ts`.
- **D-06:** Zero env vars — 100% admin panel → DB → `getIntegrationKey`. Non-negotiable.
- **D-07:** Anthropic adapter wraps current route Steps 2–4 verbatim, then price book injection added on top.
- **D-08:** Gemini adapter uses `@google/genai` SDK (not Vertex AI). Researcher recommends current best model.
- **D-09:** `generate-estimate` route becomes thin: auth → context load → `getAIProvider()` → `provider.generateEstimate(input)` → persist.
- **D-10:** Load price book before prompt build; 0 items → skip injection entirely (no regression).
- **D-11:** Price book injected as structured section in system prompt with exact format specified.
- **D-12:** Inject all items (no cap). Researcher verifies token safety.
- **D-13:** Matching is semantic — AI judges fuzzy matches. No programmatic pre-matching.
- **D-14:** `price_source` as required field in tool/function schema for both adapters.
- **D-15:** Defensive fallback: if model returns item without `price_source`, default to `"ai_estimate"`.
- **D-16:** Persist `price_source` in `estimate_items` insert block.
- **D-17:** `/admin/integrations` gets "AI Provider" section: Anthropic card (existing) + Gemini card (new) + Active provider selector.
- **D-18:** `testIntegrationKey` action gets a `'gemini'` case.
- **D-19:** Admin panel shows active provider badge. Factory reads from DB on every request.

### Claude's Discretion
- Exact DB storage for active provider selection (`platform_integrations.metadata` on a config row, new `platform_branding` column, or other — researcher picks)
- Gemini model version (researcher recommends current best for function calling + structured output)
- Whether `EstimateInput` includes formatted price book string or raw items array
- Loading state / error UX in admin integrations for Gemini key card
- Whether `app/api/analyze-photos/route.ts` migrates — probably not (scope creep)

### Deferred Ideas (OUT OF SCOPE)
- Estimate editor price badges (Phase 23, EDITPRICE-01/02)
- Per-company AI provider selection (platform-level only in Phase 22)
- Photo analysis route migration
- Additional providers (OpenAI GPT-4, Mistral, etc.)
- Model version selection UI
- Price book token cost cap (only if model has tight limits)
- "Save to price book" after manual override (discarded per REQUIREMENTS.md)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AIPRICE-01 | AI receives company price book as context and uses those prices as anchors for matching line items | D-10/D-11/D-13 confirmed viable — `getPriceBookItems()` exists, prompt injection pattern verified |
| AIPRICE-02 | No match or empty price book → AI uses market-rate estimates (no regression from pre-v1.3 behavior) | D-10 guard (0 items → skip injection) ensures identical path to current route; unit test SC-2 covers this |
| AIPRICE-03 | Each generated line item tagged with `price_source: 'price_book' \| 'ai_estimate'`, persisted to DB | Column confirmed in `estimate_items.price_source: string \| null` (Phase 19); both adapter tool schemas include it |
</phase_requirements>

---

## Summary

Phase 22 makes three coordinated changes to the estimate generation pipeline. The existing 432-line `generate-estimate` route has a monolithic Steps 2–4 block (prompt build + Claude call + tool extraction) that will be extracted into a provider-agnostic `lib/ai/` layer. Two concrete adapters — one for Anthropic Claude (migrating existing logic) and one for Google Gemini (net-new) — will implement a shared `AIProvider` interface. The factory `getAIProvider()` reads the active provider from the DB, requiring no env vars and no redeploy to switch.

Price book injection is a prompt-engineering addition applied at the `EstimateInput` construction level (before the adapter is called). The `getPriceBookItems()` query from Phase 20 is already in place. If the company has 0 items, no injection occurs and the existing prompt path is unchanged. If items exist, a structured block is appended to the system prompt with human-readable instructions for semantic matching. Both adapters receive the same `EstimateInput` type, so price book context flows identically regardless of which provider is active.

The `price_source` field is already in the DB schema (`estimate_items.price_source: string | null`, added Phase 19). Phase 22 adds it to both adapter tool schemas as a required field, adds a defensive fallback in each adapter (default `"ai_estimate"` if missing), and wires it into the `itemRows` insert map in the route. The admin panel gets a Gemini integration card and an "Active Provider" selector, both following the existing card pattern precisely.

**Primary recommendation:** Use `@google/genai@2.0.0` (the new official SDK, `@google/generative-ai` is deprecated as of Nov 2025), model `gemini-2.5-flash`, with `FunctionCallingConfigMode.ANY` + `allowedFunctionNames` to force the function call. Store the active provider selection as a special row `provider='ai_config'` with `null` ciphertext/iv/auth_tag and `metadata: { selected_ai_provider: 'anthropic' | 'gemini' }` in `platform_integrations`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | `^0.39.0` (installed); latest `0.95.1` | Claude adapter SDK | Already installed; existing route uses it |
| `@google/genai` | `2.0.0` (latest) | Gemini adapter SDK | Official replacement for deprecated `@google/generative-ai`; GA since May 2025 |

**Important:** `@google/generative-ai` is the OLD package. It was deprecated November 2025. The new package is `@google/genai`. Do NOT install the old one. The installed `@anthropic-ai/sdk@^0.39.0` will satisfy the Anthropic adapter; no upgrade needed (current logic works on this version).

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | (already installed) | Unit testing adapters + factory | Wave 0 RED stubs, Wave 1 implementation tests |

### Installation

```bash
npm install @google/genai
```

**Version verification (run before coding):**
```bash
npm view @google/genai version
# Expected: 2.0.0 or newer
npm view @anthropic-ai/sdk version
# Latest: 0.95.1 — installed ^0.39.0 is fine for existing API
```

---

## Architecture Patterns

### Recommended Project Structure

```
lib/ai/
├── types.ts                  — EstimateInput, EstimateOutput, LineItemOutput
├── provider.interface.ts     — AIProvider interface
├── index.ts                  — getAIProvider() factory
└── providers/
    ├── anthropic.ts          — Claude adapter (migrates route Steps 2–4)
    └── gemini.ts             — Google Gemini adapter (new)
```

### Pattern 1: AIProvider Interface

**What:** A TypeScript interface that both adapters implement. The route only knows this interface.

**Example:**

```typescript
// lib/ai/types.ts
export type LineItemOutput = {
  description: string
  quantity: number
  unit?: string
  unit_price: number
  price_source: 'price_book' | 'ai_estimate'  // required — D-03
}

export type EstimateSectionOutput = {
  title: string
  items: LineItemOutput[]
}

export type EstimateOutput = {
  suggested_project_name: string
  summary: string
  notes?: string
  timeline?: string
  payment_terms?: string
  warranty_terms?: string
  sections: EstimateSectionOutput[]
}

export type PriceBookEntry = {
  category: string
  name: string
  unit: string | null
  unit_price: number
}

export type EstimateInput = {
  industry: string | null
  projectName: string
  projectType: string | null
  targetBudget: number | null
  clientName: string | null
  clientAddress: string | null
  transcripts: string[]
  photoDescriptions: string[]
  priceBookItems: PriceBookEntry[]  // empty array = no injection (D-10)
  defaultPaymentTerms: string | null
  defaultWarrantyTerms: string | null
}

// lib/ai/provider.interface.ts
export interface AIProvider {
  generateEstimate(input: EstimateInput): Promise<EstimateOutput>
}
```

### Pattern 2: getAIProvider() Factory

**What:** Reads `platform_integrations` for `provider='ai_config'`, extracts `metadata.selected_ai_provider`, instantiates the matching adapter. Falls back to `'anthropic'` if no row exists.

**Recommendation for storage (Claude's discretion D-04):** Use a special row in `platform_integrations` with `provider='ai_config'`, `ciphertext=null`, `iv=null`, `auth_tag=null`, and `metadata: { selected_ai_provider: 'anthropic' | 'gemini' }`. This approach:
- Requires NO schema migration (metadata column already exists, all nullable)
- Is consistent with the existing `platform_integrations` table
- Lets `getAIProvider()` be a standalone helper alongside `getIntegrationKey()`
- Is invalidated by the existing `invalidatePlatformConfig()` call

**Example:**

```typescript
// lib/ai/index.ts
import { createServiceClient } from '@/lib/supabase/service'
import type { AIProvider } from './provider.interface'

type SelectedProvider = 'anthropic' | 'gemini'

export async function getAIProvider(): Promise<AIProvider> {
  const svc = createServiceClient()
  const { data } = await svc
    .from('platform_integrations')
    .select('metadata')
    .eq('provider', 'ai_config')
    .maybeSingle()

  const selected: SelectedProvider =
    (data?.metadata as { selected_ai_provider?: string } | null)
      ?.selected_ai_provider === 'gemini'
      ? 'gemini'
      : 'anthropic'  // fallback

  if (selected === 'gemini') {
    const { GeminiAdapter } = await import('./providers/gemini')
    return new GeminiAdapter()
  }
  const { AnthropicAdapter } = await import('./providers/anthropic')
  return new AnthropicAdapter()
}
```

A new server action `setActiveAIProvider(provider: 'anthropic' | 'gemini')` upserts this row:
```typescript
await svc.from('platform_integrations').upsert(
  {
    provider: 'ai_config',
    ciphertext: null,
    iv: null,
    auth_tag: null,
    metadata: { selected_ai_provider: provider },
    updated_at: new Date().toISOString(),
    updated_by: ctx.userId,
  },
  { onConflict: 'provider' }
)
```

### Pattern 3: Gemini Adapter — @google/genai Function Calling

**What:** Use `@google/genai` SDK with `FunctionCallingConfigMode.ANY` + `allowedFunctionNames` to force `create_estimate` tool call.

**Source:** Official Gemini API docs (https://ai.google.dev/gemini-api/docs/function-calling?lang=node)

```typescript
// lib/ai/providers/gemini.ts
import { GoogleGenAI, Type, FunctionCallingConfigMode } from '@google/genai'
import type { AIProvider } from '../provider.interface'
import type { EstimateInput, EstimateOutput } from '../types'
import { getIntegrationKey } from '@/lib/platform-config'
import { buildSystemPrompt, buildUserContent } from '../prompt-builder'

export class GeminiAdapter implements AIProvider {
  async generateEstimate(input: EstimateInput): Promise<EstimateOutput> {
    const apiKey = await getIntegrationKey('gemini')
    if (!apiKey) throw new Error('Gemini API key not configured')

    const ai = new GoogleGenAI({ apiKey })

    const createEstimateDeclaration = {
      name: 'create_estimate',
      description: 'Create a structured estimate with sections and line items',
      parameters: {
        type: Type.OBJECT,
        required: ['summary', 'sections', 'suggested_project_name'],
        properties: {
          suggested_project_name: { type: Type.STRING, description: '...' },
          summary: { type: Type.STRING, description: '...' },
          notes: { type: Type.STRING },
          timeline: { type: Type.STRING },
          payment_terms: { type: Type.STRING },
          warranty_terms: { type: Type.STRING },
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ['title', 'items'],
              properties: {
                title: { type: Type.STRING },
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    required: ['description', 'quantity', 'unit_price', 'price_source'],
                    properties: {
                      description: { type: Type.STRING },
                      quantity: { type: Type.NUMBER },
                      unit: { type: Type.STRING },
                      unit_price: { type: Type.NUMBER },
                      price_source: {
                        type: Type.STRING,
                        description: "'price_book' if price came from company price book; 'ai_estimate' if estimated from market rates.",
                        // Note: Gemini Type enum has no ENUM variant — use STRING with description
                        // Enforcement via prompt instruction + defensive fallback (D-15)
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: buildUserContent(input),
      config: {
        systemInstruction: buildSystemPrompt(input),
        tools: [{ functionDeclarations: [createEstimateDeclaration] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: ['create_estimate'],
          },
        },
      },
    })

    // Extract function call result
    const functionCalls = response.functionCalls
    if (!functionCalls || functionCalls.length === 0) {
      throw new Error('Gemini did not return a function call')
    }
    const args = functionCalls[0].args as Record<string, unknown>

    // Normalize + defensive fallback (D-15)
    return normalizeGeminiOutput(args)
  }
}
```

**Key difference from Anthropic:** Gemini uses `response.functionCalls[0].args` (not `response.content.find(b => b.type === 'tool_use').input`).

### Pattern 4: Anthropic Adapter — Migrating Existing Logic

**What:** Move route Steps 2–4 verbatim into `AnthropicAdapter.generateEstimate()`. Add `price_source` to `input_schema` and defensive fallback.

```typescript
// lib/ai/providers/anthropic.ts — core change to existing input_schema
{
  name: 'create_estimate',
  input_schema: {
    // ... existing fields unchanged ...
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['description', 'quantity', 'unit_price', 'price_source'],  // ADD price_source
              properties: {
                // ... existing ...
                price_source: {
                  type: 'string',
                  enum: ['price_book', 'ai_estimate'],
                  description: "'price_book' if from company price book; 'ai_estimate' if estimated from market rates."
                }
              }
            }
          }
        }
      }
    }
  }
}
// Extraction: toolBlock.input (same as before)
```

### Pattern 5: Price Book Prompt Injection

**What:** Shared `buildSystemPrompt(input: EstimateInput)` helper constructs the system prompt with or without price book context.

```typescript
// lib/ai/prompt-builder.ts
export function buildSystemPrompt(input: EstimateInput): string {
  let prompt = `You are a professional estimator for a ${input.industry ?? 'general services'} business. ...`

  if (input.priceBookItems.length > 0) {
    prompt += `\n\n## Your Company Price Book\nWhen a work item closely matches an entry below, use that exact unit_price and set price_source to "price_book". For all other items, estimate from US market rates and set price_source to "ai_estimate".\n\n`
    prompt += input.priceBookItems
      .map(item => `- ${item.category} | ${item.name} | $${item.unit_price.toFixed(2)}/${item.unit ?? 'each'}`)
      .join('\n')
  } else {
    // No price book: set price_source to "ai_estimate" for every item
    prompt += `\n\nFor each line item, set price_source to "ai_estimate" (no company price book configured).`
  }

  return prompt
}
```

**Note on EstimateInput design (Claude's discretion):** Pass `priceBookItems: PriceBookEntry[]` (raw items array) to `EstimateInput`, and format in `prompt-builder.ts`. This way adapters don't know about formatting, and the prompt logic is testable independently.

### Pattern 6: IntegrationProvider Type Extension

**What:** Add `'gemini'` to the union type and handle the new special `'ai_config'` provider.

```typescript
// lib/platform-config.ts — extend the type
export type IntegrationProvider = 'resend' | 'anthropic' | 'openai' | 'gemini'
```

The `'ai_config'` row uses `provider: string` at the DB level but is NOT added to `IntegrationProvider` — it is not a key-bearing integration. It is accessed by a dedicated `getSelectedAIProvider()` helper or inline in `getAIProvider()`. This avoids breaking the existing `saveIntegrationKey` / `testIntegrationKey` switch statements which must not handle `'ai_config'`.

### Pattern 7: Admin Panel — Provider Card + Selector

**What:** The `PROVIDERS` array in `app/admin/integrations/page.tsx` gets a Gemini entry. A new "Active AI Provider" selector section is added above or below the provider cards.

```typescript
// app/admin/integrations/page.tsx — extend PROVIDERS array
const PROVIDERS: ReadonlyArray<...> = [
  { id: 'resend', title: 'Resend', description: 'Transactional email delivery...' },
  { id: 'anthropic', title: 'Anthropic', description: 'Claude models for estimate generation and photo analysis.' },
  { id: 'gemini', title: 'Google Gemini', description: 'Gemini models (alternative to Claude for estimate generation).' },
  { id: 'openai', title: 'OpenAI', description: 'Whisper API for audio transcription.' },
]
```

A new `AIProviderSelector` client component renders a radio group or select. It calls a new `setActiveAIProvider` server action and shows the current selection as a badge on the active provider's card or inline.

The active provider is read from `platform_integrations` where `provider='ai_config'` at page load time, and passed as a prop to `IntegrationsTabs`.

### Anti-Patterns to Avoid

- **Direct SDK import in route:** After refactor, `app/api/generate-estimate/route.ts` must NOT import `Anthropic` or `GoogleGenAI` directly. The factory handles this.
- **Env var fallback for Gemini:** The `getIntegrationKey` function has a dev fallback to `process.env.GEMINI_API_KEY`. That's acceptable for local dev per existing pattern, but production must use the DB row.
- **Adding 'ai_config' to IntegrationProvider:** It is not a key-bearing provider. Adding it would break the `testIntegrationKey` exhaustiveness guard and the `PROVIDERS` UI array.
- **Using `@google/generative-ai` (old package):** Install `@google/genai` instead. The old package API is completely different (`new GoogleGenerativeAI(key).getGenerativeModel({...})`) and is deprecated.
- **Using `parametersJsonSchema` instead of `parameters`:** The `@google/genai` v2 SDK uses `parameters` with `Type` enum (imported from `@google/genai`), not raw JSON Schema strings.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AI function call enforcement | Custom retry loop checking if model returned text instead of tool call | `FunctionCallingConfigMode.ANY` + `allowedFunctionNames` | Forces the model to always return the named function — documented Gemini feature |
| API key encryption | Custom encryption | Existing `encrypt()`/`decrypt()` + `saveIntegrationKey()` | Already handles AES-256-GCM + `\xHEX` BYTEA serialization |
| Provider config persistence | New DB table | Special row in existing `platform_integrations` | `metadata: Json | null` column already exists; zero migration cost |
| Price book formatting for prompt | Complex template engine | Simple `.map().join('\n')` in `prompt-builder.ts` | The AI handles fuzzy matching; formatting just needs to be human-readable |
| Module cache invalidation | Custom TTL | Existing `invalidatePlatformConfig()` | Already clears `integrationCache`; the `ai_config` row benefits if factory uses the same TTL cache |

**Key insight:** The `platform_integrations` schema was designed with `metadata: Json | null` precisely for future flexibility like provider selection. The `'ai_config'` row approach costs zero migration SQL.

---

## Common Pitfalls

### Pitfall 1: Gemini Response Shape vs Anthropic

**What goes wrong:** Code tries to extract Gemini result via `response.content.find(b => b.type === 'tool_use')` — that is the Anthropic SDK pattern. Gemini uses `response.functionCalls[0].args`.

**Why it happens:** The developer copies the Anthropic extraction pattern into the Gemini adapter.

**How to avoid:** Keep extraction logic completely inside each adapter. The `AIProvider` interface only exposes `EstimateOutput` — callers never touch raw SDK responses.

**Gemini extraction:**
```typescript
const fc = response.functionCalls?.[0]
if (!fc) throw new Error('Gemini did not return a function call')
const args = fc.args as Record<string, unknown>
```

**Anthropic extraction:**
```typescript
const toolBlock = response.content.find(b => b.type === 'tool_use')
if (!toolBlock || toolBlock.type !== 'tool_use') throw new Error('...')
const args = toolBlock.input as Record<string, unknown>
```

### Pitfall 2: Gemini Text Response Despite ANY Mode

**What goes wrong:** Gemini occasionally returns a text part alongside the function call, or returns only text if the model decides the function is inappropriate.

**Why it happens:** `FunctionCallingConfigMode.ANY` strongly constrains but does not 100% guarantee a function call when combined with models still in flux.

**How to avoid:** The extraction code already guards with `if (!functionCalls || functionCalls.length === 0) throw`. The route's outer `try/catch` returns 503. Additionally, using `allowedFunctionNames: ['create_estimate']` focuses the constraint to one specific function.

**Warning signs:** `response.functionCalls` is `undefined` or empty when you expected a structured call.

### Pitfall 3: price_source Missing from Gemini Response

**What goes wrong:** Gemini returns the function call args without `price_source` on some items, violating `D-14`.

**Why it happens:** Gemini's function calling is not 100% schema-compliant for required fields in nested arrays. The outer `required` is usually respected; deeply nested required fields in array items are less reliable.

**How to avoid:** Implement D-15 defensive fallback in `normalizeGeminiOutput()`:
```typescript
function normalizeGeminiOutput(args: Record<string, unknown>): EstimateOutput {
  const sections = (args.sections as RawSection[]).map(section => ({
    title: section.title,
    items: section.items.map(item => ({
      ...item,
      price_source: item.price_source === 'price_book' ? 'price_book' : 'ai_estimate',
    })),
  }))
  // ...
}
```

Apply the same normalization in the Anthropic adapter for symmetry (D-15 applies to both).

### Pitfall 4: Adding 'gemini' to IntegrationProvider Breaks Switch Exhaustiveness

**What goes wrong:** TypeScript narrows `IntegrationProvider` to known literals. Adding `'gemini'` without updating `testIntegrationKey`'s switch causes the "Unknown provider" fallback to fire for Gemini.

**How to avoid:** When adding `'gemini'` to `IntegrationProvider`, immediately add the `'gemini'` case to `testIntegrationKey` in the same plan/wave. The D-18 test case makes a minimal Gemini API call (e.g., a 1-token `generateContent` with no tools).

### Pitfall 5: Module-Level SDK Initialization

**What goes wrong:** `const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })` at module top level — this violates ADMIN-06 and reads env at import time.

**Why it happens:** SDK examples show module-level initialization.

**How to avoid:** Initialize inside `generateEstimate()` using `await getIntegrationKey('gemini')`. This is the same pattern as the existing Anthropic route (`const anthropic = new Anthropic({ apiKey: anthropicKey })` inside the handler).

### Pitfall 6: 'ai_config' Row Treated as Key-Bearing Integration

**What goes wrong:** Code passes `'ai_config'` to `getIntegrationKey()` or `saveIntegrationKey()`, which attempts to decrypt `null` ciphertext and throws.

**How to avoid:** The `'ai_config'` row is read ONLY via a dedicated query (select `metadata` where `provider='ai_config'`). It is never passed to `getIntegrationKey()`. The `setActiveAIProvider()` server action upserts only `metadata`, not `ciphertext/iv/auth_tag`.

### Pitfall 7: @anthropic-ai/sdk Version Mismatch

**What goes wrong:** Installed version is `^0.39.0` but latest is `0.95.1`. The existing `tool_choice: { type: 'tool', name: '...' }` API works on 0.39.x. If the team upgrades as part of this phase, the API may differ.

**How to avoid:** Do NOT upgrade `@anthropic-ai/sdk` as part of Phase 22. The existing API is working and tested. The Anthropic adapter copies existing route logic verbatim. A separate upgrade phase can bump the SDK if needed.

---

## Google Generative AI SDK — Function Calling Reference

### Verified TypeScript Pattern (Source: https://ai.google.dev/gemini-api/docs/function-calling?lang=node and https://github.com/googleapis/js-genai)

```typescript
import { GoogleGenAI, Type, FunctionCallingConfigMode } from '@google/genai'

// Initialize (per-request, inside adapter method)
const ai = new GoogleGenAI({ apiKey: 'your-key' })

// Define function declaration
const myFunctionDeclaration = {
  name: 'my_function',
  description: 'Description of what the function does',
  parameters: {
    type: Type.OBJECT,
    required: ['field1', 'field2'],
    properties: {
      field1: { type: Type.STRING, description: '...' },
      field2: { type: Type.NUMBER, description: '...' },
      enum_field: {
        type: Type.STRING,
        description: 'Must be "value_a" or "value_b"'
        // Note: Gemini Type does not have a Type.ENUM — use Type.STRING + description
      }
    }
  }
}

// Call with forced function
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: 'User message here',
  config: {
    systemInstruction: 'System prompt here',
    tools: [{ functionDeclarations: [myFunctionDeclaration] }],
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingConfigMode.ANY,         // Force a function call
        allowedFunctionNames: ['my_function'],        // Restrict to this function
      },
    },
  },
})

// Extract result
const functionCalls = response.functionCalls   // FunctionCall[] | undefined
if (!functionCalls || functionCalls.length === 0) {
  throw new Error('Model did not return a function call')
}
const { name, args } = functionCalls[0]
// args is Record<string, unknown> — cast to expected shape
```

### Key API Differences: Gemini vs Anthropic

| Aspect | Anthropic Claude | Google Gemini |
|--------|-----------------|---------------|
| SDK package | `@anthropic-ai/sdk` | `@google/genai` (NOT `@google/generative-ai`) |
| Client init | `new Anthropic({ apiKey })` | `new GoogleGenAI({ apiKey })` |
| Call method | `anthropic.messages.create({...})` | `ai.models.generateContent({...})` |
| Tool schema key | `input_schema` (JSON Schema, snake_case) | `parameters` with `Type` enum from `@google/genai` |
| System prompt | `system: string` at root | `config.systemInstruction: string` |
| Force tool call | `tool_choice: { type: 'tool', name: '...' }` | `toolConfig.functionCallingConfig.mode: FunctionCallingConfigMode.ANY` + `allowedFunctionNames` |
| Extract result | `response.content.find(b => b.type === 'tool_use').input` | `response.functionCalls[0].args` |
| Enum fields | `{ type: 'string', enum: ['a', 'b'] }` | `{ type: Type.STRING, description: 'Must be "a" or "b"' }` |
| Messages array | `messages: [{ role: 'user', content: '...' }]` | `contents: '...'` (string or ContentListUnion) |

---

## Gemini Model Recommendation

**Recommended model:** `gemini-2.5-flash`

| Property | Value |
|----------|-------|
| Model ID | `gemini-2.5-flash` |
| Context window | 1,048,576 tokens (1M) |
| Max output | 65,536 tokens |
| Function calling | Supported |
| GA status | Stable (non-preview) |
| Source | https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash |

**Why not `gemini-2.5-pro`:** Higher cost, slower; the structured output task here is well within Flash's capabilities.
**Why not `gemini-2.0-flash`:** Shutting down June 1, 2026 (confirmed by WebSearch — only available to existing customers after March 6, 2026).
**Why not `gemini-2.5-flash-lite`:** Acceptable but Flash gives better function-calling reliability.

---

## Token Cost Validation (D-12)

**Question:** Is injecting all price book items (up to ~1000) safe for both providers?

**Estimate for 1000 items:**
- Format: `- Category | Name | $XX.XX/unit`
- Average line: ~40 characters = ~40 bytes
- 1000 items = ~40KB of text
- Token ratio for English text: ~1 token per 4 characters
- 1000 items ≈ **10,000 tokens**

**Safety analysis:**

| Model | Context window | Price book 1000 items | Remaining for prompt + output | Safe? |
|-------|---------------|----------------------|-------------------------------|-------|
| Claude Sonnet (200k) | 200,000 tokens | ~10,000 tokens | ~186,000 remaining | YES |
| Gemini 2.5 Flash (1M) | 1,048,576 tokens | ~10,000 tokens | ~1,034,000 remaining | YES |

**Conclusion:** No cap needed for either model. 1000 items is ~5% of Claude's context window and ~1% of Gemini's. The D-12 decision to inject all items without a cap is validated.

**Confidence:** MEDIUM — token counts are estimates based on typical English text ratios. The actual count depends on category/item name lengths. Even a 3x overestimate (30,000 tokens for 1000 items) is safe for both models.

---

## DB Storage Decision for Active Provider (Claude's Discretion — D-04)

**Recommendation: Option A — special row in `platform_integrations`**

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| **A (recommended)** | `provider='ai_config'`, `ciphertext=null`, `metadata: {selected_ai_provider}` | No migration, reuses existing table + TTL pattern, single source of truth for platform config | Slightly unusual to have a non-key row in `platform_integrations` |
| B | Add column to `platform_branding` | Intuitive grouping | Requires migration, breaks single-responsibility of branding table |
| C | New `platform_config` table | Clean semantically | Requires migration, new RLS policy, service client change |

**Option A is chosen** because:
1. `platform_integrations.metadata` is already `Json | null` — no migration SQL needed
2. The `platform_integrations` table uses service role + is behind admin gate, consistent with security model
3. `invalidatePlatformConfig()` in `lib/platform-config.ts` clears `integrationCache` — the factory can use the same TTL pattern
4. The `provider` column is a text PK, so `'ai_config'` is a valid row key

**Note:** The `ai_config` row has `ciphertext=null, iv=null, auth_tag=null`. The existing `toBuffer()` helper in `page.tsx` would throw on null. The factory MUST query `ai_config` separately (select `metadata`) rather than going through `getIntegrationKey()`.

---

## Thin Route Pattern (D-09)

After refactor, `app/api/generate-estimate/route.ts` Steps 2–4 become:

```typescript
// Step 2.5: Load price book
const priceBookItems = await getPriceBookItems(supabase, companyId)

// Step 2: Build EstimateInput
const estimateInput: EstimateInput = {
  industry: company.industry,
  projectName: project.name,
  projectType: project.project_type,
  targetBudget: project.target_budget,
  clientName: client?.name ?? null,
  clientAddress: client ? buildAddress(client) : null,
  transcripts,
  photoDescriptions: descriptions,
  priceBookItems,  // empty = no injection
  defaultPaymentTerms: company.default_payment_terms,
  defaultWarrantyTerms: company.default_warranty_terms,
}

// Steps 3–4: Replaced by provider call
const provider = await getAIProvider()
const aiEstimate = await provider.generateEstimate(estimateInput)

// Step 4 continues: server-side math (unchanged)
```

The route keeps Steps 1 (auth), 4 (math), 5 (version), 6 (persist + price_source), 7 (project update), 8 (revalidate). Only Steps 2–4's AI calls move into the adapter.

---

## Environment Availability

Step 2.6: The only new external dependency is `@google/genai` (npm package — no system binary needed). Node.js is available. No Docker, no external service needed beyond the Gemini API itself (accessed over HTTPS).

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| `@google/genai` npm package | Gemini adapter | NOT YET — needs `npm install @google/genai` | 2.0.0 (latest) | — (required for Gemini adapter) |
| `@anthropic-ai/sdk` | Anthropic adapter | YES (installed) | ^0.39.0 | — |
| Gemini API key | Gemini adapter runtime | NOT YET — admin must configure via `/admin/integrations` | — | Falls back to env `GEMINI_API_KEY` per existing pattern |
| Supabase | DB reads for factory + price book | YES | (project's existing Supabase) | — |

**Missing with no fallback:**
- `@google/genai` package: must `npm install @google/genai` in Wave 0.

**Missing with fallback:**
- Gemini API key: local dev can use `GEMINI_API_KEY` env var (existing `getIntegrationKey` env fallback); production must use admin panel.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (existing, `vitest.config.ts`) |
| Config file | `vitest.config.ts` (root) |
| Include pattern | `tests/unit/**/*.test.ts`, `tests/integration/**/*.test.ts` |
| Quick run command | `npx vitest run tests/unit/ai/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AIPRICE-01 | Price book items injected into prompt when items exist | unit | `npx vitest run tests/unit/ai/prompt-builder.test.ts` | No — Wave 0 |
| AIPRICE-01 | `getAIProvider()` factory returns correct adapter | unit | `npx vitest run tests/unit/ai/provider-factory.test.ts` | No — Wave 0 |
| AIPRICE-01 | Anthropic adapter includes price_source in input_schema | unit | `npx vitest run tests/unit/ai/anthropic-adapter.test.ts` | No — Wave 0 |
| AIPRICE-01 | Gemini adapter extracts functionCalls[0].args correctly | unit | `npx vitest run tests/unit/ai/gemini-adapter.test.ts` | No — Wave 0 |
| AIPRICE-02 | 0 items → no price book section in prompt (no regression) | unit | `npx vitest run tests/unit/ai/prompt-builder.test.ts` | No — Wave 0 |
| AIPRICE-02 | Route returns 200 with empty price book (smoke) | unit | Extend existing `generate-estimate` test | Partial (existing test) |
| AIPRICE-03 | price_source='price_book' for matched items persisted | unit | `npx vitest run tests/unit/ai/price-source-tagging.test.ts` | No — Wave 0 |
| AIPRICE-03 | price_source='ai_estimate' for unmatched items persisted | unit | same file | No — Wave 0 |
| AIPRICE-03 | Defensive fallback: missing price_source → 'ai_estimate' | unit | same file | No — Wave 0 |

### Mock Strategy

**Key principle:** Mock `getAIProvider()` factory and both adapter classes. No real API calls in unit tests.

```typescript
// Pattern for testing the route (extending existing test file)
vi.mock('@/lib/ai', () => ({
  getAIProvider: vi.fn(),
}))

// In beforeEach: provide a mock adapter
vi.mocked(getAIProvider).mockResolvedValue({
  generateEstimate: vi.fn().mockResolvedValue({
    suggested_project_name: 'Smith Kitchen Reno',
    summary: 'Kitchen renovation',
    sections: [{
      title: 'Labor',
      items: [{ description: 'Demo', quantity: 1, unit_price: 500, price_source: 'ai_estimate' }]
    }]
  })
})
```

**For adapter unit tests:** Mock the SDK clients directly:
```typescript
// Anthropic adapter test — class-based mock (established pattern from admin-test-button.test.ts)
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: (...args: unknown[]) => mockAnthropicCreate(...args) }
  },
}))

// Gemini adapter test
vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = { generateContent: (...args: unknown[]) => mockGeminiGenerate(...args) }
  },
  Type: { OBJECT: 'object', STRING: 'string', NUMBER: 'number', ARRAY: 'array' },
  FunctionCallingConfigMode: { ANY: 'any' },
}))
```

**For price_source tagging:** The existing route test in `tests/unit/api/generate-estimate-name-patch.test.ts` provides the Supabase mock pattern. Extend it to capture `itemRows` and assert `price_source` values.

### Wave 0 Gaps (RED stubs required before implementation)

- [ ] `tests/unit/ai/prompt-builder.test.ts` — covers AIPRICE-01 + AIPRICE-02 prompt injection behavior
- [ ] `tests/unit/ai/provider-factory.test.ts` — covers getAIProvider() DB read + adapter selection
- [ ] `tests/unit/ai/anthropic-adapter.test.ts` — covers AIPRICE-01 schema, AIPRICE-03 fallback
- [ ] `tests/unit/ai/gemini-adapter.test.ts` — covers AIPRICE-01 schema, extraction, AIPRICE-03 fallback
- [ ] `tests/unit/ai/price-source-tagging.test.ts` — covers AIPRICE-03 persist + defensive fallback

None of these files exist. All require Wave 0 creation as RED stubs.

**No new test framework installation needed** — vitest is already configured and running.

### Sampling Rate

- **Per task commit:** `npx vitest run tests/unit/ai/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@google/generative-ai` | `@google/genai` | Nov 2025 (deprecated), GA May 2025 (new) | Must use new package; completely different API |
| `gemini-2.0-flash` | `gemini-2.5-flash` | March 2026 (2.0-flash restricted to existing customers) | Use 2.5-flash for all new code |
| Vertex AI SDK for Gemini | Direct API (`@google/genai` with `apiKey`) | GA May 2025 | Simpler for non-GCP projects — no project/location config needed |

**Deprecated/outdated:**
- `@google/generative-ai`: Deprecated Nov 2025; support ended. Do not install.
- `gemini-2.0-flash-001` and `gemini-2.0-flash-lite-001`: Shutting down June 1, 2026.
- `gemini-1.5-pro`: Superseded by 2.5 series.

---

## Open Questions

1. **Does `FunctionCallingConfigMode.ANY` guarantee a function call for 100% of prompts in `gemini-2.5-flash`?**
   - What we know: Documented as forcing a function call; confirmed in official docs. `allowedFunctionNames` further restricts to one function.
   - What's unclear: Edge cases with very short or ambiguous user content.
   - Recommendation: Implement the `if (!functionCalls || functionCalls.length === 0) throw` guard (see Pitfall 2). The route's outer catch returns 503.

2. **Will `@google/genai` 2.0.0 work without issues in Next.js 14 App Router server context?**
   - What we know: The SDK is Node.js-compatible (no browser-only APIs). Multiple WebSearch results show Next.js + Gemini integration examples working with server-side API routes. The SDK accesses HTTPS endpoints and does no DOM manipulation.
   - What's unclear: Any edge case with the new `ai.models.generateContent()` pattern in a Next.js server component vs API route context.
   - Recommendation: The adapter will be used from an API route (`app/api/generate-estimate/route.ts`), which is a plain Node.js context. No issues expected. Confidence: HIGH.

3. **Does `@google/genai` support `Type.ENUM` for enforcing enum values in function schemas?**
   - What we know: The docs show `Type.STRING`, `Type.NUMBER`, `Type.OBJECT`, `Type.ARRAY`. No `Type.ENUM` was found in the official examples.
   - What's unclear: Whether there is a way to constrain string values to an enum in the Gemini function schema.
   - Recommendation: Use `type: Type.STRING` with a description that enumerates allowed values. Rely on the defensive fallback (D-15) to normalize unexpected values. This is less strict than Anthropic's `enum` array but functionally equivalent given the fallback.

---

## Project Constraints (from CLAUDE.md)

- **Tech Stack:** Next.js 14+ App Router, TypeScript strict, Tailwind CSS, shadcn/ui
- **Database:** Supabase PostgreSQL with RLS; no schema changes except migrating price_source wire-up (already exists from Phase 19)
- **AI:** Anthropic `claude-sonnet-4-20250514` for estimate generation (adapter hardcodes this model); Gemini `gemini-2.5-flash` for Gemini adapter (hardcoded)
- **Security:** Service role key never exposed to browser; all AI calls server-side via API routes; no env vars for API keys (ADMIN-06) — Gemini key goes through `getIntegrationKey('gemini')` same as Anthropic
- **No env vars for API keys:** ADMIN-06 is a hard constraint. `@google/genai` client initialized per-request inside adapter using `getIntegrationKey('gemini')`

---

## Sources

### Primary (HIGH confidence)
- https://ai.google.dev/gemini-api/docs/function-calling?lang=node — Function calling API, FunctionCallingConfigMode.ANY, response.functionCalls extraction
- https://github.com/googleapis/js-genai — SDK initialization pattern, FunctionDeclaration shape, `parametersJsonSchema` vs `parameters`, version confirmed
- https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash — Model ID, 1M context window, 65K output, function calling supported, stable status
- https://ai.google.dev/gemini-api/docs/libraries — Deprecation of `@google/generative-ai`, recommendation of `@google/genai`

### Secondary (MEDIUM confidence)
- npm registry (`npm view @google/genai version`) — verified version 2.0.0 as latest
- npm registry (`npm view @anthropic-ai/sdk version`) — verified 0.95.1 latest; project uses ^0.39.0
- Existing codebase: `lib/platform-config.ts`, `app/admin/integrations/actions.ts`, `app/admin/integrations/page.tsx` — confirmed integration patterns, `IntegrationProvider` type, `PROVIDERS` array structure

### Tertiary (LOW confidence)
- Token cost estimate (10,000 tokens for 1000 items) — calculated estimate based on standard 4 chars/token ratio; not verified with actual Gemini/Anthropic token counters

---

## Metadata

**Confidence breakdown:**
- Standard stack (packages, versions): HIGH — verified via npm registry and official docs
- Google Generative AI function calling API: HIGH — verified against official docs and GitHub SDK
- Gemini model recommendation: HIGH — verified against official model page
- DB storage mechanism (ai_config row): HIGH — confirmed `metadata: Json | null` column exists in schema
- Token cost estimate: MEDIUM — calculated estimate; 3x safety margin exists even if wrong
- Admin panel pattern: HIGH — read existing page.tsx source directly
- Test mock patterns: HIGH — read existing test files; established class-based mock pattern confirmed

**Research date:** 2026-05-07
**Valid until:** 2026-06-07 (30 days for stable stack; Gemini model landscape moves fast — verify model ID at implementation time)
