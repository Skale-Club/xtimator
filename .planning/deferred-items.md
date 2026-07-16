# Deferred Items

Operational / scope deferrals surfaced during execution. Each carries forward with its rationale; none is silently dropped.

## Phase 109 — Durability + Cost-Control Hardening

### Item 5 — `step.run('price-research')` retry isolation via the StepRunner seam — DEFERRED (109-02)

**What:** Give price research its own Inngest retry unit (`runner.run('price-research', …)`) so a research-source timeout retries the research alone, without re-invoking the already-succeeded LLM generate step.

**Why deferred (not forced):** `generateEstimateForProject(companyId, projectId, options)` takes NO `StepRunner` today — `GenerateEstimateOptions` carries only `language` / `userAppLanguage` / `prompts` / `channel` / `createdByUserId` (`lib/services/generate-estimate.ts`). The price-research call is an INLINE `await researchUnmatchedPrices(...)` already wrapped in a non-fatal `try/catch` (the 108-04 wire). Giving research its own retry unit would require threading a real `StepRunner` (`lib/estimate/graph/types.ts`) through `GenerateEstimateOptions` → `generateEstimateForProject` → the research call site — an invasive change to the freshly-wired 108 service path. Per CONTEXT decision #4 and the phase scope guardrails ("DEFER IF RISKY … the inline call is already non-fatal"), this is deferred rather than forced.

**Durability intent already met at the never-throw level:** the inline `try/catch` already guarantees a research failure never blocks or fails the estimate. The finer `step.run` resume (research retried in isolation from generate) is the deferred enhancement, to be picked up when a `StepRunner` is threaded through the service path in a dedicated (non-risky) refactor.

**Pickup condition:** when `generateEstimateForProject` next gains a threaded `StepRunner` (or the service path is otherwise refactored to expose the runner seam at the research call site), wrap the `researchUnmatchedPrices` call in `runner.run('price-research', …)`.

## Phase 160 — URL Contract & Public Access Security

### Item 1 — `tests/unit/env-var-sweep.test.ts` borderline against vitest's 5s default test timeout — OBSERVED, OUT OF SCOPE (160-04)

**What:** While building the new `tests/unit/estimates/no-hardcoded-share-url.test.ts` repo-wide static sweep (Plan 160-04, Task 3 — mirrors this file's `walk()` pattern), a cold run of the NEW test timed out at vitest's default 5000ms (`tests` phase took 6242ms). Re-running the pre-existing `env-var-sweep.test.ts` standalone for comparison showed it passing but at 4.93s — right at the edge of the same 5000ms default, on this now much-larger `app/components/lib` tree than when that test was authored.

**Why deferred (out of scope):** `env-var-sweep.test.ts` is a pre-existing file untouched by this plan's task list (`files_modified` in 160-04-PLAN.md's frontmatter does not include it) — per the SCOPE BOUNDARY rule, only issues directly caused by this plan's own changes are auto-fixed. The new sweep test in this plan was given an explicit `20000`ms per-test timeout to fix its own instance of the same problem (in-scope, since it's a file this plan creates).

**Pickup condition:** if `env-var-sweep.test.ts` starts flaking on CI/local due to the 5s default timeout as the codebase keeps growing, add the same explicit longer per-test timeout (e.g. `it('...', () => {...}, 20000)`) to that file.

### Item 2 — pre-existing `chatEnabled` fixture drift in WhatsApp handler tests — RESOLVED 2026-07-16 (fixed by commit `ef5cc1bf`, quick-260715-aa1; verified: bare `tsc --noEmit` clean, all whatsapp handler tests green)

**What:** The plan's own verification command (`npx tsc --noEmit -p tsconfig.json | grep -E "send-sms|whatsapp|connect-webhook"`) also surfaces 5 pre-existing `TS2345` errors in `tests/unit/whatsapp/handler.test.ts`, `handler-intent-routing.test.ts`, and `handler-inngest-dispatch.test.ts` — inline `Entitlements` test fixtures missing the `chatEnabled` field.

**Why deferred (out of scope):** `chatEnabled` was added to `Entitlements` in Phase 126 (commit `6c0cf457`); these 3 test files were last touched in the unrelated "Billing v2" commit `f455ac16`, predating (and unrelated to) Phase 160. None of the 4 files this plan (160-04) actually modified (`app/api/estimates/[id]/send-sms/route.ts`, `lib/whatsapp/send-estimate.ts`, `lib/whatsapp/confirm-actions.ts`, `lib/billing/connect-webhook.ts`) have any type errors — confirmed via the plan's exact per-file acceptance-criteria greps. The broader `whatsapp` grep in the plan's overall `<verification>` block incidentally also matches these unrelated pre-existing fixture files. Per the SCOPE BOUNDARY rule, this pre-existing drift (not caused by this plan's changes) is logged, not fixed.

**Pickup condition:** next time `tests/unit/whatsapp/handler*.test.ts` is touched for an unrelated reason, add `chatEnabled: false` (or `true` per fixture intent) to each inline `Entitlements` object at handler.test.ts:142/289, handler-intent-routing.test.ts:130, handler-inngest-dispatch.test.ts:132/231.
