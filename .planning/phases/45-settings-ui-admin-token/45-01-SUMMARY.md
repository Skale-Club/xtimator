---
phase: 45-settings-ui-admin-token
plan: "01"
subsystem: whatsapp-settings
tags: [whatsapp, settings, integrations, connect-card, admin-token]
note: executed-in-worktree
dependency_graph:
  requires: [40-01, 44-01]
  provides: [whatsapp-connect-card, settings-integrations-page]
  affects: [components/settings/whatsapp-connect-card.tsx, app/(app)/settings/integrations/page.tsx]
key_files:
  created:
    - components/settings/whatsapp-connect-card.tsx
    - app/(app)/settings/integrations/page.tsx
    - lib/actions/whatsapp-settings.ts
  modified:
    - lib/platform-config.ts
    - app/admin/integrations/page.tsx
metrics:
  duration_minutes: 10
  tasks_completed: 1
  tasks_total: 1
  files_created: 3
  files_modified: 2
  completed_date: "2026-05-10"
---

# Phase 45 Plan 01: Settings UI + Admin Token Summary

**One-liner:** WhatsApp connect card in `/settings/integrations`, `meta_whatsapp` integration provider in admin panel, `connectWhatsApp`/`disconnectWhatsApp` server actions.

## What Was Built

### `lib/actions/whatsapp-settings.ts`
- `connectWhatsApp(phoneNumberId, accessToken)` — upserts `company_whatsapp` row (onConflict: company_id)
- `disconnectWhatsApp()` — deletes `company_whatsapp` row

### `components/settings/whatsapp-connect-card.tsx`
- Renders connected/disconnected states with optimistic UI via `useState`
- `delivery_format` select (share_link / formatted_text)
- Connect/disconnect buttons wired to server actions

### `app/(app)/settings/integrations/page.tsx`
- New settings sub-route with WhatsAppConnectCard

### Admin panel additions
- `meta_whatsapp` added to `IntegrationProvider` union + `PROVIDERS` array
- `testIntegrationKey` case: `graph.facebook.com/v21.0/me` with Bearer token

## Decisions

- `upserts on company_id conflict` — allows re-configuration without delete-then-insert
- `testIntegrationKey meta_whatsapp` hits graph.facebook.com/v21.0/me — returns token owner name on success
- Optimistic UI via local `useState(initial)` — connect/disconnect update immediately without router.refresh()

## Self-Check: PASSED

- Executed via git worktree — artifacts merged to main
