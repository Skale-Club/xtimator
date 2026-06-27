---
phase: quick
plan: 260626-tut
type: execute
wave: 1
depends_on: []
files_modified:
  - components/app-shell/nav-items.ts
  - app/(app)/chat/[[...id]]/page.tsx
  - lib/notifications/event-types.ts
  - lib/notifications/queries.ts
  - components/notifications/use-notifications.ts
  - app/(app)/notifications/page.tsx
  - tests/unit/chat/chat-page-gate.test.tsx
  - tests/unit/chat/chat-access-scope.test.ts
  - tests/unit/notifications/notification-bell.test.tsx
  - tests/unit/notifications/queries.test.ts
autonomous: true
requirements: [LEGACY-HIDE-01, NOTIF-HIDE-01]
must_haves:
  truths:
    - "Chat is absent from tenant navigation"
    - "Direct /chat access redirects to /dashboard without loading chat data"
    - "Dropped notification events, including whatsapp.inbound, never appear in the bell, unread badge, or notifications page"
    - "Database pagination excludes dropped events before applying the page limit"
    - "Realtime dropped-event inserts are ignored"
  artifacts:
    - path: "components/app-shell/nav-items.ts"
      provides: "Tenant navigation without Chat"
    - path: "app/(app)/chat/[[...id]]/page.tsx"
      provides: "Direct-access redirect for dormant chat surface"
    - path: "lib/notifications/event-types.ts"
      provides: "Canonical dropped-event visibility helpers"
    - path: "lib/notifications/queries.ts"
      provides: "Server-side dropped-event exclusion before pagination"
  key_links:
    - from: "lib/notifications/event-types.ts"
      to: "lib/notifications/queries.ts"
      via: "DROPPED_EVENT_TYPES"
      pattern: "DROPPED_EVENT_TYPES"
    - from: "lib/notifications/event-types.ts"
      to: "components/notifications/use-notifications.ts"
      via: "isVisibleNotificationEventType"
      pattern: "isVisibleNotificationEventType"
---

<objective>
Hide the legacy owner-facing in-app Chat and remove stale WhatsApp/dropped notifications from all tenant notification surfaces.

The implementation preserves the dormant chat backend for possible future use, but removes product navigation and redirects direct UI access. Notification filtering is enforced server-side before pagination and repeated client-side for initial/realtime defense.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Hide the legacy Chat surface</name>
  <files>components/app-shell/nav-items.ts, app/(app)/chat/[[...id]]/page.tsx, tests/unit/chat/chat-page-gate.test.tsx, tests/unit/chat/chat-access-scope.test.ts</files>
  <action>
Remove the Chat nav item and unused MessageSquare import. Replace the owner chat page with a server redirect to `/dashboard`, ensuring no chat queries or components load. Update the existing chat route/scope tests to lock the dormant behavior and absence from nav.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/chat/chat-page-gate.test.tsx tests/unit/chat/chat-access-scope.test.ts</automated>
  </verify>
  <done>Chat is not discoverable in tenant navigation and direct access exits to Dashboard.</done>
</task>

<task type="auto">
  <name>Task 2: Exclude dropped WhatsApp notifications everywhere</name>
  <files>lib/notifications/event-types.ts, lib/notifications/queries.ts, components/notifications/use-notifications.ts, app/(app)/notifications/page.tsx, tests/unit/notifications/notification-bell.test.tsx, tests/unit/notifications/queries.test.ts</files>
  <action>
Export a canonical dropped-event list and visibility predicate. Apply the list to the database query before pagination, filter initial and realtime bell items defensively, and reject `_dropped` as a public category parameter. Add focused regression tests for server query wiring, initial badge/list filtering, and realtime filtering.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/notifications/event-types.test.ts tests/unit/notifications/queries.test.ts tests/unit/notifications/notification-bell.test.tsx</automated>
  </verify>
  <done>Old and new whatsapp.inbound rows cannot appear or contribute to unread counts; other notifications remain intact.</done>
</task>

</tasks>

<verification>
Run focused Chat + Notifications tests, ESLint on changed files, and `npm run build`.
</verification>

<success_criteria>
- Chat is absent from tenant navigation
- `/chat` redirects to `/dashboard`
- WhatsApp/dropped rows are excluded before pagination and in client defenses
- Useful estimate/billing/system notifications remain visible
- Focused tests, lint, and production build pass
</success_criteria>

<output>
After completion, create `.planning/quick/260626-tut-hide-legacy-in-app-chat-and-dropped-what/260626-tut-SUMMARY.md`.
</output>
