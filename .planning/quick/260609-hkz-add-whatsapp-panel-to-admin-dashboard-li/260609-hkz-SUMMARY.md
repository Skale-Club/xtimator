---
phase: quick-260609-hkz
plan: 01
subsystem: admin
tags: [admin, whatsapp, i18n, multi-tenant, read-only]
requires:
  - whatsapp_conversations table (RLS deny-all)
  - companies table
  - requireAdmin (lib/auth/admin-context)
  - requireServiceClient (lib/supabase/service)
  - T component (components/i18n/t)
provides:
  - /admin/whatsapp cross-tenant WhatsApp conversation list (read-only)
  - WhatsApp admin sidebar nav entry
affects:
  - components/admin/admin-nav.tsx
tech-stack:
  added: []
  patterns:
    - app-code Map join for company-name resolution (no Supabase FK embed)
    - service-role client for deny-all RLS table reads
key-files:
  created:
    - app/admin/whatsapp/page.tsx
  modified:
    - components/admin/admin-nav.tsx
decisions:
  - "Two separate service-client queries joined in app code via Map (no FK embed) — whatsapp_conversations is RLS deny-all, service role bypasses it"
  - "last_message_at desc with nullsFirst:false; last_inbound_at used as activity fallback when last_message_at null"
metrics:
  tasks: 2
  files: 2
  duration: ~4m
  completed: 2026-06-09
requirements: [WAADMIN-01]
---

# Phase quick-260609-hkz Plan 01: Admin WhatsApp Panel Summary

Added a read-only platform-admin view at `/admin/whatsapp` that lists every phone number that has messaged Xtimator over WhatsApp across all tenant companies, with company-name resolution, unread badges, last-message preview, and last-activity timestamp — plus a sidebar nav entry to reach it.

## What Was Built

- **`app/admin/whatsapp/page.tsx`** (new, 127 lines): `force-dynamic` Server Component. Calls `requireAdmin()` (super-admin gate → `notFound()` otherwise), then `requireServiceClient()`. Runs two service-role queries — `whatsapp_conversations` (8 columns, ordered by `last_message_at` desc nullsFirst:false, limit 500) and `companies` (`id, name`) built into a `Map` for app-code name resolution. Renders a `Card variant="glass"` table with 6 columns (Phone, Name, Company, Unread, Last message, Last activity), a summary line, and empty states. Every user-facing string flows through `<T>`.
- **`components/admin/admin-nav.tsx`** (modified): imported `MessageCircle`, added `{ href: '/admin/whatsapp', label: 'WhatsApp', Icon: MessageCircle }` to `NAV_ITEMS` after Companies. Existing `isActive` prefix-match and `t(label)` translation handle it automatically.

## Decisions Made

- **App-code Map join, not FK embed:** `whatsapp_conversations` is RLS deny-all; the service client bypasses RLS, and resolving `company_id → name` from a separate `companies` query avoids relying on PostgREST embed semantics across the trust boundary.
- **Activity fallback:** `last_message_at ?? last_inbound_at` for the "Last activity" cell, rendering `—` when both are null.

## Deviations from Plan

None — plan executed exactly as written.

## Deferred Issues

Pre-existing `tsc` errors in `tests/unit/notifications/account-emails.test.ts` (TS2345, lines 84/172/219 — `Branding` fixture missing `metaDescription, ogImageUrl, canonicalBaseUrl, faviconUrl`) are unrelated to this task and out of scope. No errors originate from the two files changed here. Logged in `deferred-items.md`.

## Verification

- `npx tsc --noEmit` produces zero errors for `app/admin/whatsapp/page.tsx` and `components/admin/admin-nav.tsx` (only the unrelated pre-existing test-file errors remain).
- Read-only: no row links, no detail page, no pagination, no mutations, no client components, no schema/RLS/webhook changes.

## Commits

- `1b04127` feat(quick-260609-hkz): add /admin/whatsapp cross-tenant conversation list
- `3d111fd` feat(quick-260609-hkz): add WhatsApp entry to admin sidebar nav

## Self-Check: PASSED

- FOUND: app/admin/whatsapp/page.tsx
- FOUND: commit 1b04127
- FOUND: commit 3d111fd
