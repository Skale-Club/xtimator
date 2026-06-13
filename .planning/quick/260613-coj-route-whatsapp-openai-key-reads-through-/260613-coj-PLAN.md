---
phase: quick-260613-coj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/whatsapp/agent.ts
  - lib/whatsapp/intent-router.ts
autonomous: true
requirements: [QUICK-COJ, TEST-ENV-01, ADMIN-06]

must_haves:
  truths:
    - "No source file outside lib/platform-config.ts reads process.env.OPENAI_API_KEY (ADMIN-06)"
    - "lib/whatsapp/agent.ts obtains the OpenAI key via getIntegrationKey('openai')"
    - "lib/whatsapp/intent-router.ts obtains the OpenAI key via getIntegrationKey('openai') at both ChatOpenAI call sites"
    - "ChatOpenAI still constructs correctly — apiKey accepts string|undefined, so the string|null return is coerced with ?? undefined"
    - "tests/unit/env-var-sweep.test.ts passes and is itself unmodified (not weakened)"
  artifacts:
    - path: "lib/whatsapp/agent.ts"
      provides: "WhatsApp confirmation ReAct agent that loads the OpenAI key from platform-config"
      contains: "getIntegrationKey('openai')"
    - path: "lib/whatsapp/intent-router.ts"
      provides: "WhatsApp intent classifier + QUERY ReAct agent that load the OpenAI key from platform-config"
      contains: "getIntegrationKey('openai')"
  key_links:
    - from: "lib/whatsapp/agent.ts new ChatOpenAI({ apiKey })"
      to: "lib/platform-config.ts getIntegrationKey('openai')"
      via: "DB-backed key loader with env fallback inside platform-config"
      pattern: "getIntegrationKey\\('openai'\\)"
    - from: "lib/whatsapp/intent-router.ts new ChatOpenAI({ apiKey })"
      to: "lib/platform-config.ts getIntegrationKey('openai')"
      via: "DB-backed key loader with env fallback inside platform-config"
      pattern: "getIntegrationKey\\('openai'\\)"
---

<objective>
Route the three direct `process.env.OPENAI_API_KEY` reads in the WhatsApp AI layer through the
platform-config key loader (`getIntegrationKey('openai')`), matching how the rest of the app obtains
provider keys. This closes the last genuine ADMIN-06 violation (TEST-ENV-01) so the
`tests/unit/env-var-sweep.test.ts` policy test passes.

The `env-var-sweep` test walks `app/`, `components/`, and `lib/` and fails if any file other than
`lib/platform-config.ts` reads `process.env.(RESEND|ANTHROPIC|OPENAI)_API_KEY`. The WhatsApp agent
and intent-router were never migrated when the rest of the app moved to the DB-backed loader.

Purpose: enforce the single-source-of-truth key policy — provider keys resolve from the encrypted
`platform_integrations` table (with an env fallback that lives ONLY inside `getIntegrationKey`), so
admins can configure keys via /admin/integrations and no key is read straight from the environment
in feature code.

Output:
- `lib/whatsapp/agent.ts` — import `getIntegrationKey`; load the key at the ChatOpenAI call site
- `lib/whatsapp/intent-router.ts` — same, at both ChatOpenAI call sites (classifier + QUERY agent)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@lib/platform-config.ts
@lib/whatsapp/agent.ts
@lib/whatsapp/intent-router.ts
@tests/unit/env-var-sweep.test.ts
@tests/unit/whatsapp/intent-router.test.ts

<interfaces>
<!-- Contracts the executor must preserve. Extracted from codebase. No exploration needed. -->

`getIntegrationKey` signature (lib/platform-config.ts:195):

```typescript
export async function getIntegrationKey(
  provider: IntegrationProvider   // 'openai' is a valid member of the union
): Promise<string | null>
```

It returns the decrypted DB key, or — when no DB row exists — falls back to `process.env.OPENAI_API_KEY`
(the ONLY place that read is allowed). Returns null when neither is configured.

All three call sites are inside `async` functions, so `await` is valid:
- agent.ts: `runConfirmationAgent` (awaits `agent.invoke`)
- intent-router.ts: the classify function returning `Promise<Intent>` (awaits `model.invoke`)
- intent-router.ts: `dispatchQuery` (`async function dispatchQuery(...): Promise<void>`)

`ChatOpenAI`'s `apiKey` field is typed `string | undefined`. `getIntegrationKey` returns
`string | null`. Under TS strict mode `null` is NOT assignable, so the value MUST be coerced with
`?? undefined`. When the key is absent, passing `undefined` reproduces the previous behavior
(ChatOpenAI then reads its own default env, identical to before for the unconfigured case).

The env-var-sweep test (tests/unit/env-var-sweep.test.ts) is the gate and MUST NOT be weakened. The
intent-router unit test (tests/unit/whatsapp/intent-router.test.ts) mocks `@langchain/openai` so the
real key is never needed; `getIntegrationKey` resolves to null/undefined harmlessly under test (no
service client), so the mocked `ChatOpenAI` still constructs.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Route WhatsApp OpenAI key reads through getIntegrationKey</name>
  <files>lib/whatsapp/agent.ts, lib/whatsapp/intent-router.ts</files>
  <action>
    In BOTH files, add the import (alongside the existing `@langchain/openai` import):
      `import { getIntegrationKey } from '@/lib/platform-config'`

    Replace each `apiKey: process.env.OPENAI_API_KEY,` inside `new ChatOpenAI({ ... })` with:
      `apiKey: (await getIntegrationKey('openai')) ?? undefined,`

    Sites (3 total):
    - lib/whatsapp/agent.ts — the single `new ChatOpenAI({ ... })` in `runConfirmationAgent`
    - lib/whatsapp/intent-router.ts — the classifier `new ChatOpenAI({ ... })`
    - lib/whatsapp/intent-router.ts — the QUERY `new ChatOpenAI({ ... })` in `dispatchQuery`

    Do NOT change model ('gpt-4o'), temperature (0), or any other construction option. Do NOT touch
    the env-var-sweep test or any other file. Per CLAUDE.md GSD enforcement, this edit is in-workflow;
    no secrets are introduced (the key is loaded at runtime, never literal).
  </action>
  <verify>
    <automated>npx vitest run tests/unit/env-var-sweep.test.ts tests/unit/whatsapp/intent-router.test.ts</automated>
  </verify>
  <done>
    env-var-sweep passes (no offenders); both WhatsApp files import and call getIntegrationKey('openai');
    intent-router unit test still green (mocked ChatOpenAI constructs); no other file changed.
  </done>
</task>

</tasks>

<verification>
- `npx vitest run tests/unit/env-var-sweep.test.ts` — passes (0 offenders).
- `npx vitest run tests/unit/whatsapp/` — full WhatsApp suite green; agent/intent-router still build their ChatOpenAI client.
- `npx tsc --noEmit` — no new type errors in agent.ts / intent-router.ts / platform-config.ts (the `?? undefined` coercion keeps apiKey assignable).
- env-var-sweep test file unchanged (git diff shows only the two lib files).
</verification>

<success_criteria>
- No file outside lib/platform-config.ts reads process.env.OPENAI_API_KEY (ADMIN-06 / TEST-ENV-01 resolved).
- WhatsApp agent + intent-router obtain the OpenAI key via getIntegrationKey('openai').
- ChatOpenAI constructs correctly (string|null coerced to string|undefined).
- env-var-sweep test passes and was not weakened.
- Suggested atomic commits: (1) code fix, (2) .planning artifacts + STATE.md + known-issues.md.
</success_criteria>

<output>
After completion, create `.planning/quick/260613-coj-route-whatsapp-openai-key-reads-through-/260613-coj-SUMMARY.md`
</output>
