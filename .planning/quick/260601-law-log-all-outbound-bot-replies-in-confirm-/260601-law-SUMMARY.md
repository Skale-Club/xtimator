---
phase: quick-260601-law
plan: 01
subsystem: whatsapp
tags: [whatsapp, inbox, outbound-logging, inngest]
key-decisions:
  - "fire-and-forget (.catch(() => undefined)) used in confirm.ts and handler.ts webhook hot paths; awaited inside Inngest step.run so DB write completes before step returns"
  - "companyId threaded into handleCancel, handleEditField, resendSummary — was missing, needed for logOutboundMessage"
key-files:
  modified:
    - lib/whatsapp/confirm.ts
    - lib/inngest/functions/whatsapp-process.ts
    - lib/whatsapp/handler.ts
metrics:
  duration: "~15min"
  completed: "2026-06-01T18:31:20Z"
  tasks: 2
  files: 3
---

# Quick Task 260601-law: Log All Outbound Bot Replies in WhatsApp Inbox Panel

**One-liner:** Added logOutboundMessage calls after every sendWhatsAppMessage to ownerPhone across confirm.ts (13 sites), whatsapp-process.ts (3 awaited steps), and handler.ts (rejection reply).

## What Was Done

### Task 1 — confirm.ts (commit 0dc2dfc)

- Added `import { logOutboundMessage } from '@/lib/whatsapp/conversations'`
- Added `companyId: string` parameter to `handleCancel`, `handleEditField`, and `resendSummary` (was missing — needed by logOutboundMessage)
- Updated all 4 call sites in `processConfirmationReply` to pass companyId
- Added fire-and-forget `logOutboundMessage(...).catch(() => undefined)` after every `sendWhatsAppMessage(ownerPhone, ...)` call:
  - `handleEditField`: no-estimate error + edit-failed error
  - `resendSummary`: the body built by `buildConfirmationMessage`
  - `handleSetClient`: no-project error + save-failed error + link-failed error + client-set success
  - `handleRegenerate`: no-project error + regen-failed error
  - `handleSend`: two "Could not find your estimate" errors + final ownerMessage
  - `processConfirmationReply` help branch: `EDIT_HELP_MESSAGE`

### Task 2 — whatsapp-process.ts + handler.ts (commit 2600c29)

**whatsapp-process.ts:**
- Changed all 3 fire-and-forget `logOutboundMessage(...).catch(() => undefined)` to `await logOutboundMessage(...).catch(() => undefined)` so the DB write completes before each Inngest `step.run` returns. Steps: `send-audio-error`, `ask-details`, `confirm-and-session`.

**handler.ts:**
- Added `import { logOutboundMessage } from '@/lib/whatsapp/conversations'`
- Added fire-and-forget `logOutboundMessage` after the non-text rejection reply in `processSingleMessageWithSession` (the else branch that sends "Reply *send* to deliver...")

## Commits

| Commit | Message |
|--------|---------|
| 0dc2dfc | feat(quick-260601-law): log all outbound bot replies in confirm.ts |
| 2600c29 | fix(quick-260601-law): await logOutboundMessage in Inngest steps; log rejection reply in handler.ts |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All logOutboundMessage calls write real data to whatsapp_messages via the service client.

## Threat Flags

No new network endpoints, auth paths, or schema changes introduced. logOutboundMessage uses the same service-role client already established for whatsapp_messages writes (RLS deny-all, service role bypasses). Body fields contain non-sensitive operational bot messages only (T-law-01 accepted).

## Self-Check: PASSED

- FOUND: lib/whatsapp/confirm.ts
- FOUND: lib/inngest/functions/whatsapp-process.ts
- FOUND: lib/whatsapp/handler.ts
- FOUND: commit 0dc2dfc
- FOUND: commit 2600c29
