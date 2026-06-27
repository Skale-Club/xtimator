---
phase: quick
plan: 260626-tut
subsystem: app-shell-notifications
tags: [chat, notifications, whatsapp, product-surface]
dependency_graph:
  requires: []
  provides: [LEGACY-HIDE-01, NOTIF-HIDE-01]
  affects: [tenant-navigation, chat-route, notification-bell, notifications-page]
tech_stack:
  added: []
  patterns: [server-boundary filtering, client realtime defense, dormant-route redirect]
key_files:
  modified:
    - components/app-shell/nav-items.ts
    - app/(app)/chat/[[...id]]/page.tsx
    - lib/notifications/event-types.ts
    - lib/notifications/queries.ts
    - components/notifications/use-notifications.ts
decisions:
  - "Keep the dormant chat backend owner-authenticated and entitlement-gated, but remove its product surface."
  - "Redirect stale /chat bookmarks to /dashboard instead of exposing the legacy upsell or returning a dead 404."
  - "Hide every event categorized as _dropped, not only whatsapp.inbound, matching the existing notification catalog contract."
metrics:
  completed: "2026-06-26"
  tasks_completed: 2
  files_modified: 11
---

# Quick Task 260626-tut: Hide Legacy Chat and Dropped Notifications Summary

**One-liner:** Removed Chat from tenant navigation, redirected direct Chat access to Dashboard, and excluded stale WhatsApp/dropped notifications from server pagination, bell state, unread counts, and Realtime inserts.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Hide the legacy Chat surface | 060c5cec | nav-items.ts, chat page, chat route tests |
| 2 | Exclude dropped WhatsApp notifications | 060c5cec | event-types.ts, queries.ts, use-notifications.ts, notification tests |

## What Was Done

- Removed the `/chat` entry and `MessageSquare` import from tenant navigation.
- Replaced the owner-facing Chat page with a server redirect to `/dashboard`; it no longer loads company tier, conversations, history, or Chat components.
- Kept `/api/chat` dormant but protected by its existing authentication and entitlement gates.
- Added canonical `DROPPED_EVENT_TYPES` and `isVisibleNotificationEventType()` definitions.
- Applied dropped-event exclusions to the database query before paginated results resolve.
- Filtered initial bell payloads and ignored dropped Realtime inserts, so old WhatsApp rows no longer appear or inflate the unread badge.
- Prevented `_dropped` from being accepted as a public notifications-page category.

## Verification Results

```text
npx vitest run tests/unit/chat tests/unit/notifications
Test Files 31 passed; Tests 207 passed

npx eslint <all changed source and focused test files>
Exit 0

npm run build
Compiled successfully; TypeScript finished; 74/74 static pages generated
```

## Scope Note

Existing WhatsApp notification rows remain stored for audit/history purposes but are no longer returned or displayed. No destructive database cleanup was performed.

## Self-Check: PASSED

- [x] Source commit exists: `060c5cec`
- [x] Chat absent from navigation
- [x] `/chat` redirects without importing Chat UI/data dependencies
- [x] Initial and Realtime WhatsApp notification paths covered
- [x] Server pagination exclusion covered
- [x] Unrelated landing-page changes were not staged or committed
