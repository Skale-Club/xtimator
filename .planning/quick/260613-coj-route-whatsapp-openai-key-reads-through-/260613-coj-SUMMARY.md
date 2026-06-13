# Quick Task 260613-coj — Summary

**Date:** 2026-06-13
**Goal:** Route the three direct `process.env.OPENAI_API_KEY` reads in the WhatsApp AI layer through
`getIntegrationKey('openai')` so `tests/unit/env-var-sweep.test.ts` (ADMIN-06 / TEST-ENV-01) passes —
the last genuine product gap from quick task 260613-aoe.

## Outcome

`npx vitest run tests/unit/env-var-sweep.test.ts`: **PASS** (1/1). ADMIN-06 violation cleared —
`getIntegrationKey` is once again the single source of truth for provider keys in feature code.

## What changed (product code — 2 files, 3 call sites)

Both files gained `import { getIntegrationKey } from '@/lib/platform-config'`, and each
`new ChatOpenAI({ ... })` now resolves the key from platform-config:

```diff
- apiKey: process.env.OPENAI_API_KEY,
+ apiKey: (await getIntegrationKey('openai')) ?? undefined,
```

- `lib/whatsapp/agent.ts` — `runConfirmationAgent` (confirmation ReAct agent).
- `lib/whatsapp/intent-router.ts` — the intent **classifier** model.
- `lib/whatsapp/intent-router.ts` — the **QUERY** ReAct agent model in `dispatchQuery`.

`getIntegrationKey('openai')` reads the encrypted key from `platform_integrations`, with an env
fallback that lives ONLY inside `lib/platform-config.ts` (the file the sweep test exempts). The
`?? undefined` coercion bridges its `string | null` return to `ChatOpenAI`'s `apiKey?: string` under
strict TS; when no key is configured, `undefined` reproduces the prior behavior. All three sites were
already `async`, so `await` needed no signature changes.

## Verification

- `npx vitest run tests/unit/env-var-sweep.test.ts` → **1 passed** (the gate).
- `npx vitest run tests/unit/whatsapp/` → **189 passed, 0 failed** (22 files + 3 skipped). Confirms
  the agent/intent-router still construct their `ChatOpenAI` client; `intent-router.test.ts` (which
  mocks `@langchain/openai`) is green.
- `npx tsc --noEmit` → no type errors in `agent.ts`, `intent-router.ts`, or `platform-config.ts`.
- `git diff` touches only the two `lib/whatsapp/*` files — the env-var-sweep test is **unmodified**
  (not weakened, per the task constraint).

## Notes / deviations

- **Work was already present in the working tree, uncommitted.** When this task started, the exact
  fix (both imports + all three `getIntegrationKey('openai')` coercions) was already applied to
  `lib/whatsapp/agent.ts` and `lib/whatsapp/intent-router.ts` as unstaged changes — the
  conversation-start git snapshot ("clean") was stale. Rather than re-derive the change in an
  isolated worktree (which would have orphaned these edits), this task **reviewed, verified, and
  committed** the in-tree changes. The diff matches the intended approach exactly; nothing else was
  modified.
- The `?? undefined` coercion (vs. a non-null assertion or leaving `null`) is required for strict-mode
  type-safety and matches the established platform-config consumer pattern.
- This resolves **TEST-ENV-01**; the 2026-06-13 mock-drift residual in
  [known-issues.md](../../known-issues.md) drops from 1 product-fix item to 0 (FLAGGED test-rewrite
  items are unrelated and remain).
