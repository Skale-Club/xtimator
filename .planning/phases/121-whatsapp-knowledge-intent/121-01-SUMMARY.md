---
phase: 121-whatsapp-knowledge-intent
plan: 01
subsystem: whatsapp
tags: [whatsapp, knowledge, intent-router, rag, multi-channel]
requires:
  - lib/knowledge/answer (answer() — channel-neutral RAG composer, never-throws)
  - lib/whatsapp/intent-router (classifyAndRoute 4-intent pipeline)
provides:
  - 5th KNOWLEDGE intent in classifyAndRoute (WAKB-01)
  - dispatchKnowledge — WhatsApp consumer of lib/knowledge/answer scoped by industries[] (WAKB-02)
affects:
  - lib/whatsapp/intent-router.ts
tech-stack:
  added: []
  patterns:
    - "consumer→module import direction (lib/whatsapp imports FROM lib/knowledge, never reverse)"
    - "caller-supplied retrieval scope (industries[]/companyId from trusted service read, never from LLM)"
    - "additive 5th intent above the unchanged safe CREATE default"
key-files:
  created:
    - tests/unit/whatsapp/intent-router-knowledge.test.ts
  modified:
    - lib/whatsapp/intent-router.ts
decisions:
  - "Pass language from companies.default_estimate_language (cheap — same read) into answer() ctx"
  - "Renamed dispatchQuery's local `answer` variable to `aiText` to avoid shadowing the new imported answer()"
  - "Switch case wired in Task 3 alongside the function (not Task 2) to keep each task independently compilable"
metrics:
  duration: ~5min
  completed: 2026-06-25
  tasks: 3
  files: 2
---

# Phase 121 Plan 01: WhatsApp KNOWLEDGE Intent Summary

JWT-free 5th WhatsApp intent: an owner's generic trade how-to question now classifies as KNOWLEDGE and routes to `dispatchKnowledge`, which answers from the channel-neutral `lib/knowledge/answer` RAG module scoped by the resolved company's `industries[]` + optional company overlay — while the existing 4 intents and the safe CREATE default stay byte-preserved. This is the thin consumer that proves `lib/knowledge/answer` end-to-end over WhatsApp and ships the FINAL phase of milestone v4.8.

## What Was Built

**WAKB-01 — KNOWLEDGE in the classify pipeline** (`lib/whatsapp/intent-router.ts`):
- `Intent` union gains `'KNOWLEDGE'`.
- `parseIntent` adds `if (t.includes('KNOWLEDGE')) return 'KNOWLEDGE'` ABOVE the unconditional `return 'CREATE'` (the safe default is unchanged — both regression tests stay green).
- The `classify()` system prompt gains a `KNOWLEDGE:` bullet, a `DISAMBIGUATION — QUERY vs KNOWLEDGE` block, and `KNOWLEDGE` appended to the closing `Reply with ONLY one of:` enumeration.
- A `case 'KNOWLEDGE'` in the `classifyAndRoute` switch.

**WAKB-02 — dispatchKnowledge** (`lib/whatsapp/intent-router.ts`):
- Imports `answer` from `@/lib/knowledge/answer` (consumer→module direction).
- Reads `companies.industries, default_estimate_language` via the trusted service client (`input.supabase`), keyed by the upstream-resolved `input.companyId`.
- Calls `answer(text, { industries, companyId, language })` — `industries[]` and `companyId` are CALLER-SUPPLIED, never from the LLM. Empty `industries[]` is valid (overlay-only).
- Delivers via the existing `splitReply` + `sendOwnerReplyChunks` chunked owner-reply path.
- No try/catch around `answer()` (it never throws); the empty-string→fallback guard mirrors `dispatchQuery`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Renamed `dispatchQuery`'s local `answer` variable to `aiText`**
- **Found during:** Task 3
- **Issue:** Importing `answer` from `@/lib/knowledge/answer` would shadow the existing local `const answer = extractAIText(...)` inside `dispatchQuery`, a TypeScript scoping error blocking the build.
- **Fix:** Renamed the local variable to `aiText` (and its 2 references) — behavior-identical, no logic change.
- **Files modified:** lib/whatsapp/intent-router.ts
- **Commit:** 393a4d64

The plan anticipated the import but did not flag the name collision; this is a minimal blocking-fix, not a design change.

## Verification

- `npx vitest run tests/unit/whatsapp` → 28 files passed / 213 tests (incl. new KNOWLEDGE Tests A–E + both CREATE safe-default regressions).
- `npx vitest run` (full suite) → 314 files passed / 2219 tests passed, 0 failures (mcp-route-contract flake did not surface).
- `npx tsc --noEmit` → no new errors in `lib/whatsapp/intent-router.ts`.
- Neutrality gate: `grep -rn "lib/whatsapp" lib/knowledge/` → 0 matches.
- Safe-default preserved: `parseIntent`'s unconditional `return 'CREATE'` unchanged; KNOWLEDGE check sits above it.
- No migration, no new dependency, no secret introduced.

## Commits

- `d1909cc7` test(121-01): add failing KNOWLEDGE routing + dispatch test
- `e75cccba` feat(121-01): add KNOWLEDGE intent to union, parseIntent, classify prompt
- `393a4d64` feat(121-01): dispatch KNOWLEDGE messages to lib/knowledge/answer scoped by industries[]

## Self-Check: PASSED

All created files (test + summary) and modified source verified on disk. All 3 commit hashes (d1909cc7, e75cccba, 393a4d64) present in git history.
