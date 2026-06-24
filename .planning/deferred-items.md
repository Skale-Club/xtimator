# Deferred Items

Operational / scope deferrals surfaced during execution. Each carries forward with its rationale; none is silently dropped.

## Phase 109 — Durability + Cost-Control Hardening

### Item 5 — `step.run('price-research')` retry isolation via the StepRunner seam — DEFERRED (109-02)

**What:** Give price research its own Inngest retry unit (`runner.run('price-research', …)`) so a research-source timeout retries the research alone, without re-invoking the already-succeeded LLM generate step.

**Why deferred (not forced):** `generateEstimateForProject(companyId, projectId, options)` takes NO `StepRunner` today — `GenerateEstimateOptions` carries only `language` / `userAppLanguage` / `prompts` / `channel` / `createdByUserId` (`lib/services/generate-estimate.ts`). The price-research call is an INLINE `await researchUnmatchedPrices(...)` already wrapped in a non-fatal `try/catch` (the 108-04 wire). Giving research its own retry unit would require threading a real `StepRunner` (`lib/estimate/graph/types.ts`) through `GenerateEstimateOptions` → `generateEstimateForProject` → the research call site — an invasive change to the freshly-wired 108 service path. Per CONTEXT decision #4 and the phase scope guardrails ("DEFER IF RISKY … the inline call is already non-fatal"), this is deferred rather than forced.

**Durability intent already met at the never-throw level:** the inline `try/catch` already guarantees a research failure never blocks or fails the estimate. The finer `step.run` resume (research retried in isolation from generate) is the deferred enhancement, to be picked up when a `StepRunner` is threaded through the service path in a dedicated (non-risky) refactor.

**Pickup condition:** when `generateEstimateForProject` next gains a threaded `StepRunner` (or the service path is otherwise refactored to expose the runner seam at the research call site), wrap the `researchUnmatchedPrices` call in `runner.run('price-research', …)`.
