---
phase: quick-260705-bml
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/ai/providers/gemini.ts
  - lib/ai/with-fallback.ts
  - tests/unit/ai/gemini-cost-capture.test.ts
  - tests/unit/ai/with-fallback.test.ts
autonomous: true
requirements: [OBS-GEMINI-COST, OBS-SILENT-FALLBACK]

must_haves:
  truths:
    - "Every successful Gemini-served estimate generation records exactly one ai_cost_events row (provider 'gemini', realCostUsd null)"
    - "Every successful Gemini-served refine records a gemini/null-cost estimate row (randomUUID attemptId, null ids)"
    - "Gemini cost recording never affects the estimate return — recordAICost is awaited but internally never-throw"
    - "A successful primary->fallback (OpenRouter down, Gemini served) emits exactly one Sentry.captureMessage at level 'warning'"
    - "A primary failure whose message indicates 402/insufficient-credits or 401/auth escalates the Sentry signal to level 'error' with an ai_primary_down 'billing_or_auth' tag"
    - "The happy path (primary succeeds) emits NO Sentry signal"
    - "A throwing Sentry mock does not break the fallback result (never-throw side-effect)"
    - "All existing with-fallback contracts stay green: .cause===primary, fallbackCause, both-fail ProvidersUnavailableError, InvalidEstimateOutputError rethrow, primary-called-exactly-once"
  artifacts:
    - path: "lib/ai/providers/gemini.ts"
      provides: "Gemini adapter that records a null-cost gemini ai_cost_events row on successful generate + refine"
      contains: "recordAICost"
    - path: "lib/ai/with-fallback.ts"
      provides: "callWithFallback with a never-throw Sentry observability side-effect on the successful-fallback branch"
      contains: "captureMessage"
    - path: "tests/unit/ai/gemini-cost-capture.test.ts"
      provides: "Asserts Gemini generate/refine record a gemini/null-cost row with correct ids"
    - path: "tests/unit/ai/with-fallback.test.ts"
      provides: "Existing contracts PLUS new fallback-observability assertions"
      contains: "captureMessage"
  key_links:
    - from: "lib/ai/providers/gemini.ts generateEstimate"
      to: "recordAICost (@/lib/billing/record-ai-cost)"
      via: "awaited call after normalizeOutput ok, before return r.value"
      pattern: "await recordAICost\\("
    - from: "lib/ai/with-fallback.ts successful-fallback branch"
      to: "@sentry/nextjs captureMessage"
      via: "try/catch-wrapped call before returning servedBy:'fallback'"
      pattern: "Sentry\\.captureMessage"
---

<objective>
Close two IN-CODE observability gaps that let the OpenRouter-out-of-credits outage be served silently by the Gemini fallback for hours with ZERO cost rows and ZERO alerts.

FIX-1: The Gemini fallback adapter (lib/ai/providers/gemini.ts) currently makes ZERO recordAICost calls, so every Gemini-served estimate is invisible in ai_cost_events. Add an awaited, never-throw, null-cost recordAICost on the successful generate + refine paths, mirroring the OpenRouter adapter's proven pattern (openrouter.ts:236).

FIX-2: callWithFallback (lib/ai/with-fallback.ts) returns fallbackFired:true but never logs/alerts, so a successful silent degradation is undetectable. Add a never-throw Sentry.captureMessage side-effect on the already-existing successful-fallback branch, escalating to level 'error' when the primary error string indicates a billing/auth account failure (402/insufficient credits / 401).

Purpose: Make Gemini-served generations COUNT (measure-only null-cost rows) and make silent provider degradation VISIBLE within minutes.
Output: Two hardened source files + one new test file + extended fallback tests. No DB migration, no architecture change, no charging.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

@lib/ai/providers/gemini.ts
@lib/ai/providers/openrouter.ts
@lib/billing/record-ai-cost.ts
@lib/ai/with-fallback.ts
@lib/observability/capture.ts
@lib/ai/types.ts
@tests/unit/ai/gemini-adapter.test.ts
@tests/unit/ai/openrouter-cost-capture.test.ts
@tests/unit/ai/with-fallback.test.ts
@tests/unit/billing/measure-only-invariant.test.ts

<interfaces>
<!-- Contracts the executor needs. Extracted from codebase — no exploration required. -->

recordAICost — @/lib/billing/record-ai-cost (already internally never-throw; awaiting is safe):
```typescript
export interface AICostInput {
  attemptId: string
  operationType: 'estimate' | 'photo_batch' | 'audio_minutes' | 'price_research' | 'translation' | 'vision'
  provider: 'openrouter' | 'openai' | 'anthropic' | 'gemini'
  realCostUsd: number | null // null = provider gave no cost (NEVER 0 — passed THROUGH to DB)
  companyId?: string | null
  projectId?: string | null
  estimateId?: string | null
  model?: string | null
  units?: number | null
}
export async function recordAICost(ev: AICostInput): Promise<void> // never throws, never rejects
```

The EXACT pattern to mirror — openrouter.ts:236 (already awaited, never-throw, null-safe):
```typescript
const realCostUsd = json.usage?.cost ?? null
await recordAICost({
  attemptId: args.costContext?.attemptId ?? randomUUID(),
  operationType: 'estimate',
  provider: 'openrouter',
  model: this.model,
  realCostUsd,
  companyId: args.costContext?.companyId ?? null,
  projectId: args.costContext?.projectId ?? null,
})
```

EstimateInput.costContext — @/lib/ai/types (available on generateEstimate; ABSENT on RefineEstimateInput):
```typescript
costContext?: { attemptId?: string | null; companyId?: string | null; projectId?: string | null }
```

Sentry never-throw pattern to mirror — @/lib/observability/capture.ts:
```typescript
try { Sentry.captureException(err, { tags: { background: context } }) } catch { /* reporting must never crash */ }
```

callWithFallback — @/lib/ai/with-fallback.ts. The ONLY branch to touch is the successful-fallback return at lines 106-107:
```typescript
    try {
      const result = await args.fallback()
      return { result, servedBy: 'fallback', fallbackFired: true }   // <-- emit Sentry signal BEFORE this return
    } catch (fallbackErr) { ... both-fail path — DO NOT TOUCH ... }
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 (FIX-1): Gemini adapter records a null-cost event on successful generate + refine</name>
  <files>lib/ai/providers/gemini.ts, tests/unit/ai/gemini-cost-capture.test.ts</files>
  <behavior>
    - generateEstimate success → recordAICost called EXACTLY once with:
        { provider: 'gemini', model: 'gemini-2.5-flash', operationType: 'estimate', realCostUsd: null,
          attemptId: input.costContext.attemptId, companyId: input.costContext.companyId, projectId: input.costContext.projectId }
    - generateEstimate WITHOUT costContext → recordAICost called once with a randomUUID attemptId (non-empty string) and companyId/projectId null.
    - realCostUsd is strictly null (NEVER 0) — assert `.toBeNull()` AND `.not.toBe(0)` (null-vs-0 discipline; a null-cost row still COUNTS the Gemini-served event).
    - refineEstimate success → recordAICost called once with provider 'gemini', operationType 'estimate', realCostUsd null, a randomUUID attemptId, companyId/projectId null (RefineEstimateInput carries no costContext — mirror openrouter.ts:134).
    - Correlation ids come ONLY from input.costContext, NEVER from the model's returned args (e.g. suggested_client_name must never become companyId).
    - Existing tests/unit/ai/gemini-adapter.test.ts cases stay GREEN (they don't mock recordAICost — the new recordAICost mock lives only in the new file; verify the old file still passes untouched).
  </behavior>
  <action>
In lib/ai/providers/gemini.ts:

1. Add imports at the top (alongside existing imports):
   - `import { randomUUID } from 'node:crypto'`
   - `import { recordAICost } from '@/lib/billing/record-ai-cost'`

2. In `GeminiAdapter.generateEstimate` — after the `if (!r.ok) throw new InvalidEstimateOutputError(r.error)` guard (currently line ~171) and BEFORE `return r.value`, insert an AWAITED recordAICost call mirroring openrouter.ts:236. Include the same rationale comment as openrouter.ts (AWAIT not void — Inngest step can freeze/drop a floating promise; recordAICost is internally never-throw so awaiting is safe and can never affect the estimate return):
   ```typescript
   // Cost-recording observability: this adapter is the SILENT fallback. Record a
   // gemini/null-cost row so a Gemini-served estimate is not invisible in
   // ai_cost_events. Gemini's SDK returns no USD cost — record NULL, NEVER 0
   // (null-vs-0 discipline): a null-cost row still COUNTS the event ("served by
   // gemini, cost unknown") vs "no row at all". AWAIT (not void): mirrors
   // openrouter.ts — inside an Inngest step a floating promise can be dropped
   // when the invocation freezes. recordAICost is internally never-throw, so
   // awaiting is safe and can never affect the estimate return. Correlation ids
   // come ONLY from the trusted, non-LLM costContext (never from `args`).
   await recordAICost({
     attemptId: input.costContext?.attemptId ?? randomUUID(),
     operationType: 'estimate',
     provider: 'gemini',
     model: 'gemini-2.5-flash',
     realCostUsd: null,
     companyId: input.costContext?.companyId ?? null,
     projectId: input.costContext?.projectId ?? null,
   })
   return r.value
   ```

3. In `GeminiAdapter.refineEstimate` — after `if (!r.ok) throw new InvalidEstimateOutputError(r.error)` (currently line ~266) and BEFORE `return r.value`, insert the same call but with a randomUUID attemptId and null ids (RefineEstimateInput carries no costContext — same as openrouter.ts:134). operationType stays 'estimate' (refine is part of the estimate cost family, matching OpenRouter's refine path):
   ```typescript
   // RefineEstimateInput carries no costContext (generate is the correlated path);
   // still record so the Gemini-served refine is counted, with null ids via randomUUID.
   await recordAICost({
     attemptId: randomUUID(),
     operationType: 'estimate',
     provider: 'gemini',
     model: 'gemini-2.5-flash',
     realCostUsd: null,
     companyId: null,
     projectId: null,
   })
   return r.value
   ```

4. DEFER analyzePhotoGemini (vision) and transcribeAudioGemini (audio_minutes): they take (base64, mimeType) / (audioBlob, ext) with NO costContext param, so recording there would be a null-id, uncorrelated row and threading costContext into their signatures + all call sites is out of scope for this focused task. Add a one-line `// NOTE:` comment above each explaining the deferral (vision/transcription cost recording deferred — no costContext param; would be an uncorrelated null-id row). Do NOT change their signatures.

CREATE tests/unit/ai/gemini-cost-capture.test.ts — mirror the mock strategy of tests/unit/ai/gemini-adapter.test.ts (mock @google/genai, @/lib/platform-config, @/lib/ai/prompt-builder) and ADD `vi.mock('@/lib/billing/record-ai-cost', () => ({ recordAICost: vi.fn().mockResolvedValue(undefined) }))`. Note prompt-builder in the existing file only mocks buildSystemPrompt + buildUserContent; refine additionally uses buildRefineUserContent and gemini.ts imports toRefineEstimateInput — either add `buildRefineUserContent: vi.fn().mockReturnValue('refine user content')` to the prompt-builder mock and let the real toRefineEstimateInput/normalize run, OR mock only what the failing test surfaces. Import { GeminiAdapter } and { recordAICost }; cast recordAICost to a vi mock. Write the assertions listed in <behavior> above. Reuse a makeFunctionCallResponse helper like the existing file's. For the refine case, build a minimal valid RefineEstimateInput { existingEstimate: <a normalizeOutput-valid EstimateOutput>, instruction: 'add a line', priceBookItems: [] }.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/ai/gemini-cost-capture.test.ts tests/unit/ai/gemini-adapter.test.ts tests/unit/billing/measure-only-invariant.test.ts</automated>
  </verify>
  <done>generateEstimate + refineEstimate each record exactly one gemini/'estimate'/null-cost row; ids come from costContext (generate) or randomUUID+null (refine); realCostUsd is null not 0; the pre-existing gemini-adapter tests and the measure-only invariant test stay green; the two vision/transcription DEFER notes are present.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 (FIX-2): Surface the silent fallback via a never-throw Sentry signal</name>
  <files>lib/ai/with-fallback.ts, tests/unit/ai/with-fallback.test.ts</files>
  <behavior>
    - Successful fallback (primary throws a plain Error, fallback resolves) → Sentry.captureMessage called EXACTLY once with level 'warning', a message mentioning the op and "fallback", tags include { op, ai_fallback: 'served_by_fallback' }, and extra.primaryError carries the primary error's message/string.
    - Primary error message containing '402' OR 'Insufficient credits' (case-insensitive) → captureMessage called with level 'error' and an extra tag ai_primary_down: 'billing_or_auth'.
    - Primary error message containing '401' OR 'User not found' OR 'not configured' → same 'error'/'billing_or_auth' escalation (auth/account reason).
    - Happy path (primary resolves) → captureMessage NOT called (assert 0 calls).
    - Never-throw: if Sentry.captureMessage throws, callWithFallback STILL returns { result, servedBy:'fallback', fallbackFired:true } (the fallback result is unaffected).
    - The both-fail path does NOT emit the fallback-served signal (it throws ProvidersUnavailableError as before; captureMessage from THIS branch is not called on both-fail).
    - ALL existing with-fallback.test.ts cases stay GREEN unchanged: primary-success (servedBy primary, fallback not called), primary-called-once, fallback-fired result, both-fail ProvidersUnavailableError with .cause===PRIMARY_ERR, fallbackCause===FALLBACK_ERR.
  </behavior>
  <action>
In lib/ai/with-fallback.ts:

1. Add at the top of the file: `import * as Sentry from '@sentry/nextjs'`. (with-fallback.ts is server-only — safe. Do not add 'server-only' if not already present; match the file's current header.)

2. Add a small private helper ABOVE callWithFallback that classifies a primary error string and emits the signal, fully wrapped in try/catch so it can NEVER throw (mirror captureBackgroundError in lib/observability/capture.ts):
   ```typescript
   /**
    * Never-throw observability for the silent successful-fallback path. Emits a
    * Sentry warning that the primary failed and the fallback served. Escalates to
    * 'error' when the primary error string indicates an ACCOUNT-level failure
    * (402 / insufficient credits / 401 / bad-or-missing key) — that means the
    * primary is down for a billing/auth reason (not a transient blip) and an
    * operator must act. Detection is deliberately simple string matching — the
    * wrapper only has the thrown error, so do not over-engineer HTTP parsing.
    * Reporting must NEVER break the AI call: the whole body is try/catch-swallowed.
    */
   function reportSilentFallback(op: string, primaryErr: unknown): void {
     try {
       const primaryError =
         primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
       const billingOrAuth =
         /402|insufficient credits|401|user not found|not configured/i.test(primaryError)
       Sentry.captureMessage(
         `[ai-fallback] primary failed for op '${op}', served by fallback`,
         {
           level: billingOrAuth ? 'error' : 'warning',
           tags: {
             op,
             ai_fallback: 'served_by_fallback',
             ...(billingOrAuth ? { ai_primary_down: 'billing_or_auth' } : {}),
           },
           extra: { primaryError },
         }
       )
     } catch {
       // Reporting itself must never crash the fallback path.
     }
   }
   ```

3. In callWithFallback, on the SUCCESSFUL-fallback branch ONLY (currently lines 105-107), call the helper BEFORE returning:
   ```typescript
     try {
       const result = await args.fallback()
       reportSilentFallback(args.op, primaryErr)   // <-- ADD: never-throw side-effect
       return { result, servedBy: 'fallback', fallbackFired: true }
     } catch (fallbackErr) {
       // ... UNCHANGED both-fail path (ProvidersUnavailableError + fallbackCause) ...
     }
   ```

DO NOT change: the control flow, the return shape, the InvalidEstimateOutputError rethrow guard (lines 99-104), the both-fail ProvidersUnavailableError(+fallbackCause) path, or the multi-tenant invariant (NO companyId — the signal is op + primary error only, company-agnostic).

EXTEND tests/unit/ai/with-fallback.test.ts (keep every existing case byte-identical):
- Add at the TOP of the file (before the imports of callWithFallback): `vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))`.
- Import: `import * as Sentry from '@sentry/nextjs'` and reference `Sentry.captureMessage as ReturnType<typeof vi.fn>`.
- New cases (a `describe('callWithFallback observability', ...)` block):
  1. successful fallback (primary rejects Error('primary down'), fallback resolves 'B') → captureMessage called once with an object whose level==='warning' and tags.ai_fallback==='served_by_fallback'.
  2. primary rejects Error('OpenRouter request failed (402): Insufficient credits') → captureMessage called with level==='error' and tags.ai_primary_down==='billing_or_auth'.
  3. primary resolves → captureMessage NOT called (expect 0 calls).
  4. never-throw: `vi.mocked(Sentry.captureMessage).mockImplementationOnce(() => { throw new Error('sentry down') })`, primary rejects, fallback resolves 'B' → outcome.result==='B', servedBy==='fallback' (the throwing Sentry mock does not break the result).
- Ensure `vi.clearAllMocks()` in beforeEach still runs so captureMessage call counts are per-test.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/ai/with-fallback.test.ts</automated>
  </verify>
  <done>Successful fallback emits exactly one captureMessage ('warning'); a 402/insufficient-credits (or 401/auth) primary error escalates to 'error' + ai_primary_down 'billing_or_auth'; the happy path emits nothing; a throwing Sentry mock leaves the fallback result intact; all pre-existing .cause/fallbackCause/both-fail/primary-once contracts stay green.</done>
</task>

</tasks>

<verification>
Full gate (both fixes together), matching the constraint:
```
npx tsc --noEmit -p tsconfig.ci.json && npx vitest run tests/unit tests/eval
```
Pre-existing PARALLEL-ONLY flakes (billing / company-action / team-invite / mcp-route) are NOT regressions — if one fails, re-run it in isolation to confirm green (e.g. `npx vitest run tests/unit/actions/company-action.test.ts`). A failure that only appears in the full parallel run and passes in isolation, in a file this plan does not touch, is not a regression.

Targeted sanity greps:
- `grep -c "recordAICost" lib/ai/providers/gemini.ts` → ≥ 2 (generate + refine).
- `grep -c "Sentry.captureMessage" lib/ai/with-fallback.ts` → 1.
- Confirm lib/billing/record-ai-cost.ts is UNCHANGED (measure-only invariant untouched).
</verification>

<success_criteria>
- Gemini generate + refine each record exactly one gemini/'estimate'/null-cost ai_cost_events row; generate uses input.costContext ids, refine uses randomUUID + null ids; realCostUsd is null, never 0.
- Gemini cost recording is awaited yet never affects the estimate return (recordAICost internally never-throw).
- callWithFallback emits exactly one never-throw Sentry warning on a successful fallback, escalating to 'error' + ai_primary_down 'billing_or_auth' on a 402/insufficient-credits/401/auth primary error; nothing on the happy path; a throwing Sentry mock does not break the fallback.
- callWithFallback control flow, return shape, .cause===primary, fallbackCause, both-fail ProvidersUnavailableError, and InvalidEstimateOutputError rethrow are all UNCHANGED (existing tests green).
- No DB migration, no charging, no secrets; record-ai-cost.ts untouched; measure-only invariant test green.
- Vision/transcription Gemini cost recording explicitly DEFERRED with an in-code note (no signature changes).
- Full gate green: `npx tsc --noEmit -p tsconfig.ci.json && npx vitest run tests/unit tests/eval` (modulo the known parallel-only flakes, confirmed green in isolation).
</success_criteria>

<output>
After completion, create `.planning/quick/260705-bml-cost-recording-observability-record-gemi/260705-bml-SUMMARY.md`
</output>
