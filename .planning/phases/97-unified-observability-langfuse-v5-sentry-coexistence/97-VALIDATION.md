---
phase: 97
slug: unified-observability-langfuse-v5-sentry-coexistence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-20
---

# Phase 97 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 97-RESEARCH.md § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.4 (jsdom env, `globals: true`, `@`→repo root alias, `server-only` stubbed) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/estimate/observability.test.ts tests/unit/observability/` |
| **Full suite command** | `npx vitest run tests/unit/` |
| **Estimated runtime** | quick ~15s · full ~90s |

---

## Sampling Rate

- **After every task commit:** Run quick command above
- **After every plan wave:** Run `npx vitest run tests/unit/` (behavior-preserving gate — all prior tests stay green)
- **Before `/gsd:verify-work`:** Full suite green, PLUS manual Langfuse UI verification (see Manual-Only below)
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| OBS-01 | `CallbackHandler` is instantiated and passed to `graph.invoke` in `generate-estimate.ts` | unit (source-text anchor) | `npx vitest run tests/unit/estimate/observability.test.ts` | ❌ Wave 0 gap | ⬜ pending |
| OBS-01 | `CallbackHandler` is instantiated and passed to `graph.invoke` in `estimate-graph.ts` (WhatsApp path) | unit (source-text anchor) | `npx vitest run tests/unit/estimate/observability.test.ts` | ❌ Wave 0 gap | ⬜ pending |
| OBS-01 | Channel discriminator (`metadata`/`tags`) present in `CallbackHandler` construction at both sites | unit (source-text anchor) | `npx vitest run tests/unit/estimate/observability.test.ts` | ❌ Wave 0 gap | ⬜ pending |
| OBS-02 | `instrumentation.ts` contains `skipOpenTelemetrySetup: true` | unit (source-text anchor) | `npx vitest run tests/unit/observability/instrumentation.test.ts` | ❌ Wave 0 gap | ⬜ pending |
| OBS-02 | `instrumentation.ts` registers both `LangfuseSpanProcessor` and `SentrySpanProcessor` | unit (source-text anchor) | `npx vitest run tests/unit/observability/instrumentation.test.ts` | ❌ Wave 0 gap | ⬜ pending |
| OBS-02 | `getLangfuse` has zero remaining call sites in the codebase | unit (source-text anchor: glob + grep) | `npx vitest run tests/unit/observability/instrumentation.test.ts` | ❌ Wave 0 gap | ⬜ pending |
| OBS-02 | No LANGFUSE keys committed (env-var only) | unit (source-text anchor: grep for literal key patterns) | `npx vitest run tests/unit/observability/instrumentation.test.ts` | ❌ Wave 0 gap | ⬜ pending |
| OBS-03 | Web non-vague happy path = exactly 1 AI call (QA-03 call-count regression) | unit (existing) | `npx vitest run tests/unit/inngest/generate-estimate-job.test.ts` | ✅ exists | ⬜ pending |
| OBS-03 | Safe-metadata rule: no `transcript`/`audio`/`key`/`apiKey` tokens in `CallbackHandler` construction | unit (source-text anchor) | `npx vitest run tests/unit/estimate/observability.test.ts` | ❌ Wave 0 gap | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/estimate/observability.test.ts` — NEW file covering OBS-01 (CallbackHandler at both `graph.invoke` call sites, channel discriminator) + OBS-03 (safe-metadata rule source anchor):
  - **Test A (OBS-01 web)**: source-text of `lib/inngest/functions/generate-estimate.ts` contains `CallbackHandler` and `callbacks:` and channel discriminator token
  - **Test B (OBS-01 WhatsApp)**: source-text of `lib/whatsapp/estimate-graph.ts` contains `CallbackHandler` and `callbacks:`
  - **Test C (OBS-03 safe-metadata)**: source-text of both call sites does NOT contain tokens `transcript`, `audio`, `apiKey`, `raw_content`, `payload`

- [ ] `tests/unit/observability/instrumentation.test.ts` — NEW file covering OBS-02 (instrumentation.ts coexistence anchors + getLangfuse eradication):
  - **Test A (OBS-02 skipOTel)**: source-text of `instrumentation.ts` contains `skipOpenTelemetrySetup: true`
  - **Test B (OBS-02 processors)**: source-text of `instrumentation.ts` contains both `LangfuseSpanProcessor` and `SentrySpanProcessor`
  - **Test C (OBS-02 getLangfuse gone)**: glob all `lib/**/*.ts` source files, none contains `getLangfuse(`
  - **Test D (OBS-02 no keys committed)**: source-text of `instrumentation.ts` does NOT contain literal patterns matching `pk-lf-` or `sk-lf-` (Langfuse key prefixes)

*All other required test infrastructure (vitest, mocking helpers) exists.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Langfuse UI shows traces for all 3 channels (web, WhatsApp, MCP) with `channel` tag | OBS-01 | Requires live `LANGFUSE_PUBLIC_KEY` + network connection to Langfuse cloud | Set keys in `.env.local`, generate 1 estimate via web UI + 1 via WhatsApp test; check Langfuse dashboard — traces should appear with correct channel tag |
| Langfuse traces show nested LLM spans with token counts and latency | OBS-03 | Requires live connection + actual AI call (not mocked) | Same as above; drill into a trace, confirm LLM node has input/output tokens + latency visible |
| Sentry still receives error traces post-`skipOpenTelemetrySetup` | OBS-02 | Requires live Sentry DSN + a deliberate server error | After deploying Phase 97, throw a test error in an API route, confirm it appears in Sentry |
| p95 latency per channel visible in Langfuse | OBS-03 | Requires multiple accumulated traces | Run 10+ estimates across channels, check Langfuse latency view |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
