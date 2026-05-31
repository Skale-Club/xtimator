---
phase: quick-260529-lc0
plan: 01
subsystem: whatsapp-inbound
tags: [whatsapp, inngest, estimate, i18n]
requires:
  - generateEstimateForProject (lib/services/generate-estimate.ts)
  - whatsapp_sessions table
provides:
  - "awaiting_details session state + ask-for-more-details inbound flow"
affects:
  - lib/inngest/functions/whatsapp-process.ts
  - lib/whatsapp/handler.ts
tech-stack:
  added: []
  patterns:
    - "WhatsApp-only vagueness detection (does NOT touch shared generate-estimate)"
    - "Idempotent CHECK-constraint swap via DO $do$ guard"
key-files:
  created:
    - supabase/migrations/20260529000002_whatsapp_sessions_awaiting_details.sql
    - lib/whatsapp/ask-details.ts
    - tests/unit/whatsapp/ask-details.test.ts
  modified:
    - lib/inngest/functions/whatsapp-process.ts
    - lib/whatsapp/handler.ts
    - tests/unit/inngest/whatsapp-process-job.test.ts
    - tests/unit/whatsapp/handler.test.ts
decisions:
  - "Entitlement gate NOT re-checked on awaiting_details re-dispatch — session only exists if first processing (which checked entitlement) passed; same conversation continues"
  - "Ask-details loop has no hard limit for now (CONTEXT.md decision 3 / Claude's Discretion) — re-evaluation runs after each regeneration until priceable"
  - "Vagueness reversion uses cascade delete on estimates (same pattern as confirm.ts handleRegenerate), then project → draft / total 0"
metrics:
  duration: ~5m
  tasks: 4
  files: 7
  completed: 2026-05-29
---

# Quick Task 260529-lc0: WhatsApp — pedir detalhes quando texto vago - Summary

Vague WhatsApp inbound (estimate total <= 0 OR no line items) now makes the bot ask the owner for more details in the resolved language (pt/en/es), delete the $0 estimate, revert the project to draft, and open an `awaiting_details` session that routes the next message back into the SAME project — instead of generating/sending a useless $0 estimate + send/cancel prompt.

## What Was Built

- **Task 1 — Migration** (`20260529000002_whatsapp_sessions_awaiting_details.sql`): idempotent `DO $do$` block that drops the inline-auto-named `whatsapp_sessions_state_check` and re-adds it including `'awaiting_details'`.
- **Task 2 — `lib/whatsapp/ask-details.ts`** (TDD, 12 tests): `isVagueEstimate` (total<=0 OR no items, null-safe), `buildAskDetailsMessage` (localized pt/en/es, each mentioning the 4 examples: service type, area, materials, deadline; unknown → EN), `revertVagueEstimate` (cascade-delete estimate when id present + project → draft/total 0).
- **Task 3 — `whatsAppProcessJob` branch** (TDD source-level asserts): after `generate-estimate`, an `evaluate-vagueness` step reads `total` + `estimate_sections(items)`. If vague, an `ask-details` step reverts, inserts an `awaiting_details` session (draft_estimate_id=null, same TTL), sends the localized message, and returns WITHOUT `confirm-and-session`. Non-vague path unchanged.
- **Task 4 — Handler routing** (`lib/whatsapp/handler.ts`): both `processInboundWithDebounce` and `processInboundMessage` now branch on `awaiting_details` (after the `awaiting_confirm` branch), re-dispatching `EVENT_WHATSAPP_PROCESS` with the existing `draft_project_id` via the new `dispatchToExistingProject` helper — no new project, no debounce, wamid `batchKey` idempotency preserved.

## Verification

- `npx vitest run tests/unit/whatsapp/ask-details.test.ts tests/unit/inngest/whatsapp-process-job.test.ts tests/unit/whatsapp/handler.test.ts` → **23/23 pass**.
- `npx tsc --noEmit` → no errors in touched files (pre-existing unrelated errors remain in `lib/mcp/*` — MCP SDK module resolution, out of scope).
- No secrets in diff (CLAUDE.md secret handling respected).

## Commits

- `b176b65` chore(quick-260529-lc0): migration allow whatsapp_sessions.state awaiting_details
- `354c83f` feat(quick-260529-lc0): ask-details helpers (vagueness, localized prompt, revert)
- `99227e3` feat(quick-260529-lc0): ask-details branch in whatsAppProcessJob
- `a98f0f9` feat(quick-260529-lc0): route awaiting_details to same project

## Deviations from Plan

None — plan executed exactly as written.

## Notes / Decisions

- **Entitlement gate not re-checked** on the `awaiting_details` re-dispatch: the session only exists because the first processing pass (which checked entitlement) succeeded, and the owner is continuing the same conversation. Documented per plan instruction.
- **Loop has no hard limit** for now (CONTEXT.md decision 3 / Claude's Discretion). Vagueness is re-evaluated after every regeneration, so the bot keeps asking for details until the estimate becomes priceable. A loop cap could be added later if owners get stuck in a loop with persistently vague input.

## IMPORTANT — Migration NOT applied to live DB

The MCP Supabase **Xtimator** tools (`apply_migration` / `execute_sql`) were **NOT reachable** from this executor's tool context (only the MCP server *instructions* were surfaced, not the callable tools; `ToolSearch` was also unavailable). Per the plan's mcp_note fallback, the migration file was created and committed for parity with `bunx supabase db push`, but it has **NOT been applied to the live Xtimator database**.

**Action required by orchestrator:** apply `supabase/migrations/20260529000002_whatsapp_sessions_awaiting_details.sql` to the live Xtimator project (via MCP `apply_migration` or `db push`). Until applied, inserting a `whatsapp_sessions` row with `state='awaiting_details'` (the Task 3 `ask-details` step) will violate the existing CHECK constraint and fail.

## Self-Check: PASSED

- supabase/migrations/20260529000002_whatsapp_sessions_awaiting_details.sql — FOUND
- lib/whatsapp/ask-details.ts — FOUND
- tests/unit/whatsapp/ask-details.test.ts — FOUND
- Commits b176b65, 354c83f, 99227e3, a98f0f9 — FOUND
