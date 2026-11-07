# SEED-055 — Billing v3: credit-only access model

**Status:** execution plan, reviewed 2026-11-06 (second pass against the code). **All decisions D1–D9 resolved 2026-11-06.**

**Execution log (2026-11-06, local commits on `main`, NOT pushed):** B `68c7f0ba` · C `a30370c8` · D1 `e3a17533` · D2 `7850c8b8` · D9 onboarding redirect `e54736c8` · E `66e2f76f` · F `4c960a9d` · E templates `a8ecc1ac`. Phase H local gate: `tsc -p tsconfig.ci.json` clean; `vitest run tests/unit tests/eval` 7287 passed, failures only the known local ones (demo `session-route`, PDF footer) plus the mutation-boundary sweep, which fails only because another session's uncommitted edit to `tests/unit/demo/mutation-boundary-sweep.test.ts` deletes the committed `expireCreditLotsJob` entry (HEAD is correct).
**Pending:** apply migrations `20261106000001/2/3` to prod BEFORE pushing; then push; admin re-save of `billing_config`; Phase A calibration (needs prod DB); Phase G (Stripe Prices + test-clock cycle); cutover. Blocked on the other session's uncommitted `components/chat/chat-bubble.tsx`: "Xtimator AI" label and removal of the `chatEnabled` prop + `chat-upgrade-prompt.tsx`.
**Supersedes:** Billing v2's per-tier feature gating (free tier with `chatEnabled:false`, 3 photos, 2 audio minutes, no price book).
**Rollout lever:** `billing_config.enforcementEnabled` stays the single kill switch. Every phase ships with it OFF (no user-visible blocking), and the cutover is one admin flip. Rollback = flip it back.

## 1. Target model (owner, 2026-11-06)

1. Everyone has every feature from the first login — the AI chat included. Plans differ only by credits.
2. Signup grants one-time credits sized for **~2 complete estimates**. No trial clock.
3. With 0 credits, nothing new can be created — **not by AI and not by hand** (D1). The only way forward is Pro.
4. Pro = **$29/month** for **one company and one user**, with a monthly credit allowance that **expires at renewal**. Annual Pro may be bought too (D6). Extra users/companies are not defined yet — **blocked for now** (D9).
5. Top-up packs are available to Pro only; purchased credits **accumulate** across months, each purchase expiring **3 months** after purchase (D5).
6. Business ($99) stays configured but is **hidden** from every customer-facing surface.
7. The chat assistant is renamed **"Xtimator AI"** (D2).
8. Credits are displayed as credits. The topbar chip stays as it is; no "≈ N estimates" conversion.

## 2. What the code does today (verified 2026-11-06)

| Area | Today | Must become |
|---|---|---|
| Feature gates | `lib/entitlements.ts` + `billing_config.tiers[*].entitlements`: free has `chatEnabled:false`, 3 photos, 2 min audio, `priceBookEnabled:false`, 50 price research/mo | Free == Pro on every feature |
| Chat gate | `app/(app)/layout.tsx:234` passes `chatEnabled` → `ChatBubble` renders the upgrade card; `app/api/chat/route.ts:116` returns `403 chat_not_on_plan` | Gate removed; chat gated by credits |
| Chat cost | Turns are **absorbed** (rate-limited by `absorbedChatRateLimitPerMin`); cost IS already measured in `ai_cost_events` (op `chat`, migration `20260823000003`); static test `tests/unit/chat/credit-reuse.test.ts` forbids a debit in the route | Decide D3 |
| Balance model | One integer `companies.credit_balance` + append-only `credit_ledger` (`grant/debit/topup/adjust`), atomic RPC `apply_credit_ledger_entry` | **No expiry, no buckets** → credit lots |
| Monthly grant | Calendar-month key `grant:{companyId}:{YYYY-MM}` (`monthGrantKey`) fired by `checkout.session.completed`, `invoice.paid` (no `billing_reason` filter) and the 1st-of-month cron `monthly-credit-grant` | Keyed on the Stripe billing period; previous period's lot expires |
| Enforcement | `enforcementEnabled=false` → `checkCredits` never blocks; pre-gate asks for `1` credit while the real debit lands after the op | ON, with a per-op estimated cost for the pre-gate |
| Manual path | `createBlankEstimate` (`lib/actions/estimate.ts:410`) has no credit check; `UpgradeModal` says "you can still build this estimate manually" and only intercepts 402 from `/api/generate-estimate` and `/api/analyze-photos` (not transcribe/refine) | No creation without credits; all AI routes covered |
| Route groups | `app/(app)/layout.tsx` AND `app/(capture)/layout.tsx` are **separate layouts** with their own auth | Paywall must be enforced in **both** (or in one shared server helper) |
| Signup grant | `lib/actions/company.ts:436` fires `grantSignupCredits` **fire-and-forget**; a failure = company at 0 credits | Awaited + retried; paywall self-heals |
| Added companies | `mode:'add'` skips the signup grant and calls `grantMonthlyCredits(inheritedTier)` → one $29 sub can fund N companies with a full monthly lot each | Decide D9 |
| BYOK | `checkCredits` always allows `byok_enabled` companies | Keep as the deliberate super-admin exception |
| Cancellation | `customer.subscription.deleted` sets `tier='free'`, keeps the balance | Also expire the monthly lot |
| Trial leftovers | `tier_trial_ends_at` (layout `trialDaysRemaining`, admin billing table, Xphere mapping `'trial'`) | Stop writing/reading; keep the column (Xphere mapping stays tolerant) |
| Prod billing | Memory (2026-08): no `billing_config` row, no Stripe Prices, no webhook ever processed | Provision + verify before cutover |
| Stripe | SDK pinned to `2026-04-22.dahlia`; `readPeriodEnd(subscription)` already resolves the period end from subscription items | Reuse it for lot expiry |

## 3. Decisions

| # | Decision | Status / recommendation |
|---|---|---|
| D1 | Zero credits → what is blocked? | **Resolved:** hard paywall; no manual estimate building (trial or Pro) |
| D2 | Assistant name | **Resolved: "Xtimator AI"** |
| D3 | Chat metering | **Resolved (recommendation accepted):** debit per turn; per-minute rate limit kept as abuse protection |
| D4 | Purchased credits after cancellation | **Resolved (recommendation accepted):** kept until their own expiry, spendable only with an active subscription |
| D5 | Expiry windows | **Resolved:** top-ups expire **3 months** after purchase; signup credits never expire and are consumed after the monthly lot |
| D6 | Annual plan | **Resolved: annual Pro is sold.** Credits are still granted **monthly** (a lot per monthly anniversary of the subscription, expiring at the next anniversary) — the backstop cron becomes load-bearing for annual subs |
| D7 | Existing accounts at cutover | **Resolved:** only the owner's own account matters. No customer email, no per-account migration — the owner's company is set by hand (Pro + lots); every other existing company just gets a fresh signup lot from the cutover script (or nothing). **Exception (owner, 2026-11-06): `skleanings@gmail.com` is ours and must live the full ordinary-customer journey** — no bypass of any kind (see Cutover step 1b) |
| D8 | Pro with 0 credits: edit existing estimates? | **Resolved (recommendation accepted):** yes — only creation is blocked |
| D9 | Extra companies / extra users | **Resolved: $29 = 1 company + 1 user.** "Add company" and "Invite teammate" are **blocked** for everyone until add-ons are defined. Existing multi-company / multi-member rows are left as they are (only the owner's account matters, D7) |

## 4. Execution plan

Order: A ∥ B → C → D → (E ∥ F) → G → H → cutover. A, E and F have no code dependency on B and can run in parallel with it. Every phase lands on `main` with enforcement OFF and is individually deployable.

### Phase A — Calibration (data, no code)
**Deliverable:** the numbers saved in the prod admin billing panel.
- From prod `ai_cost_events` + `credit_ledger` debits (recorded even with enforcement off): real credits per **completed estimate**, split by op (`audio_minutes`, `photo_batch`, `estimate`, `price_research`, `chat`), p50/p75/p90.
- `signupCreditGrant = ceil(p75 × 2 × 1.1)`.
- Pro `monthlyCreditGrant`: largest value whose real cost ≤ 30% of $29 (`MARGIN_INVARIANT_MAX`, `lib/billing/calibration.ts`); the admin save refuses enforcement otherwise.
- Top-up packs re-priced from the same per-estimate cost.
- New config field `estimatedCreditsByOp` (p75 per op) for the pre-gate (Phase D).
- The per-estimate figure is internal; never shown in the UI.

### Phase B — Credit lots with expiry (schema + ledger core)
**Deliverable:** lots exist, every grant/debit goes through them, user-visible behaviour unchanged.
- Migration: table `credit_lots(id, company_id, source 'signup'|'monthly'|'topup'|'adjust', granted, remaining, expires_at nullable, period_key, ref_id, created_at)`, RLS SELECT via `company_members` (same as `credit_ledger`). `credit_ledger.reason` CHECK += `'expire'`; `operation_type` CHECK += `'chat'`; nullable `lot_id`.
- RPCs (SECURITY DEFINER, service-role only, replacing `apply_credit_ledger_entry`):
  - `grant_credit_lot(company, source, credits, expires_at, period_key, ref, idem_key)` → lot + ledger row + cache bump; idempotent on `(company_id, idempotency_key)`.
  - `consume_credits(company, credits, op, ref, idem_key)` → locks the company row, drains lots **monthly → signup → topup (soonest expiry first)**, one ledger row with the per-lot split (JSON), cache update. Lots never go negative **except the last one drained**, which carries the overdraft (same net effect as today's negative balance; a later lot does not "repay" it, the sum simply nets).
  - `expire_credit_lots()` → zeroes positive `remaining` of lots past `expires_at`, writes `expire` rows, recomputes cache.
- Inngest cron (hourly) calling `expire_credit_lots`; `reconcileBalance` recomputes from lots.
- `lib/billing/credit-ledger.ts`: `grantCredits` gains `source`/`expiresAt`; `recordCreditDebit` calls `consume_credits`; all existing idempotency keys unchanged (`signup:`, `autotopup:{pi}`, topup event ids, `monthGrantKey` until Phase C).
- Backfill migration: current `credit_balance` of every company → one lot (`source='adjust'`, no expiry; replaced at cutover per D7).
- Apply migrations to prod **before** pushing code (memory: migrations are manual).
- Tests: rewrite `credit-ledger.test.ts`, `credit-ledger-migration.test.ts`; new `credit-lots-*.test.ts` (consumption order, overdraft rule, expiry, idempotency replay).

### Phase C — Subscription-cycle grants
**Deliverable:** the monthly lot follows the Stripe billing period.
- `invoice.paid` (filter `billing_reason in ('subscription_create','subscription_cycle')`): expire the live `monthly` lot, grant a new one with `expires_at = readPeriodEnd(subscription)`, idem key `grant:{companyId}:{periodStart}`.
- `checkout.session.completed` subscription arm: same key, same expiry (whichever lands first grants; the other is a no-op — same guarantee as today).
- `customer.subscription.deleted`: expire the live `monthly` lot in the same handler that sets `tier='free'`.
- `customer.subscription.updated` with `status in ('canceled','unpaid')`: same expiry; `past_due` keeps access (Stripe dunning).
- Cron `monthly-credit-grant` becomes a backstop only: grants a missing `monthly` lot for the *current* period of an active sub (idempotent); the calendar-month key and `monthGrantKey` are deleted together with `tests/unit/billing/month-grant-key.test.ts` and `credit-grant-no-double.test.ts` (replaced by period-key tests).
- Top-ups (`grantTopupCredits`, auto top-up `payment_intent.succeeded`, `chargeAutoTopup`) create `topup` lots with `expires_at = now + topupExpiryMonths` (new config, default **3**, D5). `create-topup-session` and auto top-up refuse non-Pro companies.
- **Annual subs (D6):** `invoice.paid` grants only the first monthly lot (expiring at the first monthly anniversary of the subscription anchor). The cron (now **daily**, not 1st-of-month) grants the lot for the current anniversary period of every active annual sub, idempotent on `grant:{companyId}:{anniversaryPeriodStart}`, and expires the previous one. Monthly subs still get their lot from `invoice.paid`; the cron only backstops them. Test with a Stripe test clock advanced across two anniversaries.

### Phase D — Access model: credits are the only wall
**Deliverable:** every gate derives from `{tier, subscriptionStatus, creditBalance, byok}`; all inert while enforcement is OFF.
- One server helper `getAccessState(companyId)` → `'active' | 'out_of_credits' | 'paywalled'`:
  - `byok_enabled` → `active`.
  - `enforcementEnabled=false` → `active`.
  - free (or sub status `canceled`/`unpaid`) with balance ≤ 0 → `paywalled`.
  - Pro (status `active`/`trialing`/`past_due`) with balance ≤ 0 → `out_of_credits`.
  - Demo companies (`isDemoCompany`) → `active`, never debited.
- **Paywall UX (refined 2026-11-06 during execution):** `paywalled` = persistent non-dismissable banner in `app/(app)/layout.tsx` + the whole app read-only (browsing existing data stays possible, every create/edit refused server-side); `app/(capture)/layout.tsx` (pure creation) renders a full-screen block instead. `out_of_credits` = softer banner + "Buy credits". Both layouts read the same `getAccessState`. Exempt: `/settings/billing`, `/onboarding`, `/invite`, logout, every public/customer route (`/estimate/...`, signatures, payments, `/api/webhooks/*`, `/api/health`, `/api/inngest`). Self-heal: if the company has **no ledger rows at all**, re-run the idempotent `grantSignupCredits` inline before deciding (covers a failed fire-and-forget grant).
- Signup grant awaited in `createOrUpdateCompany` (mode `first`) with one retry; failure logged to ops (`notifyOps`) — never swallowed silently.
- Creation gates (`checkCredits(client, companyId, estimatedCreditsByOp[op])`): `createBlankEstimate`, duplicate/version paths in `lib/actions/estimate.ts`, `lib/services/generate-estimate.ts`, `lib/agent-tools/create-estimate.ts`, `app/api/mcp` estimate creation, WhatsApp handler, every `/api/*` AI route (generate, analyze-photos, transcribe, refine, chat), Inngest `analyze-photos`/`transcribe-audio`/`generate-estimate`.
- In `paywalled` state also block `saveEstimate`, section/item mutations, project/client creation (read-only app). In `out_of_credits` editing existing estimates stays allowed (D8).
- Remove the plan gates: `chatEnabled` (type, `lib/entitlements.ts`, `billing-config.ts`, `lib/schemas/admin.ts:226`, admin form, layout, chat route, `chat-upgrade-prompt.tsx`), `maxEstimatesPerMonth` (keep `maxEstimatesPerDay` as a generous abuse cap only), `priceBookEnabled` for free. Free tier values = Pro values for photos, audio minutes, price research. Keep the per-tier shape (lowest-risk change to the admin form); `customDomainEnabled` stays Business-only for later.
- Chat metering (D3): `app/api/chat/route.ts` debits each turn via `recordCreditDebit({operationType:'chat'})` from the measured cost; replace `tests/unit/chat/credit-reuse.test.ts` with a test asserting the single debit. Keep the per-minute rate limit as abuse protection.
- Error surface: `UpgradeModal` intercepts 402 from **all** AI routes; copy per state — paywalled → "Subscribe", out_of_credits → "Buy credits"; delete the "build it manually" copy; `capture-failure.tsx` / `capture-recorder.tsx` hide "Edit manually"/"Continue manually" when the failure is credits.
- Trial leftovers: stop reading `tier_trial_ends_at` in the layout/admin table; Xphere mapping maps `'trial'` → `'free'`; the column stays.
- **1 company + 1 user (D9):** `createOrUpdateCompany` mode `'add'` (`lib/actions/company.ts`) returns a "not available yet" error and its entry points (company switcher "Add company", onboarding survey add path, tour) are hidden; `lib/actions/team.ts` invite creation and `app/invite/accept` are disabled the same way (existing invites can no longer be accepted); `grantMonthlyCredits(…, 'company-added')` call is removed. Seat billing (`seat-billing.ts`) stays dormant at price 0. Super-admin handoff (`admin-handoff.ts`) is unaffected.
- Tests: `getAccessState` matrix (every state × every channel); the demo mutation-boundary sweep reddens on new route handlers (memory) — add the new routes to its allowlist in the same commit.

### Phase E — Credits UX (minimal)
- Topbar chip unchanged; its cycle denominator (`getCycleGrantedCredits`) switches from UTC month to the live `monthly` lot's `granted` (falls back to raw balance when there is none, as today).
- Notifications (`notifyLowCreditBalance` copy): exhausted → "Subscribe" (trial) or "Buy credits" (Pro); low → same CTA, no more "informational only" wording.
- `/settings/billing`: one plan card (Pro, monthly/annual toggle), balance split by lot with expiry dates, packs (Pro only), auto top-up, ledger history incl. `expire` rows; Business hidden (`TierCardsGrid` filter, not deletion). Copy states "1 company, 1 user" and that top-ups expire in 3 months.
- Landing/pricing copy: "Start free — your first estimates on us. Then $29/mo."

### Phase F — Rename the assistant to "Xtimator AI" (D2)
- `components/chat/chat-bubble.tsx:369`, i18n dictionaries, tour/onboarding copy, landing copy, the chat system prompt's self-reference, WhatsApp/MCP replies containing "assistant". `chat-upgrade-prompt.tsx` is deleted in Phase D. RTL tests hard-code the accessible name "Assistant" (memory) — grep `tests/` and update in the same commit.

### Phase G — Stripe + production readiness
- Save `billing_config` in prod admin with Phase A numbers → provisions the Pro monthly **and annual** Prices and packs (Business may remain unprovisioned). The margin invariant is checked against the annual price too (`calibration.ts`) — calibrate the annual price so it passes. Enforcement still OFF (the save is allowed; only flipping it on runs the margin gate).
- Verify webhook endpoint + secret in the admin panel (never env). Run a full **test-mode** cycle with a Stripe test clock: checkout → `invoice.paid` → monthly lot; top-up → topup lot; renewal → old monthly lot expired, new one granted; cancel → lot expired → `paywalled`.
- Ensure `tier_renews_at` / lot `expires_at` agree for the same subscription.

### Phase H — Verification
- CI suite green (`tsc -p tsconfig.ci.json` + `vitest run tests/unit tests/eval`), exit code read from a file (memory).
- Staging E2E across one renewal with a test clock; trial-exhausted state checked on web, capture flow, WhatsApp and MCP.
- Load check on `consume_credits` (concurrent debits on one company).

### Cutover (release day, in this order)
1. D7: expire every Phase B `adjust` lot; give every existing company a fresh `signup` lot (idempotent `signup:{companyId}` — companies that already have one are skipped). The owner's own company is set by hand (Pro + monthly lot). No customer email needed.
1b. **`skleanings@gmail.com` = reference customer account.** Before the flip, verify in prod that nothing exempts it from the normal flow: its user is NOT in `platform_admins`, its company has `byok_enabled = false`, is not the demo company (`isDemoCompany`), has `tier = 'free'`, no `stripe_subscription_id`, and holds exactly one live `signup` lot (expire any `adjust`/backfill lots on it). It keeps its existing data. From there it must go through, for real: trial credits → AI estimates → credits exhausted → paywall (no manual building) → Pro checkout ($29, live card) → monthly lot → top-up purchase (3-month lot) → renewal → cancel → paywall again. Phase H runs this journey end to end on this account, on web, capture flow, WhatsApp and MCP.
2. Flip `enforcementEnabled=true` in the admin panel (margin gate must pass).
3. Watch for 48h: ops alerts `credit_ledger_write_failed`, paywall hit rate, Stripe webhook failures, support inbox.
4. Rollback = flip OFF; lots and grants stay valid, nothing to migrate back.
5. Update memory `project_billing_prod_state`.

## 5. Risks and mitigations

| Risk | Mitigation |
|---|---|
| New user paywalled because the signup grant failed | Awaited grant + inline self-heal in the paywall decision + ops alert |
| Capture flow bypasses the paywall | Shared helper called from both layouts; test asserts both call sites |
| Chat opened to everyone before enforcement is on | Phase D ships days before cutover at most; rate limit stays; chat debit is on from Phase D so cost is at least recorded |
| Webhook redelivery double-grants a period | Period-keyed idempotency on `grant_credit_lot`, test on replay |
| Lot expiry drifts from Stripe renewal | Both read `readPeriodEnd(subscription)`; cron backstop re-grants a missing current-period lot |
| Admin form / zod schema out of sync after removing `chatEnabled` | Same commit edits type, defaults, schema, form, and the stored prod row (admin re-save) |
| Big-bang risk | Every phase deployable alone with enforcement OFF; cutover is one flip with a one-flip rollback |
