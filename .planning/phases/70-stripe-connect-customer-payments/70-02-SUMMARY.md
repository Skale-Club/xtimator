---
phase: 70-stripe-connect-customer-payments
plan: 02
subsystem: payments
tags: [stripe, stripe-connect, oauth, settings-ui, hmac, csrf, idempotent]

requires:
  - phase: 70-stripe-connect-customer-payments
    plan: 01
    provides: HMAC state helpers (mintOAuthState/verifyOAuthState), DB columns (stripe_account_id, stripe_connect_status, stripe_account_email, stripe_account_display_name, stripe_connected_at), stripe_connect_client_id integration provider, Wave 0 RED tests for callback + payments-page

provides:
  - 3 API routes for the full OAuth lifecycle (initiate, callback, disconnect)
  - Idempotent OAuth callback (re-runs for already-connected company are no-ops, never re-exchange the single-use code)
  - 3 new functions in lib/billing/connect-oauth.ts (buildAuthorizeUrl, exchangeCode, deauthorize)
  - StripeConnectCard client component (3 visual states)
  - /settings/payments server page (reads platform Client ID + company row → renders correct state)
  - Payments link card on the main /settings page (between Billing and Price Book)
  - 2 Wave 0 RED tests turned GREEN (connect-callback.test.ts 3/3, payments-page.test.tsx 3/3)

affects:
  - 70-03 (Pay Now button + Checkout Session API) — depends on companies.stripe_account_id being populated by this plan's callback
  - 70-04 (webhook handler) — depends on the connected lifecycle so events have a company to look up
  - Settings IA — adds a new top-level Settings sub-page; users now see Payments alongside Billing/Price-Book/Integrations

tech-stack:
  added: []
  patterns:
    - Stateless HMAC-signed cookies for OAuth CSRF (state cookie + URL state param both verified, 10-min TTL)
    - Idempotent OAuth callback by checking the persisted account_id BEFORE token exchange (prevents OAuth-spec connection revocation on double-click / retry)
    - Plain `fetch()` to connect.stripe.com/oauth/{token,deauthorize} — stripe-node intentionally does not wrap OAuth endpoints
    - Best-effort outbound Stripe deauthorize (swallow errors; company-side disconnect wins)
    - Server-component pages that pre-compute a discriminated-union state object and pass it to a single client component (zero conditional client logic)
    - Server-component testing in vitest by awaiting the page function then RTL-rendering its returned JSX

key-files:
  created:
    - app/api/stripe/connect/initiate/route.ts
    - app/api/stripe/connect/callback/route.ts
    - app/api/stripe/connect/disconnect/route.ts
    - app/(app)/settings/payments/page.tsx
    - components/settings/stripe-connect-card.tsx
  modified:
    - lib/billing/connect-oauth.ts
    - app/(app)/settings/page.tsx
    - tests/unit/billing/connect-callback.test.ts
    - tests/unit/settings/payments-page.test.tsx

key-decisions:
  - Callback IDEMPOTENCY via stripe_account_id check BEFORE exchangeCode — direct mitigation for RESEARCH Pitfall 3 (single-use OAuth codes that revoke the connection on second exchange)
  - Callback always redirects (never returns 4xx JSON) — invalid_state surfaces as `?error=invalid_state` on /settings/payments so the user lands on a useful UI; matches the "all errors are toasts" UX pattern. (Test asserts 302+location, not 400.)
  - Disconnect preserves stripe_account_email + stripe_account_display_name as audit trail per CONTEXT.md decision; only stripe_account_id + status are cleared
  - StripeConnectCard is a single client component receiving a discriminated `ConnectState` union (vs three separate components) — keeps the visual matrix grep-able in one file
  - Payments link uses `Wallet` lucide icon (Billing already uses `CreditCard`) to make the two cards visually distinct
  - The disconnect handler short-circuits with `{ok:true, message:'already disconnected'}` when stripe_account_id is null — idempotent retries from a confused UI never 4xx

requirements-completed: [CONNECT-03, CONNECT-04, CONNECT-05]

duration: ~6 min
completed: 2026-05-17
---

# Phase 70 Plan 02: Stripe Connect OAuth Flow + Settings → Payments UI Summary

**End-to-end OAuth-based Stripe Connect lifecycle (initiate → callback → disconnect) plus the owner-facing `/settings/payments` page that closes the entire owner-side connection loop (CONNECT-03/04/05).**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-17T05:41:53Z
- **Completed:** 2026-05-17T05:47:20Z
- **Tasks:** 3
- **Files modified:** 9 (5 created, 4 modified)

## Accomplishments

- Shipped 3 API routes implementing the full OAuth lifecycle. Owner can now click Connect → finish Stripe OAuth (test mode) → return to a populated DB row → click Disconnect → row clears.
- Turned both remaining Plan 70-02 Wave 0 RED tests GREEN (3 callback + 3 payments-page = 6 net GREEN assertions added on top of Plan 01's 4).
- Implemented the IDEMPOTENT callback (RESEARCH Pitfall 3) — re-running the callback for an already-connected company is a no-op success, never re-exchanges the single-use OAuth code.
- Closed all three Plan 02 requirements (CONNECT-03 initiate flow, CONNECT-04 callback persist, CONNECT-05 disconnect).
- Stayed within plan file list — did NOT touch any of Plan 70-03's files (estimate share page, pay route, components/estimate/*, components/share/estimate-view.tsx) which were already modified in the working tree by the parallel plan.

## API Contract Reference

### `GET /api/stripe/connect/initiate`

| Field | Value |
|-------|-------|
| Method | GET |
| Query | (none) |
| Cookies set | `stripe_oauth_state` (httpOnly, sameSite=lax, secure in prod, maxAge=600s, path=/) |
| Success | 307 redirect to `https://connect.stripe.com/oauth/authorize?...` |
| Auth missing | 307 redirect to `/login` |
| No company | 307 redirect to `/onboarding` |
| No Client ID | 307 redirect to `/settings/payments?error=platform_not_configured` |

### `GET /api/stripe/connect/callback`

| Field | Value |
|-------|-------|
| Method | GET |
| Query | `code` (required), `state` (required), `error?` (Stripe-side error) |
| Success | 307 → `/settings/payments?connected=1` |
| Stripe-side error | 302 → `/settings/payments?error=<stripe-error>` |
| Missing params | 307 → `/settings/payments?error=missing_params` |
| Invalid state | 302 → `/settings/payments?error=invalid_state` |
| Token exchange failure | 307 → `/settings/payments?error=token_exchange_failed` |
| Idempotency | If `companies.stripe_account_id` is already set, returns success without calling `exchangeCode` (does NOT re-exchange) |

### `POST /api/stripe/connect/disconnect`

| Field | Value |
|-------|-------|
| Method | POST |
| Body | (none) |
| Success | `{ok: true}` (200) |
| Already disconnected | `{ok: true, message: 'already disconnected'}` (200) — idempotent |
| Unauthorized | `{ok: false, message: 'unauthorized'}` (401) |
| Side effect | Best-effort `POST /oauth/deauthorize` to Stripe; clears `stripe_account_id` + sets `stripe_connect_status='disconnected'`; preserves `stripe_account_email` and `stripe_account_display_name` as audit trail; calls `revalidatePath('/settings/payments')` |

## Three-State Matrix for `/settings/payments`

| Condition | State | Visible UI |
|-----------|-------|------------|
| `getIntegrationKey('stripe_connect_client_id')` returns `null` | `not_configured` | "Stripe Connect is not yet enabled on this platform. Please contact support." — no CTA |
| Client ID set; `stripe_account_id` null OR `stripe_connect_status !== 'active'` | `not_connected` | "Connect your Stripe account in one click. Test mode works for setup." + "Connect Stripe Account" button (links to `/api/stripe/connect/initiate`, brand color #406EF1) |
| Client ID set; `stripe_account_id` set AND `stripe_connect_status === 'active'` | `connected` | Green dot + "Connected as **{display_name}**" + email (muted) + "Disconnect" outline button |

**Toast banners (query-string driven):**
- `?connected=1` → emerald success banner "Stripe account connected successfully."
- `?error=platform_not_configured` → destructive banner "Stripe Connect is not yet enabled on the platform."
- `?error=<other>` → destructive banner "Connection failed: <code>"

## OAuth State Cookie

| Property | Value |
|----------|-------|
| Cookie name | `stripe_oauth_state` |
| Format | `{companyId}.{nonce}.{timestampMs}.{base64url(hmac)}` (matches `mintOAuthState` from Plan 70-01) |
| TTL | 10 minutes (`maxAge: 600`) |
| Flags | `httpOnly`, `sameSite=lax`, `secure` only in production, `path=/` |
| Deleted | Immediately upon entering the callback (before state verification) — single-use per OAuth 2 spec |
| Verification | HMAC recomputed over `{companyId}.{nonce}.{timestampMs}` + `timingSafeEqual` against the signature segment |

## Task Commits

1. **Task 1: Extend connect-oauth.ts with buildAuthorizeUrl/exchangeCode/deauthorize** — `b479d7d` (feat)
2. **Task 2: Stripe Connect OAuth routes (initiate, callback, disconnect)** — `f5540d1` (feat)
3. **Task 3: /settings/payments page + StripeConnectCard + main settings link** — `71216ab` (feat)

**Plan metadata commit:** to follow this summary (docs).

## Files Created/Modified

### Created (5)

- `app/api/stripe/connect/initiate/route.ts` — OAuth entry; mints state cookie, builds authorize URL, 302s to Stripe; graceful degrade when Client ID unset.
- `app/api/stripe/connect/callback/route.ts` — Verifies state, idempotency-guards on existing account_id, exchanges code, retrieves account details, persists 5 fields, redirects with success/error param.
- `app/api/stripe/connect/disconnect/route.ts` — Soft disconnect with best-effort Stripe deauthorize, preserves audit trail, revalidates settings page.
- `app/(app)/settings/payments/page.tsx` — Server component that picks a `ConnectState` discriminated union and renders toast banners + the connect card.
- `components/settings/stripe-connect-card.tsx` — Client component, three visual states, Disconnect handler with `useTransition` + reload.

### Modified (4)

- `lib/billing/connect-oauth.ts` — Added `buildAuthorizeUrl`, `exchangeCode`, `deauthorize` (no changes to existing `mintOAuthState`/`verifyOAuthState`).
- `app/(app)/settings/page.tsx` — Added `Wallet` import + a new Payments link card between Billing and Price Book.
- `tests/unit/billing/connect-callback.test.ts` — Replaced Wave 0 RED stubs with 3 real tests (happy path / idempotency / invalid state) — all GREEN.
- `tests/unit/settings/payments-page.test.tsx` — Replaced Wave 0 RED stubs with 3 real tests (one per state) — all GREEN.

## Decisions Made

- **Idempotency check via `stripe_account_id` (not via DB-stored OAuth nonce / Redis):** simplest possible guard, lives on the row that already holds the truth. Side effect: if a user disconnects and re-runs the original `state` cookie before TTL, they'll get the code exchange flow again — but the cookie is single-use (deleted on entry) so this only matters within the same browser session, and the worst case is a fresh exchange of a still-valid code. Net: no risk surface beyond what RESEARCH Pitfall 3 already documents.
- **Callback always redirects (never returns 4xx JSON):** matches the "user always lands on a useful UI" pattern. Test assertion adjusted accordingly — verifies `302` + `error=invalid_state` location header instead of `400`. The plan's `done` note said "response.status === 400" but the route implementation in the same plan said "redirect with error param"; chose the redirect contract (matches the plan's action block + UX).
- **`displayName` priority:** `account.settings?.dashboard?.display_name ?? account.business_profile?.name ?? stripe_user_id`. This matches what Stripe's own Dashboard shows the business owner; falling all the way back to `acct_...` only happens for accounts that haven't completed any profile setup.
- **Disconnect preserves email + display_name:** per CONTEXT.md ("keep stripe_account_email for audit trail"). Code comments call this out explicitly so a future contributor doesn't "tidy up" the audit columns.
- **No new Settings IA refactor:** simple Link card matching the existing pattern (Billing/Price-Book/Integrations) — no shared layout extraction. Settings page is read-only mostly, low refactor ROI.
- **Used `void req` in disconnect handler:** silences the lint warning about unused param without removing the formal NextRequest signature (keeps the route signature consistent with the other two and future-proofs against needing the request body for CSRF tokens etc.).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Behaviour clarification] Test asserted 400 status; route implementation (also in this plan's action block) returns 302 redirect**
- **Found during:** Task 2 (writing the connect-callback test against the just-written route).
- **Issue:** The PLAN's `done` criteria for Task 2 said tampered state should produce HTTP 400, but the same plan's action block for `callback/route.ts` consistently uses `NextResponse.redirect(settingsUrl)` for every error path including `invalid_state`. The Wave 0 RED stub (from Plan 70-01) also asserted 400.
- **Decision:** Followed the implementation contract from the plan's action block (always-redirect UX) — this is the better UX (user lands on /settings/payments with a banner) and matches the rest of the error paths. Test rewritten to assert `302` + `location` contains `error=invalid_state`.
- **Files modified:** `tests/unit/billing/connect-callback.test.ts`
- **Verification:** All 3 callback tests GREEN.
- **Committed in:** `f5540d1`.

No other deviations. No Rule 2/3/4 fixes needed. Plan ran clean.

## Issues Encountered

- **Unrelated working-tree changes from parallel Plan 70-03:** `app/estimate/[token]/page.tsx`, `components/share/estimate-view.tsx`, `tests/unit/components/pay-now-button.test.tsx`, `components/estimate/*` were already modified/created by the parallel plan running in the same worktree. **Did not stage any of these** — they belong to Plan 70-03's commits. Each of my 3 commits used explicit per-file `git add` to enforce scope.
- **Pre-existing TS errors (21 total):** Same baseline as Plan 70-01 — missing `stripe`/`inngest`/`@aws-sdk` modules in `node_modules`, plus implicit-any in inngest functions. None introduced by this plan. Confirmed via `npx tsc --noEmit` post-Task-3.

## Authentication Gates

None — no external auth required for this plan. (The Stripe Connect Client ID itself is configured in `/admin/integrations`, which was wired in Plan 70-01.)

## Known Limitations

- **OAuth callback authenticates the logged-in user, not the original initiator:** by design, the HMAC state binds to `company.id`. If a different user logs in mid-flow (in the same browser) and hits the callback, the state's embedded `companyId` will not match their company → `invalid_state` error → user redirected back to /settings/payments. This is the correct security behavior (prevents account hijacking via shared browser), but worth documenting so support knows the failure mode.
- **No retry UI for `token_exchange_failed`:** if the Stripe `/oauth/token` POST fails (network, key rotation, etc.), the user sees the error banner and must click Connect again. Acceptable for MVP — the failure surface here is tiny because we just successfully redirected from Stripe with a valid code.
- **`displayName` may be stale after disconnect/reconnect:** we preserve old `stripe_account_display_name` after disconnect, then overwrite on the next callback. If the user changes their Stripe business name BETWEEN disconnect and reconnect, the audit trail shows the new name (since we re-fetch from Stripe on reconnect). Intentional — fresh data wins on reconnect.

## User Setup Required

Two pre-existing one-time owner actions (already documented in CONTEXT.md / SEED-020 runbook):
1. **Enable Connect in the Stripe Dashboard:** Dashboard → Connect → Get started → choose Standard.
2. **Add the OAuth redirect URIs** in Dashboard → Connect → Settings → Redirects:
   - `https://<your-prod-domain>/api/stripe/connect/callback`
   - `http://localhost:3000/api/stripe/connect/callback`
3. **Copy the Client ID (`ca_...`)** from Dashboard → Connect → Settings → paste into `/admin/integrations` → "Stripe Connect Client ID" card.

Without step 3, `/settings/payments` shows "Stripe Connect is not yet enabled on this platform" (state `not_configured`) and the Connect CTA is hidden — graceful degrade by design.

## Next Phase Readiness

- **Ready for Plan 70-03** (Pay Now button + Checkout Session API + share-page banners) — has the populated `companies.stripe_account_id` it needs.
- **Ready for Plan 70-04** (webhook handler) — connected lifecycle is now closeable, so webhook payloads will have a company row to look up.
- **No blockers.**

## Self-Check: PASSED

- `app/api/stripe/connect/initiate/route.ts` — FOUND
- `app/api/stripe/connect/callback/route.ts` — FOUND
- `app/api/stripe/connect/disconnect/route.ts` — FOUND
- `app/(app)/settings/payments/page.tsx` — FOUND
- `components/settings/stripe-connect-card.tsx` — FOUND
- `lib/billing/connect-oauth.ts` — extended (buildAuthorizeUrl/exchangeCode/deauthorize present)
- `app/(app)/settings/page.tsx` — Payments link card added
- Commits `b479d7d`, `f5540d1`, `71216ab` — FOUND in `git log`
- `npx vitest run tests/unit/billing/connect-oauth.test.ts tests/unit/billing/connect-callback.test.ts tests/unit/settings/payments-page.test.tsx` — 10/10 PASS
- `npx tsc --noEmit` — 21 pre-existing baseline errors, **0 new errors introduced**

---
*Phase: 70-stripe-connect-customer-payments*
*Plan: 02*
*Completed: 2026-05-17*
