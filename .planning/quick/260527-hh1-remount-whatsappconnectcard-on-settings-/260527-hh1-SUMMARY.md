---
phase: quick-260527-hh1
plan: "01"
type: summary
status: complete
date: 2026-05-27
requirements:
  - QUICK-WA-REMOUNT-01
---

# Summary — Remount WhatsAppConnectCard on /settings/integrations

## Problem
The `WhatsAppConnectCard` component was fully built but orphaned — not mounted on any
page. Phase 90 rewrote `/settings/integrations` to show only the MCP Server entry card,
dropping the WhatsApp card Phase 45 had placed there. Result: the WhatsApp connect UI was
unreachable on localhost ("not even showing").

## Changes

### `app/(app)/settings/integrations/page.tsx` (sync → async server component)
- Added imports: `createClient` (`@/lib/supabase/server`), `getActiveCompanyId`
  (`@/lib/queries/active-company`), and `WhatsAppConnectCard` + `type WhatsAppStatus`
  (`@/components/settings/whatsapp-connect-card`).
- Signature changed to `export default async function SettingsIntegrationsPage()`.
- Fetches the active company's `company_whatsapp` row scoped to `getActiveCompanyId()`
  (`.select('phone_number, phone_number_id, waba_id, status, delivery_format')` +
  `.eq('company_id', companyId)` + `.maybeSingle()`), mapping it to the card's `initial`
  prop shape (or `null` when no company / no row).
- Subhead copy changed to **`Connect outbound channels and AI assistants.`**
- Mounts `<WhatsAppConnectCard initial={initial} />` in a full-width `<section>` below the
  preserved MCP Server entry card grid.
- **MCP Server entry card preserved** (added alongside, not replaced).

### `tests/unit/whatsapp/integrations-page.test.tsx` (5 it.todo → 5 GREEN)
- All 5 scaffolds flipped to real passing `it(...)` cases (no `.todo`, no `.skip`).
- Asserts: H1 = "Integrations"; subhead = chosen copy; card mounts with `initial={null}`
  (no row) and with the populated `WhatsAppStatus` (row present); no `OpenRouter` placeholder.
- Mocks `next/link` (real one throws "reading 'config'" under jsdom), `WhatsAppConnectCard`,
  `<T>`, `getActiveCompanyId`, and `createClient`.
- Uses repo-convention native vitest assertions (`.textContent` / `.toBeTruthy()` /
  `.toBeNull()`) — the repo does NOT register `@testing-library/jest-dom` matchers.

## NOT modified
- `components/settings/whatsapp-connect-card.tsx` — unchanged, mounted as-is.

## Verification
- `npx vitest run tests/unit/whatsapp/integrations-page.test.tsx` → **5 passed (5)**.
- `npx tsc --noEmit` → **no type errors in touched files**. (Pre-existing, unrelated errors
  remain in `lib/mcp/*` and `app/api/mcp/route.ts` from a missing `@modelcontextprotocol/sdk`
  dependency — not introduced or touched by this fix.)

## Note for Phase 81-03
This quick fix already mounts the card via `getActiveCompanyId()` (not the pre-Phase-79
`user_id` join in the 81-03 draft) and preserves the MCP card. When 81-03 runs it should
adopt this resolution pattern and must not drop the MCP card. Chosen subhead copy:
`Connect outbound channels and AI assistants.`
