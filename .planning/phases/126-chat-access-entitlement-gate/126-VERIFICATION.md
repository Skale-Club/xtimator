---
phase: 126-chat-access-entitlement-gate
verified: 2026-06-25T06:00:00Z
status: passed
score: 8/8 must-haves verified
---

# Phase 126: Chat Access / Entitlement Gate Verification Report

**Phase Goal:** The chat is owner-only (authenticated, tenant-scoped) and gated by tier entitlement (a Pro/Business feature); never reachable by an end customer. The backend route + UI page authenticate the owner (124/125); this phase adds the TIER entitlement check + the never-customer-facing verification.
**Verified:** 2026-06-25T06:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | chatEnabled is false on free, true on trial/pro/business | ✓ VERIFIED | `lib/entitlements.ts` line 35 (type field) + free:50 false, trial:63 true, pro:76 true, business:89 true. `as const satisfies Record<TierName, Entitlements>` (line 91) enforces completeness. |
| 2 | POST /api/chat returns 403 chat_not_on_plan for a free-tier company | ✓ VERIFIED | `route.ts` lines 84-90 return 403 `{ error:'chat_not_on_plan', upgradeUrl:'/settings/billing' }`. Test `route.test.ts:153-167` asserts status 403 + body. |
| 3 | POST /api/chat streams (200) for a pro/business company | ✓ VERIFIED | Test `route.test.ts:169-180` asserts 200 + `resolveChatModel` called with trusted companyId. |
| 4 | The route 403 gate runs BEFORE resolveChatModel/buildChatTools — no model build for an unentitled tenant | ✓ VERIFIED | Gate at `route.ts:84-90` precedes `req.json()` (94), `resolveChatModel` (99), `buildChatTools` (100), `streamText` (103). Test `route.test.ts:165-166` asserts neither mock called for free tier. |
| 5 | A free-tier owner who opens /chat sees an upgrade prompt with a CTA to /settings/billing | ✓ VERIFIED | `page.tsx:55-57` returns `<ChatUpgradePrompt/>` when !chatEnabled; prompt CTA `Link href="/settings/billing"` (`chat-upgrade-prompt.tsx:46`). Test `chat-page-gate.test.tsx:71-79`. |
| 6 | A pro/business owner who opens /chat sees the ChatWorkspace unchanged | ✓ VERIFIED | `page.tsx:65-71` renders ChatWorkspace below the gate. Test `chat-page-gate.test.tsx:81-88` (sentinel reached). |
| 7 | The chat page reads its OWN tier (NOT getActiveCompany, which omits tier) | ✓ VERIFIED | `page.tsx:48-54` uses `getActiveCompanyId()` + direct `requireServiceClient().from('companies').select('tier')`. `grep getActiveCompany(` in page = 0 hits. |
| 8 | Chat is referenced ONLY under app/(app)/chat + app/api/chat — never customer-facing | ✓ VERIFIED | Static test `chat-access-scope.test.ts:69-82` asserts none of 11 public/non-(app) route groups reference ChatWorkspace / @/components/chat / /api/chat; passes green. |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/entitlements.ts` | chatEnabled on type + 4 tiers | ✓ VERIFIED | 5 occurrences (1 type + 4 literals); free=false, trial/pro/business=true. |
| `app/api/chat/route.ts` | 403 security-boundary gate before model resolution | ✓ VERIFIED | `chat_not_on_plan` + `getEntitlements(tier).chatEnabled` present; `default_estimate_language, tier` added to select; gate precedes all model work. |
| `components/chat/chat-upgrade-prompt.tsx` | inline upgrade affordance | ✓ VERIFIED | `'use client'`, useTranslation copy, `/settings/billing` Link CTA; imported + rendered by page. |
| `app/(app)/chat/[[...id]]/page.tsx` | page-level entitlement gate (own tier read) | ✓ VERIFIED | Own tier read, getEntitlements(tier).chatEnabled gate, ChatUpgradePrompt branch; getActiveCompany not used. |
| `tests/unit/chat/chat-access-scope.test.ts` | static never-customer-facing fence | ✓ VERIFIED | References ChatWorkspace; 3 structural assertions; green. |
| `tests/unit/chat/chat-page-gate.test.tsx` | page-gate behavior test | ✓ VERIFIED | free→prompt, pro→workspace, null→fallback-free→prompt; green. |
| `tests/unit/entitlements.test.ts` | flag assertions | ✓ VERIFIED | Literal + resolver assertions including garbage→false fallback; green. |
| `tests/unit/chat/route.test.ts` | route gate tests | ✓ VERIFIED | 403-free (no model build) + 200-pro cases; green. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `app/api/chat/route.ts` | `lib/entitlements.ts` | `getEntitlements(tier).chatEnabled` | ✓ WIRED | Imported line 45, used line 85. |
| `app/api/chat/route.ts` | companies row read | `+ tier in .select()` | ✓ WIRED | `.select('industries, default_estimate_language, tier')` line 69. |
| `app/(app)/chat/[[...id]]/page.tsx` | `lib/entitlements.ts` | `getEntitlements(tier).chatEnabled` | ✓ WIRED | Imported line 18, used line 55. |
| `app/(app)/chat/[[...id]]/page.tsx` | companies.tier column | own service-client read (NOT getActiveCompany) | ✓ WIRED | `select('tier')` line 51; getActiveCompany usage = 0. |
| `app/(app)/chat/[[...id]]/page.tsx` | `components/chat/chat-upgrade-prompt.tsx` | conditional render when !chatEnabled | ✓ WIRED | Imported line 22, rendered line 56. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `route.ts` gate | `tier` | live `companies` row via service client (`.select(...,tier).eq(id).maybeSingle()`) | Yes — real DB read, defensive `?? 'free'` fallback | ✓ FLOWING |
| `page.tsx` gate | `tier` | own `companies.tier` read via service client scoped to active company | Yes — real DB read | ✓ FLOWING |
| `ChatUpgradePrompt` | static copy + fixed `/settings/billing` link | n/a (intentionally static affordance, no dynamic data) | n/a | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase quick-run green | `npx vitest run tests/unit/chat tests/unit/entitlements.test.ts` | 17 files / 118 tests passed | ✓ PASS |
| No migration introduced | `git diff --name-only 6c0cf457~1 bf9acfe6 \| grep migration/.sql` | none | ✓ PASS |
| getActiveCompany not used in page | grep page.tsx | 0 hits | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| CHATMETER-02 | 126-01, 126-02 | Chat is owner-only, tenant-scoped, tier-gated (Pro/Business), never customer-facing | ✓ SATISFIED | Route 403 boundary (Plan 01) + page UX prompt + static owner-only fence (Plan 02). REQUIREMENTS.md line 49 marked complete, line 97 maps to Phase 126. No orphaned requirements. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | none | — | No TODO/FIXME/placeholder, no hardcoded-empty-data stubs, no console-only handlers. Tier `?? 'free'` defaults are intentional defensive fallbacks (not stubs). |

### Human Verification Required

None. All truths verified programmatically via source inspection + passing unit/static tests. Visual rendering of `ChatUpgradePrompt` is covered structurally by the page-gate RTL test (CTA + copy assertions).

### Gaps Summary

No gaps. Phase 126 fully achieves its goal:
- `chatEnabled` flag added correctly across the type + all 4 tiers (free=false, trial/pro/business=true), with `as const satisfies` enforcing completeness.
- The security boundary (route 403 `chat_not_on_plan` with `upgradeUrl`) fires before any model resolution/tool build/stream — proven by a test asserting `resolveChatModel`/`buildChatTools` are not called for a free tenant.
- The page UX gate does its OWN tier read (Pitfall 2 avoided — `getActiveCompany` is never used), rendering `ChatUpgradePrompt` for unentitled owners and `ChatWorkspace` otherwise.
- The static `chat-access-scope.test.ts` proves no public/non-(app) route group references the chat, and that the route is owner-auth + tier-gated.
- No migration, no secrets. Phase quick-run (17 files / 118 tests) green. CHATMETER-02 satisfied; milestone v4.9 closed.

---

_Verified: 2026-06-25T06:00:00Z_
_Verifier: Claude (gsd-verifier)_
