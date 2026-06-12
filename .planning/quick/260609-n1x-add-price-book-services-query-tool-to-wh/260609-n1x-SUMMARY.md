---
phase: quick-260609-n1x
plan: 01
subsystem: whatsapp-query-agent
tags: [whatsapp, langchain, price-book, multi-tenant, read-only-tools]
requires:
  - lib/whatsapp/query-tools.ts (makeQueryTools closure pattern)
  - lib/money/currency.ts (formatMoney)
  - company_price_book table
provides:
  - list_services QUERY tool (price-book listing)
  - find_service_by_name QUERY tool (fuzzy price-book lookup)
affects:
  - WhatsApp QUERY agent (dispatchQuery auto-registers the two new tools)
tech-stack:
  added: []
  patterns:
    - closure-companyId tenant isolation (no company_id in tool schema)
    - typed row alias + cast (no any) under TS strict
key-files:
  created: []
  modified:
    - lib/whatsapp/query-tools.ts
    - tests/unit/whatsapp/query-tools.test.ts
decisions:
  - Truncation note worded "...and more services available." (CAP+1 fetch) to avoid implying an exact extra count
metrics:
  duration: ~10m
  completed: 2026-06-09
  tasks: 2
  files: 2
---

# Phase quick-260609-n1x Plan 01: Add Price-Book Services Query Tool to WhatsApp Summary

Two read-only, company-scoped LangChain tools (`list_services`, `find_service_by_name`) added to the WhatsApp QUERY agent so it can ground answers about offered services and pricing in `company_price_book`, auto-registered via the `makeQueryTools` return array.

## What Was Built

- **`list_services`** (schema `z.object({})`): queries `company_price_book` filtered by the closure `companyId`, ordered by name, `limit(CAP+1)` where `CAP=25`. Returns a bullet list of `- {name}: {formatMoney(unit_price, currency_code)}[ per {unit}]`. Empty → `"No services on file yet."`. If more than the cap exist, appends `"...and more services available."`.
- **`find_service_by_name`** (schema `z.object({ name })`): fuzzy `.ilike('name', '%name%')` lookup, `.eq('company_id', companyId)`, limit 5. No match → `No service found matching "{name}".`.
- Both append to the `makeQueryTools` return array (now 6 tools). The `dispatchQuery` system prompt in `intent-router.ts` was left untouched (it already lists "services, pricing" and tools are auto-registered).
- A new `PriceBookRow` typed alias was added (no `any`); rows cast via `(data as PriceBookRow[] | null) ?? []`.

## Tests

`tests/unit/whatsapp/query-tools.test.ts` extended:
- Test 1a tightened to `toBeGreaterThanOrEqual(6)`; still asserts no tool schema (including the two new ones) accepts `company_id`/`companyid`.
- Test 1b adds a `company_price_book` result row, invokes both new tools, and adds `company_price_book` to `tenantTables` so its captured queries are asserted to carry `company_id === 'company-SECRET'`.
- Test 4 (new): `list_services` formats the price/name and returns a friendly string on empty; `find_service_by_name` returns a no-match string.

All 5 tests pass.

## Verification Results

- `npx tsc --noEmit`: no errors in `query-tools.ts` (confirmed via filtered output). Three pre-existing errors in `tests/unit/notifications/account-emails.test.ts` are unrelated and pre-exist on clean `main` (verified by `git stash`) — see `deferred-items.md`.
- `npx vitest run tests/unit/whatsapp/query-tools.test.ts`: **5 passed (5)**.

## Threat Model Adherence

- **T-n1x-01 (cross-tenant disclosure):** mitigated — `companyId` remains a closure param; both queries chain `.eq('company_id', companyId)`; neither schema exposes a tenant field. Test 1a + 1b enforce the invariant.
- **T-n1x-02 (tampering):** accepted — tools are `.select(...)`-only, no write/RPC paths added.
- **T-n1x-03 (internal ID disclosure):** mitigated — output exposes only name, formatted price, and unit; never `id`/`folder_id`/`company_id`.

## Deviations from Plan

None - plan executed exactly as written. (Pre-existing unrelated tsc errors logged to `deferred-items.md`, not fixed, per scope boundary.)

## Self-Check: PASSED

- FOUND: lib/whatsapp/query-tools.ts (modified)
- FOUND: tests/unit/whatsapp/query-tools.test.ts (modified)
- FOUND commit: 34b67c6 (feat — Task 1)
- FOUND commit: d29b6db (test — Task 2)
