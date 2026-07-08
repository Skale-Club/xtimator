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
