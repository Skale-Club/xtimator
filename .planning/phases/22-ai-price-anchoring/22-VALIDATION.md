---
phase: 22
slug: ai-price-anchoring
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.4 + @testing-library/react 16.3.2 + jsdom 29.0.2 |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npx vitest run tests/unit/ai/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5s quick, ~25s full suite |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/ai/`
- **After every plan wave:** Run `npx vitest run` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green (modulo `deferred-items.md` baseline)
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 0 | AIPRICE-01/02/03 (lib/ai stubs) | n/a (structure) | `ls lib/ai/types.ts lib/ai/provider.interface.ts lib/ai/index.ts lib/ai/providers/anthropic.ts lib/ai/providers/gemini.ts` | ❌ W0 | ⬜ pending |
| 22-01-02 | 01 | 0 | AIPRICE-01 | unit | `npx vitest run tests/unit/ai/prompt-builder.test.ts` | ❌ W0 | ⬜ pending |
| 22-01-03 | 01 | 0 | AIPRICE-01 | unit | `npx vitest run tests/unit/ai/provider-factory.test.ts` | ❌ W0 | ⬜ pending |
| 22-01-04 | 01 | 0 | AIPRICE-01 | unit | `npx vitest run tests/unit/ai/anthropic-adapter.test.ts` | ❌ W0 | ⬜ pending |
| 22-01-05 | 01 | 0 | AIPRICE-01 | unit | `npx vitest run tests/unit/ai/gemini-adapter.test.ts` | ❌ W0 | ⬜ pending |
| 22-01-06 | 01 | 0 | AIPRICE-03 | unit | `npx vitest run tests/unit/ai/price-source-tagging.test.ts` | ❌ W0 | ⬜ pending |
| 22-01-07 | 01 | 0 | AIPRICE-01 | n/a | `bun add @google/genai` — package.json updated | ❌ W0 | ⬜ pending |
| 22-02-01 | 02 | 1 | AIPRICE-01/02 | unit | `npx vitest run tests/unit/ai/prompt-builder.test.ts` | ❌ W0 → ✅ | ⬜ pending |
| 22-02-02 | 02 | 1 | AIPRICE-01 | unit | `npx vitest run tests/unit/ai/provider-factory.test.ts` | ❌ W0 → ✅ | ⬜ pending |
| 22-02-03 | 02 | 1 | AIPRICE-01 | unit | `npx vitest run tests/unit/ai/anthropic-adapter.test.ts` | ❌ W0 → ✅ | ⬜ pending |
| 22-02-04 | 02 | 1 | AIPRICE-01 | unit | `npx vitest run tests/unit/ai/gemini-adapter.test.ts` | ❌ W0 → ✅ | ⬜ pending |
| 22-02-05 | 02 | 1 | AIPRICE-03 | unit | `npx vitest run tests/unit/ai/price-source-tagging.test.ts` | ❌ W0 → ✅ | ⬜ pending |
| 22-03-01 | 03 | 2 | AIPRICE-01/02/03 | unit | `npx vitest run tests/unit/ai/` (full suite for phase) | ✅ all | ⬜ pending |
| 22-03-02 | 03 | 2 | AIPRICE-01/02/03 | regression | `npx vitest run` (full suite — no new failures vs baseline) | ✅ | ⬜ pending |
| 22-03-03 | 03 | 2 | All | build | `npx tsc --noEmit` (only pre-existing @react-pdf errors) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `lib/ai/types.ts` — `EstimateInput`, `EstimateOutput`, `LineItemOutput` (with `price_source`) skeleton
- [ ] `lib/ai/provider.interface.ts` — `AIProvider` interface skeleton
- [ ] `lib/ai/index.ts` — `getAIProvider()` factory skeleton (throws "not implemented")
- [ ] `lib/ai/providers/anthropic.ts` — Claude adapter skeleton (implements AIProvider)
- [ ] `lib/ai/providers/gemini.ts` — Gemini adapter skeleton (implements AIProvider)
- [ ] `tests/unit/ai/prompt-builder.test.ts` — RED stubs for price book injection logic
- [ ] `tests/unit/ai/provider-factory.test.ts` — RED stubs for getAIProvider() factory
- [ ] `tests/unit/ai/anthropic-adapter.test.ts` — RED stubs for Claude adapter
- [ ] `tests/unit/ai/gemini-adapter.test.ts` — RED stubs for Gemini adapter
- [ ] `tests/unit/ai/price-source-tagging.test.ts` — RED stubs for defensive fallback + persistence
- [ ] `bun add @google/genai` — D-08 confirmed package name (NOT @google/generative-ai which is deprecated)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end estimate with price book matches uses correct prices | AIPRICE-01 | Real AI call needed; mock tests verify wiring only | Admin: configure Anthropic key + select Anthropic provider. Create company with 3 price book items. Record audio describing one of those items. Generate estimate. Verify matched item price matches price book. |
| Same test with Gemini provider active | AIPRICE-01 | Real Gemini API call | Admin: switch to Gemini provider + configure Gemini key. Repeat above test. Verify matched price is from price book. |
| Empty price book generates estimate normally | AIPRICE-02 | Behavioral regression check | Company with no price book items: generate estimate. Verify estimate generates successfully, all items have `price_source = 'ai_estimate'`. |
| price_source persists to DB correctly | AIPRICE-03 | DB inspection | After generating estimate with price book matches, inspect `estimate_items` rows in Supabase dashboard. Verify `price_source` column has 'price_book' for matched items and 'ai_estimate' for others. |
| Admin panel provider switch works without redeploy | D-19 | UI + DB interaction | In super admin panel, switch active provider from Anthropic to Gemini. Without restarting server, generate estimate. Verify Gemini was used (check logs or provider field). |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (5 test files + 5 source files + npm install)
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter (after Wave 0 lands RED)

**Approval:** pending
