---
phase: 100
slug: output-guardrails-schema-correlation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-21
---

# Phase 100 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.4 |
| **Config file** | `vitest.config.ts` (jsdom, `@` alias to root, `server-only` stubbed) |
| **Quick run command** | `npx vitest run tests/unit/ai tests/unit/estimate` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30s (targeted), ~2–3 min (full) |

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/unit/ai tests/unit/estimate`
- **After every plan wave:** `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite green (incl. the previously-RED OBS-03 now closed by GUARD-04)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| W0 | 00 | 0 | GUARD-01..04 | unit | `npx vitest run tests/unit/ai/schema.test.ts tests/unit/ai/output-retry.test.ts tests/unit/ai/price-anchoring.test.ts tests/unit/estimate/totals-authority.test.ts` | ❌ W0 | ⬜ pending |
| schema | — | 1 | GUARD-01 | unit | `npx vitest run tests/unit/ai/schema.test.ts` | ❌ W0 | ⬜ pending |
| retry | — | 1 | GUARD-01 | unit | `npx vitest run tests/unit/ai/output-retry.test.ts` | ❌ W0 | ⬜ pending |
| invalid-map | — | 1 | GUARD-01 | unit | `npx vitest run tests/unit/estimate/never-throw.test.ts -t "invalid_output"` | ✅ extend | ⬜ pending |
| price-src | — | 1 | GUARD-01 | unit | `npx vitest run tests/unit/ai/price-source-tagging.test.ts` | ⚠️ update | ⬜ pending |
| anchor | — | 1 | GUARD-02 | unit | `npx vitest run tests/unit/ai/price-anchoring.test.ts` | ❌ W0 | ⬜ pending |
| totals | — | 1 | GUARD-03 | unit | `npx vitest run tests/unit/estimate/totals-authority.test.ts` | ❌ W0 | ⬜ pending |
| correlation | — | 1 | GUARD-04 | source-anchor | `npx vitest run tests/unit/estimate/observability.test.ts` | ⚠️ extend (closes OBS-03) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/ai/schema.test.ts` — GUARD-01: accept valid / reject malformed (missing required, negative qty/price, bad price_source coercion)
- [ ] `tests/unit/ai/output-retry.test.ts` — GUARD-01: retry-once-then-`invalid_output`; valid-first-time = single call (mock provider `callTool`)
- [ ] `tests/unit/ai/price-anchoring.test.ts` — GUARD-02: anchor override, clamp bounds (CEILING=1_000_000, zero-keep), companyId tenant scope
- [ ] `tests/unit/estimate/totals-authority.test.ts` — GUARD-03: subtotal==sum(items), grand==subtotal+tax (epsilon), NaN→0, `totals_discrepancy` metric
- [ ] UPDATE `tests/unit/ai/price-source-tagging.test.ts` — adapt 3 assertions to the `{ ok, value }` safeParse return shape
- [ ] EXTEND `tests/unit/estimate/observability.test.ts` — GUARD-04 closes the pre-existing OBS-03 RED (`langfuseSessionId`/`langfuseUserId` token present in `generate-estimate.ts`)
- [ ] EXTEND `tests/unit/estimate/never-throw.test.ts` — add `invalid_output` mapping case alongside `provider_unavailable`/`generation_failed`
- Framework install: none — vitest present.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| One correlation id pulls the matching pipeline_events timeline, Langfuse trace, and Sentry event together | GUARD-04 | Cross-system join requires live Langfuse + Sentry dashboards | In staging, generate an estimate, copy its attemptId, confirm the same id appears on the pipeline_events rows, the Langfuse trace metadata, and (on a forced error) the Sentry event tag |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
