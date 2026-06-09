---
phase: quick-260609-mk4
plan: 01
subsystem: whatsapp
tags: [whatsapp, query-agent, prompt, isolation, ux]
requires:
  - lib/whatsapp/intent-router.ts dispatchQuery
  - lib/whatsapp/query-tools.ts makeQueryTools (companyId closure)
  - lib/whatsapp/client.ts sendWhatsAppMessage
  - lib/whatsapp/conversations.ts logOutboundMessage
provides:
  - lib/whatsapp/split-reply.ts splitReply (pure WhatsApp chunker)
  - grounded/isolation QUERY system prompt with per-company profile injection
  - multi-message sequential reply delivery for the QUERY agent
affects:
  - WhatsApp QUERY intent replies (owner-facing answers)
tech-stack:
  added: []
  patterns:
    - "Pure, side-effect-free string helper unit-tested in isolation (no mocks)"
    - "Service-client company profile read scoped by .eq('id', companyId), maybeSingle, graceful null"
    - "Closure-based tenant isolation reinforced (not replaced) by natural-language prompt rules"
key-files:
  created:
    - lib/whatsapp/split-reply.ts
    - tests/unit/whatsapp/split-reply.test.ts
  modified:
    - lib/whatsapp/intent-router.ts
decisions:
  - "splitReply splits paragraphs first (/\\n\\s*\\n/), then sentence/newline greedy-pack, hard-slice as last resort; drops empty chunks"
  - "Company profile fetched with input.supabase (service client) reusing the same client query-tools uses; missing row degrades to '- (no additional profile on file)' + companyName 'this business', never throws"
  - "QUERY answer delivered via new sendOwnerReplyChunks (ordered, awaited, per-chunk fire-and-forget log); single-message sendOwnerReply kept unchanged for error/normalize-fail paths"
metrics:
  duration_minutes: 3
  completed: 2026-06-09
  tasks: 2
  files: 3
---

# Quick Task 260609-mk4: WhatsApp QUERY Assistant Grounding + Multi-Message Replies Summary

Upgraded the WhatsApp QUERY assistant (`dispatchQuery()`) to (1) ground answers strictly in the resolved company's profile + tool results with strong single-tenant isolation language, and (2) split long answers into multiple short, ordered WhatsApp messages via a new pure `splitReply()` helper.

## What Was Built

### Task 1 — `lib/whatsapp/split-reply.ts` (+ tests) — commit c21144f
`splitReply(text, maxLen = 1000): string[]` — a pure function that:
- Splits on blank-line paragraph boundaries first (one chunk per paragraph).
- Greedily packs sentence/newline pieces of any oversized paragraph under `maxLen`; hard-slices a single piece that still exceeds `maxLen`.
- Trims and drops empty/whitespace chunks; returns `[]` for empty/whitespace input.
- Preserves order throughout (paragraph order, then sentence order within a paragraph).
- 8 unit tests cover short input, paragraph splits, empty-chunk dropping, oversized-paragraph sub-splitting, hard-slice, empty/whitespace input, and order preservation.

### Task 2 — `lib/whatsapp/intent-router.ts` `dispatchQuery()` — commit 5149d1a
- Fetches the company profile (`name, owner_name, phone, email, website`) via `input.supabase` scoped to `input.companyId` (`maybeSingle`); builds a compact profile block skipping null/empty fields; degrades gracefully when the row is missing (no throw).
- Replaced the 4-line prompt with the grounded/isolation/short-friendly prompt: names the single company, forbids cross-company references and invented prices/names/dates/IDs, and instructs short, warm replies in the user's language with blank-line separation for multi-message answers.
- Long answers are split with `splitReply()` and delivered via a new private `sendOwnerReplyChunks()` that sends each chunk in order (awaited) and fire-and-forget logs each via `logOutboundMessage` — mirroring the existing `sendOwnerReply` pattern. Empty answer falls back to a single message.
- `sendOwnerReply` (single message) is unchanged and still used by the error/normalize-fail paths.

## Verification Results

- `npx vitest run tests/unit/whatsapp/split-reply.test.ts` — 8/8 pass.
- `npx vitest run tests/unit/whatsapp/intent-router.test.ts tests/unit/whatsapp/query-tools.test.ts` — 13/13 pass (existing QUERY routing Test 3 still green; query-tools unchanged → no `company_id` field added to any tool schema).
- `npx tsc --noEmit` — clean for all task files (`intent-router.ts`, `split-reply.ts`). 3 unrelated, pre-existing errors remain in `tests/unit/notifications/account-emails.test.ts` (confirmed present on HEAD via `git stash` before this task; see Deferred Issues).
- Manual diff check: `git diff --name-only HEAD~2 HEAD` lists only the 3 intended files. `lib/services/generate-estimate.ts` and `lib/platform-config.ts` (estimate-generation + admin prompt paths) are NOT in the diff.

## Deviations from Plan

None — plan executed exactly as written.

## Deferred Issues

Out-of-scope, pre-existing TypeScript errors (logged to `deferred-items.md`, NOT fixed per SCOPE BOUNDARY):
- `tests/unit/notifications/account-emails.test.ts` (lines 84, 172, 219): mock `Branding` fixtures missing `metaDescription`, `ogImageUrl`, `canonicalBaseUrl`, `faviconUrl`. Pre-exists on HEAD; unrelated to WhatsApp.

## Threat Model Adherence

- **T-mk4-01 / T-mk4-02 (mitigate):** Isolation remains closure-based — `makeQueryTools(input.companyId, input.supabase)` is unchanged and no tool schema gained a `company_id`/`companyId` field (query-tools tests still pass). The new prompt only reinforces single-tenant rules in natural language; even under prompt injection the tools physically cannot accept a tenant.
- **T-mk4-03 (accept):** Profile block contains only the owner's own company fields, read with `.eq('id', input.companyId)`, sent back to the owner's verified number.
- **T-mk4-04 (mitigate):** No secrets introduced in prompt or helper (CLAUDE.md secret-handling rule).

## Self-Check: PASSED
- FOUND: lib/whatsapp/split-reply.ts
- FOUND: tests/unit/whatsapp/split-reply.test.ts
- FOUND: lib/whatsapp/intent-router.ts (modified)
- FOUND commit c21144f (Task 1)
- FOUND commit 5149d1a (Task 2)
