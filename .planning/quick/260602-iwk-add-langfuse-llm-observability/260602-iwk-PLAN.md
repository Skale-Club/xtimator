---
phase: quick
plan: 260602-iwk
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - package-lock.json
  - lib/observability/langfuse.ts
  - lib/ai/providers/openrouter.ts
  - lib/ai/openrouter-client.ts
  - .env.local.example
  - .env.example
autonomous: true
requirements: []
must_haves:
  truths:
    - "LLM calls to OpenRouter are traced in Langfuse when keys are configured"
    - "Missing Langfuse keys silently disable tracing — no errors thrown"
    - "Audio blobs, base64 image data, and API keys are never logged to Langfuse"
    - "Serverless flush (flushAt:1, flushInterval:0) ensures traces are sent before Vercel function exits"
  artifacts:
    - path: "lib/observability/langfuse.ts"
      provides: "Lazy singleton getLangfuse() returning Langfuse | null"
      contains: "server-only"
    - path: "lib/ai/providers/openrouter.ts"
      provides: "callTool with operationName + Langfuse generation"
      contains: "operationName"
    - path: "lib/ai/openrouter-client.ts"
      provides: "analyzePhotoOR, translateTextsOR, transcribeAudioOR with Langfuse instrumentation"
      contains: "getLangfuse"
  key_links:
    - from: "lib/ai/providers/openrouter.ts"
      to: "lib/observability/langfuse.ts"
      via: "getLangfuse() import"
    - from: "lib/ai/openrouter-client.ts"
      to: "lib/observability/langfuse.ts"
      via: "getLangfuse() import"
---

<objective>
Add Langfuse LLM observability to all AI call sites in the project.

Purpose: Enable token usage tracking, latency monitoring, and prompt/response inspection for all LLM operations (estimate generation, photo analysis, translation, transcription) without breaking any existing behavior.
Output: `lib/observability/langfuse.ts` singleton + instrumented `openrouter.ts` + instrumented `openrouter-client.ts` + updated env examples.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@lib/observability/pipeline-events.ts
@lib/ai/providers/openrouter.ts
@lib/ai/openrouter-client.ts

<interfaces>
<!-- Existing best-effort pattern from pipeline-events.ts: -->
<!--   - import { requireServiceClient } from '@/lib/supabase/service' -->
<!--   - entire function body wrapped in try/catch -->
<!--   - catch block does console.warn and returns — NEVER throws -->
<!--   - callers use void recordPipelineEvent(...) on the hot path -->

<!-- lib/ai/providers/openrouter.ts key types: -->
<!--   OpenRouterChatResponse = { choices?, error? }   ← needs usage field added -->
<!--   callTool(args: { system: string; user: string }) ← needs operationName param -->
<!--   generateEstimate calls callTool (no operationName passed today) -->
<!--   refineEstimate calls callTool (no operationName passed today) -->

<!-- lib/ai/openrouter-client.ts key signatures: -->
<!--   transcribeAudioOR(audioBlob: Blob, ext: string, model?) => Promise<string> -->
<!--   analyzePhotoOR(base64: string, mimeType: string, model?) => Promise<string> -->
<!--   translateTextsOR(texts: string[], targetLanguage, model?) => Promise<Record<string,string>> -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install langfuse and create getLangfuse() singleton</name>
  <files>package.json, package-lock.json, lib/observability/langfuse.ts</files>
  <action>
Install the langfuse npm package:
```
npm install langfuse
```

Create `lib/observability/langfuse.ts` with the following design:

1. `import 'server-only'` at the top — prevents accidental browser bundle inclusion.
2. Import `Langfuse` from `'langfuse'`.
3. Declare a module-level `_client: Langfuse | null = null` variable.
4. Export `getLangfuse(): Langfuse | null` — lazy singleton factory:
   - If `_client` is already set, return it.
   - Read `process.env.LANGFUSE_PUBLIC_KEY` and `process.env.LANGFUSE_SECRET_KEY`.
   - If either is missing/empty, return `null` (silently disabled).
   - Construct a new `Langfuse({ publicKey, secretKey, baseUrl, flushAt: 1, flushInterval: 0 })` where `baseUrl = process.env.LANGFUSE_HOST ?? 'https://cloud.langfuse.com'`.
   - Store in `_client`, return it.
5. Wrap the constructor call in try/catch — on error `console.warn('[langfuse] init failed:', err)` and return `null` (best-effort, never throws).

The function signature and module structure must be:
```typescript
import 'server-only'
import { Langfuse } from 'langfuse'

let _client: Langfuse | null = null

export function getLangfuse(): Langfuse | null {
  if (_client) return _client
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_SECRET_KEY
  if (!publicKey || !secretKey) return null
  try {
    _client = new Langfuse({
      publicKey,
      secretKey,
      baseUrl: process.env.LANGFUSE_HOST ?? 'https://cloud.langfuse.com',
      flushAt: 1,
      flushInterval: 0,
    })
    return _client
  } catch (err) {
    console.warn('[langfuse] init failed:', err)
    return null
  }
}
```
  </action>
  <verify>
    <automated>cd "C:\Users\User\Desktop\projetos_skale\xtimator\xtimator" && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
    - `node_modules/langfuse` exists after `npm install`.
    - `lib/observability/langfuse.ts` compiles cleanly (`tsc --noEmit` passes).
    - File contains `import 'server-only'`, `flushAt: 1`, `flushInterval: 0`.
    - `getLangfuse()` returns `null` when env vars are absent; never throws.
  </done>
</task>

<task type="auto">
  <name>Task 2: Instrument openrouter.ts callTool with Langfuse generation</name>
  <files>lib/ai/providers/openrouter.ts</files>
  <action>
Make three targeted edits to `lib/ai/providers/openrouter.ts`:

**Edit 1 — Add `usage` to `OpenRouterChatResponse` type** (line ~70):
```typescript
type OpenRouterChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: Array<{
        function?: { name?: string; arguments?: string }
      }>
    }
  }>
  error?: { message?: string }
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}
```

**Edit 2 — Add `operationName` param to `callTool` and update callers**:
- Change `callTool` signature from `(args: { system: string; user: string })` to `(args: { system: string; user: string; operationName?: string })`.
- In `generateEstimate`, change the `callTool` call to pass `operationName: 'generate_estimate'`:
  ```typescript
  const raw = await this.callTool({
    system: buildSystemPrompt(input),
    user: buildUserContent(input),
    operationName: 'generate_estimate',
  })
  ```
- In `refineEstimate`, pass `operationName: 'refine_estimate'`:
  ```typescript
  const raw = await this.callTool({ system, user, operationName: 'refine_estimate' })
  ```

**Edit 3 — Add Langfuse tracing inside `callTool`**:
Add the import at the top of the file:
```typescript
import { getLangfuse } from '@/lib/observability/langfuse'
```

Inside `callTool`, after the `const apiKey = await getIntegrationKey('openrouter')` line, add:
```typescript
const startTime = new Date()
const operationName = args.operationName ?? 'generate_estimate'
```

After `return JSON.parse(argsJson) as Record<string, unknown>` (the successful parse), insert a Langfuse trace block BEFORE the return statement:
```typescript
const parsed = JSON.parse(argsJson) as Record<string, unknown>
try {
  const lf = getLangfuse()
  if (lf) {
    const trace = lf.trace({ name: operationName })
    trace.generation({
      name: operationName,
      model: this.model,
      input: body.messages,
      output: parsed,
      usage: {
        input: json.usage?.prompt_tokens,
        output: json.usage?.completion_tokens,
      },
      startTime,
      endTime: new Date(),
    })
  }
} catch (err) {
  console.warn('[langfuse] generation trace failed:', err)
}
return parsed
```

Remove the old `return JSON.parse(argsJson) as Record<string, unknown>` and replace with the block above. Preserve the surrounding `try { ... } catch { throw new Error('malformed...') }` — only replace the inner return.

Key constraints:
- `body.messages` is already defined above (the messages array built for the fetch body) — safe to reference as `input`.
- `json` is already available as the parsed fetch response — `json.usage` is now typed after Edit 1.
- The `try/catch` around the Langfuse block is separate from the existing `try/catch` that parses argsJson — ensure the structure is correct.
  </action>
  <verify>
    <automated>cd "C:\Users\User\Desktop\projetos_skale\xtimator\xtimator" && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
    - `tsc --noEmit` passes with no errors in `lib/ai/providers/openrouter.ts`.
    - `callTool` accepts an optional `operationName` field.
    - `generateEstimate` passes `'generate_estimate'`, `refineEstimate` passes `'refine_estimate'`.
    - `OpenRouterChatResponse` type includes `usage?: { prompt_tokens?: number; completion_tokens?: number }`.
    - Langfuse trace block is wrapped in its own try/catch — a Langfuse failure cannot propagate to the caller.
  </done>
</task>

<task type="auto">
  <name>Task 3: Instrument openrouter-client.ts and update env examples</name>
  <files>lib/ai/openrouter-client.ts, .env.local.example, .env.example</files>
  <action>
**Part A — Instrument `lib/ai/openrouter-client.ts`**

Add the import at the top of the file (after existing imports):
```typescript
import { getLangfuse } from '@/lib/observability/langfuse'
```

**`analyzePhotoOR`** — wrap with a Langfuse generation named `'analyze_photo'`.

After `return json.choices?.[0]?.message?.content ?? ''`, replace with:
```typescript
const result = json.choices?.[0]?.message?.content ?? ''
try {
  const lf = getLangfuse()
  if (lf) {
    const trace = lf.trace({ name: 'analyze_photo' })
    trace.generation({
      name: 'analyze_photo',
      model: visionModel,
      input: { mimeType, prompt: PHOTO_PROMPT },
      output: result,
      startTime,
      endTime: new Date(),
    })
  }
} catch (err) {
  console.warn('[langfuse] analyze_photo trace failed:', err)
}
return result
```
Add `const startTime = new Date()` immediately after `const visionModel = model ?? OR_DEFAULTS.chat` (before the `body` definition). Do NOT log `base64` — only `{ mimeType, prompt: PHOTO_PROMPT }` as input.

**`translateTextsOR`** — wrap with a Langfuse generation named `'translate_texts'`.

After parsing `JSON.parse(clean)`, replace:
```typescript
return JSON.parse(clean) as Record<string, string>
```
with:
```typescript
const result = JSON.parse(clean) as Record<string, string>
try {
  const lf = getLangfuse()
  if (lf) {
    const trace = lf.trace({ name: 'translate_texts' })
    trace.generation({
      name: 'translate_texts',
      model,
      input: { texts, targetLanguage },
      output: result,
      startTime,
      endTime: new Date(),
    })
  }
} catch (err) {
  console.warn('[langfuse] translate_texts trace failed:', err)
}
return result
```
Add `const startTime = new Date()` immediately after `const apiKey = await getORKey()` at the top of `translateTextsOR`.

**`transcribeAudioOR`** — wrap with a Langfuse span named `'transcribe_audio'`.

After `return (await res.text()).trim()`, replace with:
```typescript
const transcript = (await res.text()).trim()
try {
  const lf = getLangfuse()
  if (lf) {
    const trace = lf.trace({ name: 'transcribe_audio' })
    trace.span({
      name: 'transcribe_audio',
      input: { ext, model },
      output: transcript.slice(0, 200),
      startTime,
      endTime: new Date(),
    })
  }
} catch (err) {
  console.warn('[langfuse] transcribe_audio trace failed:', err)
}
return transcript
```
Add `const startTime = new Date()` after the `if (!apiKey)` throw block inside `transcribeAudioOR`. Do NOT log `audioBlob` — only `{ ext, model }` as input.

**Part B — Update `.env.local.example`**

Append the following section at the end of the file (after the S3 block):
```
# ---- Langfuse (LLM observability) -----------------------------------------
# Traces all LLM calls (estimate generation, photo analysis, translation,
# transcription). Leave unset to silently disable — no errors thrown.
# Get keys from: https://cloud.langfuse.com -> Settings -> API Keys
# LANGFUSE_PUBLIC_KEY=pk-lf-<your-key>
# LANGFUSE_SECRET_KEY=sk-lf-<your-key>
# LANGFUSE_HOST=https://cloud.langfuse.com   # optional — defaults to cloud
```

**Part C — Update `.env.example`**

Append the following section at the end of the file (after the Upstash Redis block):
```

# ============================================================
# Langfuse (LLM observability — optional)
# ============================================================
# Traces all LLM calls. Leave unset to disable silently.
# Get keys from: https://cloud.langfuse.com -> Settings -> API Keys
LANGFUSE_PUBLIC_KEY=pk-lf-<your-key>
LANGFUSE_SECRET_KEY=sk-lf-<your-key>
# LANGFUSE_HOST=https://cloud.langfuse.com   # optional — defaults to cloud
```
  </action>
  <verify>
    <automated>cd "C:\Users\User\Desktop\projetos_skale\xtimator\xtimator" && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
    - `tsc --noEmit` passes across all three instrumented files.
    - `analyzePhotoOR` traces with `input: { mimeType, prompt }` — no base64 in Langfuse.
    - `translateTextsOR` traces with `input: { texts, targetLanguage }`.
    - `transcribeAudioOR` traces with `input: { ext, model }`, output is `transcript.slice(0, 200)` — no audio blob.
    - All Langfuse blocks are wrapped in try/catch; existing non-ok/error throws are unmodified.
    - `.env.local.example` and `.env.example` each contain the Langfuse section with commented-out placeholder keys.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| server→Langfuse cloud | Trace data leaves the app to cloud.langfuse.com; only safe metadata must cross this boundary |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-iwk-01 | Information Disclosure | getLangfuse() trace input/output | mitigate | Never log audioBlob, base64 images, or API keys; input is explicitly shaped as safe metadata objects `{ mimeType, prompt }`, `{ ext, model }`, `{ texts, targetLanguage }` — raw blobs excluded by design |
| T-iwk-02 | Availability | getLangfuse() + trace calls | mitigate | All Langfuse calls wrapped in try/catch with console.warn; `flushAt:1` prevents batching that would block function exit; `getLangfuse()` returns null when keys absent |
| T-iwk-03 | Information Disclosure | LANGFUSE_SECRET_KEY env var | accept | Key stays server-only (import 'server-only' on langfuse.ts); never referenced in browser bundles; consistent with SUPABASE_SECRET_KEY pattern |
</threat_model>

<verification>
After all three tasks complete, verify end-to-end:

1. `npx tsc --noEmit` — zero errors across `lib/observability/langfuse.ts`, `lib/ai/providers/openrouter.ts`, `lib/ai/openrouter-client.ts`.
2. Grep check — confirm no audio blob or base64 data flows into Langfuse:
   - `grep -n "base64" lib/ai/openrouter-client.ts` — base64 should NOT appear inside any Langfuse trace block.
   - `grep -n "audioBlob" lib/ai/openrouter-client.ts` — audioBlob should NOT appear inside any Langfuse trace block.
3. `grep -n "server-only" lib/observability/langfuse.ts` — must return a match.
4. `grep -n "flushAt" lib/observability/langfuse.ts` — must return a match with value `1`.
5. Confirm `.env.local.example` and `.env.example` both contain `LANGFUSE_PUBLIC_KEY`.
</verification>

<success_criteria>
- `lib/observability/langfuse.ts` exports `getLangfuse(): Langfuse | null` with lazy singleton, `server-only` guard, `flushAt:1`, `flushInterval:0`, and graceful null return when env vars absent.
- `lib/ai/providers/openrouter.ts` `callTool` traces each invocation as a Langfuse generation with model, messages as input, parsed tool-call output, token usage, and timing — wrapped in try/catch.
- `lib/ai/openrouter-client.ts` traces `analyzePhotoOR` (`analyze_photo`), `translateTextsOR` (`translate_texts`), and `transcribeAudioOR` (`transcribe_audio`) — each with safe, non-sensitive inputs.
- `tsc --noEmit` passes with no new type errors.
- Behavior when `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` are absent: identical to pre-change behavior — tracing silently disabled, no errors surfaced to callers.
</success_criteria>

<output>
After completion, create `.planning/quick/260602-iwk-add-langfuse-llm-observability/260602-iwk-SUMMARY.md`
</output>
