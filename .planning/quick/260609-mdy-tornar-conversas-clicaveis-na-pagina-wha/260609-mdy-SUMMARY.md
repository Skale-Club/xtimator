---
phase: quick-260609-mdy
plan: 01
subsystem: admin / whatsapp
tags: [admin, whatsapp, read-only, refactor]
requires:
  - lib/auth/admin-context.ts (requireAdmin)
  - lib/supabase/service.ts (requireServiceClient)
  - lib/whatsapp/inbox-types.ts (ConversationThread)
  - lib/whatsapp/conversations.ts (WaConversationRow, WaMessageRow)
  - lib/storage.ts (getServerStorage)
  - components/ui/sheet.tsx
provides:
  - loadAdminConversationThread (admin-guarded, cross-company, read-only thread loader)
  - shared MessageBubble/AudioMessage/formatTime/formatDuration module
  - AdminWhatsAppClient (clickable table + read-only thread Sheet)
affects:
  - app/admin/whatsapp/page.tsx (now a thin server component)
  - components/whatsapp/whatsapp-inbox.tsx (imports shared MessageBubble)
tech-stack:
  added: []
  patterns:
    - "Shared client render module imported by both user inbox and admin view"
    - "Serializable Row[] across server/client boundary (company_name merged, no Map passed)"
    - "Read-only admin action: requireAdmin gate ALONE, no company_id filter, no writes"
key-files:
  created:
    - components/whatsapp/message-bubble.tsx
    - lib/actions/admin-whatsapp.ts
    - app/admin/whatsapp/admin-whatsapp-client.tsx
  modified:
    - components/whatsapp/whatsapp-inbox.tsx
    - app/admin/whatsapp/page.tsx
decisions:
  - "Merge company_name into each Row server-side instead of passing a Map across the RSC boundary"
  - "30-day cutoff + limit(1000) on whatsapp_messages for the admin thread"
  - "requireAdmin is the sole authorization — admin views are intentionally cross-tenant"
metrics:
  duration: ~15m
  tasks: 3
  files: 5
  completed: 2026-06-09
---

# Phase quick-260609-mdy Plan 01: Clickable Admin WhatsApp Conversations Summary

Admin WhatsApp conversation rows are now clickable (mouse + keyboard) and open a strictly read-only right-side Sheet showing the full message thread (up to the last 30 days) via a new cross-company, admin-guarded server action — with the message-rendering code extracted into a shared module reused by the existing user inbox.

## What Was Built

**Task 1 — Shared MessageBubble module** (`components/whatsapp/message-bubble.tsx`)
Moved `formatTime`, `formatDuration`, `AudioMessage`, and `MessageBubble` verbatim out of `whatsapp-inbox.tsx` into a new `'use client'` module and exported all four. The hydration-safe `formatTime` (from prior commit 260609-hwd) was preserved exactly. `whatsapp-inbox.tsx` now imports `MessageBubble` + `formatTime` and drops the now-unused icon imports (`Play`, `Pause`, `Mic`, `CheckCheck`) and the unused `WaMessageRow` type import. Behavior-preserving — the user-facing `/whatsapp` inbox renders identically.

**Task 2 — Admin read-only thread action** (`lib/actions/admin-whatsapp.ts`)
`loadAdminConversationThread(conversationId)` is `'use server'`, calls `requireAdmin()` (cross-company gate, the only authorization) + `requireServiceClient()`, fetches the conversation by id alone (no `company_id` filter), then loads `whatsapp_messages` filtered to a 30-day `created_at` cutoff (`limit(1000)`), and enriches audio/image `media_url` into 1-hour signed URLs exactly like `fetchThread`. Pure read: no `markConversationRead`, no `revalidatePath`, no writes. The service role key stays server-side behind the `'use server'` + `requireAdmin` boundary (CLAUDE.md SEC requirement).

**Task 3 — Clickable table + Sheet + page refactor** (`app/admin/whatsapp/admin-whatsapp-client.tsx`, `app/admin/whatsapp/page.tsx`)
New `AdminWhatsAppClient` renders the same table markup (same columns, classes, `Card variant="glass"`, `Badge`, `<T>` wrappers) with each `<tr>` made clickable: `onClick`, `role="button"`, `tabIndex={0}`, `onKeyDown` (Enter/Space). Clicking calls `loadAdminConversationThread` and opens a read-only `Sheet` (`side="right"`) with a header (name/phone/company), loading spinner, `MessageBubble` thread, a "No messages in the last 30 days." empty state, and a read-only/30-day footer note. No reply box, no send-estimate, no `Textarea`, no mutating controls. `page.tsx` stays a server component (`force-dynamic`), builds the `companyNames` Map, merges `company_name` into a serializable `Row[]`, keeps the header/intro block, and renders `<AdminWhatsAppClient conversations={rows} />`. Unused `Card`/`Badge` imports were removed from `page.tsx`.

## Verification

- `npx tsc --noEmit` (with `--max-old-space-size=8192`): no errors in any of the five touched files. The only reported errors are pre-existing and unrelated (`tests/unit/notifications/account-emails.test.ts` — `Branding` type missing properties), documented as deferred items.
- `npx eslint` on all five touched files: **0 errors**. One pre-existing `@next/next/no-img-element` warning in `message-bubble.tsx` was carried over verbatim from the original inbox `<img>` (byte-for-byte preservation required by the plan); not a new issue.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Created files verified on disk:
- FOUND: components/whatsapp/message-bubble.tsx
- FOUND: lib/actions/admin-whatsapp.ts
- FOUND: app/admin/whatsapp/admin-whatsapp-client.tsx

Commits verified:
- FOUND: 67eda90 refactor(quick-260609-mdy): extract shared MessageBubble module
- FOUND: 65958cf feat(quick-260609-mdy): admin cross-company read-only thread action
- FOUND: 86c7418 feat(quick-260609-mdy): clickable admin conversations + read-only thread Sheet
