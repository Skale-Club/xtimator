---
phase: quick-260529-joo
plan: 01
subsystem: whatsapp
tags: [whatsapp, projects, deep-link, inbox]
requires:
  - lib/queries/active-company.ts (getActiveCompanyId)
  - lib/whatsapp/conversations.ts (toE164, WaConversationRow)
  - lib/supabase/service.ts (createServiceClient)
  - lib/actions/whatsapp-inbox.ts (loadConversation, openConversation path)
provides:
  - getProjectConversationLink(projectId) server query
  - ProjectWhatsAppCard client component
  - /whatsapp?c=<id> deep-link auto-open
affects:
  - app/(app)/projects/[id] Client tab
  - /whatsapp inbox mount behavior
tech-stack:
  added: []
  patterns:
    - "Service-client + company-scoped query mirroring listConversations()"
    - "Phone-only project↔conversation resolution (no migration)"
    - "useRef guard for once-per-mount deep-link useEffect"
key-files:
  created:
    - components/workspace/project-whatsapp-card.tsx
  modified:
    - lib/queries/whatsapp-inbox.ts
    - components/workspace/project-workspace.tsx
    - app/(app)/projects/[id]/page.tsx
    - components/whatsapp/whatsapp-inbox.tsx
decisions:
  - "Resolve project→conversation by client phone (toE164) only — no DB migration, no project_id column on whatsapp_conversations"
  - "Empty-state button switches to the project's Send tab via handleSelect('send') instead of creating a conversation"
  - "Deep-link does not gate on conversation presence in initialConversations — lets the existing loadConversation not-found toast handle invalid/unowned ids"
metrics:
  duration: ~15m
  completed: 2026-05-29
  tasks: 3
  files: 5
---

# Quick 260529-joo: Vincular projeto a conversa de WhatsApp Summary

Surfaced a WhatsApp conversation link on the project Client tab and added `/whatsapp?c=<id>` deep-link auto-open, resolving project → linked client phone → conversation by E.164 (no migration), closing the loop between project work and client messaging.

## What Was Built

**Task 1 — `getProjectConversationLink(projectId)` query** (`lib/queries/whatsapp-inbox.ts`, commit 57ea8db)
- New exported async query mirroring `listConversations()`: `getActiveCompanyId()` + `createServiceClient()`, bails to a null `ProjectConversationLink` if either is missing.
- Resolves: project (`client_id`, company-scoped) → client (`phone`, company-scoped) → `whatsapp_conversations` by `toE164(phone)` on `contact_phone`, company-scoped.
- Exported `ProjectConversationLink` type. Returns `conversationId: null` for every miss (no company, no client, no phone, no match). `contactName` falls back to `contact_phone` when `contact_name` is blank.

**Task 2 — Project WhatsApp card on Client tab** (commit afc1dcb)
- Created `components/workspace/project-whatsapp-card.tsx` (`'use client'`): renders a link card (`/whatsapp?c=<id>`, contact name, preview, short time) when a conversation exists, else the locked empty state ("Nenhuma conversa ainda — envie o estimate pelo WhatsApp para iniciar") with an "Enviar pelo WhatsApp" button.
- Wired `conversationLink` through the SSR chain: `page.tsx` (`await getProjectConversationLink(project.id)`) → `ProjectWorkspace` prop → rendered below `<ClientTab>` in the `client` tab. Empty-state button calls `handleSelect('send')` to switch to the project's Send tab. Estimate flows untouched.

**Task 3 — Deep-link auto-open** (`components/whatsapp/whatsapp-inbox.tsx`, commit a4b87ca)
- Added `useSearchParams`, a `didDeepLink` ref guard, and a `useEffect` reading `?c=` that calls the existing `openConversation(cid)` once on mount. Invalid/unowned ids fall through to the existing `loadConversation` not-found toast. No changes to send/reply/load logic.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit` clean across all three tasks for every touched file.
- The only `tsc` errors in this worktree are 6 pre-existing `@modelcontextprotocol/sdk` module-not-found errors (the MCP dependency is not installed in this worktree's `node_modules`). These are unrelated to this task and out of scope — logged below.

## Deferred Issues

- Pre-existing: `@modelcontextprotocol/sdk` is not installed in this worktree, producing 6 `TS2307` errors in `lib/mcp/*` and `app/api/mcp/route.ts`. Not introduced by this task; resolve via `npm install` in the worktree (the package is present in the main checkout).

## Self-Check: PASSED

- FOUND: lib/queries/whatsapp-inbox.ts
- FOUND: components/workspace/project-whatsapp-card.tsx
- FOUND: components/workspace/project-workspace.tsx
- FOUND: app/(app)/projects/[id]/page.tsx
- FOUND: components/whatsapp/whatsapp-inbox.tsx
- FOUND commit: 57ea8db (Task 1)
- FOUND commit: afc1dcb (Task 2)
- FOUND commit: a4b87ca (Task 3)
