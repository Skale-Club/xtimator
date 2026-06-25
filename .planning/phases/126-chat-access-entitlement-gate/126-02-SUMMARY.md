---
phase: 126-chat-access-entitlement-gate
plan: 02
subsystem: entitlements / chat-ui
tags: [entitlements, chat, CHATMETER-02, page-gate, scope-fence, owner-only]
requires:
  - lib/entitlements.ts (chatEnabled flag — Plan 126-01)
  - app/(app)/chat/[[...id]]/page.tsx (the chat surface — Phase 125)
  - app/api/chat/route.ts (the 403 chat_not_on_plan boundary — Plan 126-01)
provides:
  - ChatUpgradePrompt — inline /chat upgrade affordance (CTA → /settings/billing)
  - page-level chatEnabled gate on the chat page (own tier read, not getActiveCompany)
  - chat-access-scope static fence proving chat is never customer-facing
affects:
  - none — this is the FINAL plan of phase 126 and milestone v4.9
tech-stack:
  added: []
  patterns:
    - server-side entitlement-boolean page gate (projects page whatsappSendEnabled precedent)
    - own companies.tier read (active-company helper omits tier — pitfall avoided)
    - static-source readdir scope fence (chat-ui-scope.test.ts model)
key-files:
  created:
    - components/chat/chat-upgrade-prompt.tsx
    - tests/unit/chat/chat-page-gate.test.tsx
    - tests/unit/chat/chat-access-scope.test.ts
  modified:
    - app/(app)/chat/[[...id]]/page.tsx
decisions:
  - "Page gate does its OWN companies.tier read (getActiveCompanyId + service-client maybeSingle) — getActiveCompany omits tier and would silently fall back to free, blocking paying users"
  - "ChatUpgradePrompt is the PRIMARY 403 affordance — the global UpgradeModal only intercepts 402, not the route's 403"
  - "Page-gate test uses the REAL lib/entitlements so the gate reads actual chatEnabled values; everything else mocked"
metrics:
  duration: ~4 min
  completed: 2026-06-25
  tasks: 2
  files: 4
---

# Phase 126 Plan 02: Chat Entitlement (page upgrade prompt + owner-only static fence) Summary

Closed the CHATMETER-02 UX + verification half: a page-level entitlement gate on the chat surface that renders an inline `ChatUpgradePrompt` (CTA → `/settings/billing`) for a non-entitled owner instead of a dead chat, plus a static structural fence proving the chat is never reachable by an end customer. This is the FINAL plan of Phase 126 and milestone v4.9 — the route 403 from Plan 01 is the security boundary; this is the conversion-preserving prompt + the proof that no public surface mounts the chat.

## What Was Built

### Task 1 — ChatUpgradePrompt + page gate (commit c6aa5a45)
- **`components/chat/chat-upgrade-prompt.tsx`** — a self-contained `'use client'` component mirroring the ChatWorkspace shell (same `h-[calc(100vh-4rem)]` + MessageSquare header) so it visually fits the chat surface. A centered card with a Sparkles glyph, copy via `useTranslation()`, and a primary `<Button asChild><Link href="/settings/billing"></Button>` — the literal `/settings/billing` matches the route 403 `upgradeUrl`. No props.
- **`app/(app)/chat/[[...id]]/page.tsx`** — added the gate after `userId` resolution and BEFORE any conversation queries: `getActiveCompanyId()` → a direct `requireServiceClient().from('companies').select('tier').eq('id', companyId!).maybeSingle()` read → `getEntitlements(tier).chatEnabled`; when false, `return <ChatUpgradePrompt />`. The existing ChatWorkspace render path below the gate is byte-unchanged. **Pitfall avoided:** `getActiveCompany()` does NOT select `tier`, so the page does its OWN tier read (the app/(app)/layout.tsx pattern) — otherwise paying users would be wrongly blocked.

### Task 2 — page-gate test + owner-only scope fence (commit bf9acfe6)
- **`tests/unit/chat/chat-page-gate.test.tsx`** — renders the awaited async RSC. Mocks auth (`getAuthClaims`→`user-1`), `getActiveCompanyId`→`company-1`, a chainable `requireServiceClient` whose `.maybeSingle()` resolves a per-test `tierRow`, the chat queries, the history mapper, and `ChatWorkspace`→`WORKSPACE_SENTINEL`. Uses the **REAL** `@/lib/entitlements`. Three cases: free→prompt (`/settings/billing` + `Upgrade your plan`, no sentinel), pro→workspace (sentinel, no `/settings/billing`), null-row→fallback-free→prompt.
- **`tests/unit/chat/chat-access-scope.test.ts`** — pure `readFileSync`/`readdirSync` (no DB/secrets), modeled on `chat-ui-scope.test.ts`. Asserts: (1) the chat page references `ChatWorkspace`; (2) NONE of the 11 public/non-(app) route groups (`(auth)`, `(capture)`, `admin`, `blog`, `demo`, `estimate`, `oauth`, `offline`, `onboarding`, `privacy-policy`, `terms-of-service`) reference `ChatWorkspace` / `@/components/chat` / `/api/chat`; (3) `app/api/chat/route.ts` contains BOTH `getClaims` (owner auth) AND `chat_not_on_plan` (the tier gate).

## Verification

- `npx vitest run tests/unit/chat/chat-page-gate.test.tsx tests/unit/chat/chat-access-scope.test.ts` — 2 files / 6 tests green (free→prompt, pro→workspace, fallback, + 3 structural assertions).
- `npx vitest run tests/unit/chat tests/unit/entitlements.test.ts` — 17 files / 118 tests green; the Phase-125 `chat-ui-scope.test.ts` still passes (no regression).
- **FULL `npx vitest run`** — **335 files passed | 3 skipped, 2335 passed | 2 skipped | 33 todo.** The known parallel-only `mcp-route-contract.test.ts` flake did NOT surface.
- `npx tsc --noEmit` — no new errors in the two touched source files.
- grep confirms: `getEntitlements(tier).chatEnabled` (1), `select('tier')` (1), `ChatUpgradePrompt` (2), `getActiveCompany(` (0 — uses `getActiveCompanyId` + a direct tier read, never the tier-omitting helper), `/settings/billing` + `useTranslation` present in the prompt.

## Deviations from Plan

None - plan executed exactly as written.

Note on TDD ordering: Task 2's tests assert Task 1's already-landed behavior (the plan sequences the gate implementation in Task 1, then the tests verifying it in Task 2). Both test files were authored to be contract-bearing — the page-gate test would fail without the Task-1 gate (it asserts the prompt branch vs the workspace branch), and the scope test would fail if any public route group mounted the chat. They passed GREEN on first run because Task 1 satisfied the contract; the full suite + the per-file run confirm they exercise real behavior, not vacuous assertions.

## Known Stubs

None. No hardcoded empty values, placeholders, or unwired data sources. The gate reads the real `tier` from the companies row through `getEntitlements`; `ChatUpgradePrompt` is fully wired with a working `/settings/billing` link.

## Self-Check: PASSED

- FOUND: components/chat/chat-upgrade-prompt.tsx
- FOUND: app/(app)/chat/[[...id]]/page.tsx (gate added)
- FOUND: tests/unit/chat/chat-page-gate.test.tsx
- FOUND: tests/unit/chat/chat-access-scope.test.ts
- FOUND commit: c6aa5a45 (Task 1)
- FOUND commit: bf9acfe6 (Task 2)
