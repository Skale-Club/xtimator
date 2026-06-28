# Phase 148: Demo Estimate Quota - Context

**Gathered:** 2026-06-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a per-company estimate quota system that is INDEPENDENT of the existing AI
credit_balance system. New columns on `companies`. A server-side guard blocks
estimate generation when the quota is exhausted. The super-admin panel can set or
override the quota for ANY company. Paid subscribers bypass the guard.

</domain>

<decisions>
## Implementation Decisions

### Column design (Claude's choice — user said "you decide")
- **D-01:** Add two nullable columns to `companies`:
  - `demo_estimate_quota INTEGER DEFAULT NULL` — the cap; NULL means no demo limit (existing companies and paid clients get NULL)
  - Track usage by COUNTING rows in the existing estimates/projects table, NOT a separate counter column. This avoids counter drift and is always accurate.
  - Rationale: separate from `credit_balance` (AI compute credits) to keep concerns distinct. `credit_balance` pays for AI compute; `demo_estimate_quota` is a business-level estimate count gate.

### Initial quota for admin-created companies
- **D-02:** When an admin creates a company via the Phase 147 modal, `demo_estimate_quota` is set to `3`. Regular onboarding (`mode: 'first'`) leaves `demo_estimate_quota` as `NULL`.

### Guard placement
- **D-03:** The guard runs SERVER-SIDE in the estimate generation server action (the same place GUARD-03 runs). Before invoking the AI, check: if `demo_estimate_quota IS NOT NULL` AND `COUNT(estimates for this company) >= demo_estimate_quota` → return a structured error (not an exception), same error shape as existing quota/billing errors.
- **D-04:** Paid subscribers bypass the guard: if `companies.tier IN ('pro', 'business')` → skip the demo quota check entirely. The existing billing entitlement is the authoritative gate for paying customers.

### Paywall UX (user decision)
- **D-05:** When quota is exhausted, the generate action returns the same structured paywall error that the existing credit exhaustion returns. The UI shows the EXISTING upgrade modal (no new UI needed). "Bloqueia geração + mostra upgrade (padrão)" — reuse the current pattern byte-for-byte.

### Super-admin quota override
- **D-06:** The super-admin panel (`/admin`) gets a new control: search by company + set `demo_estimate_quota` to any value (including NULL to remove the limit). This override works for ANY company, not just demo companies. Use the existing service-role update pattern in the admin panel.
- **D-07:** The override takes effect immediately — no cache invalidation needed beyond the per-request DB read (same pattern as other admin panel controls).

### Migration
- **D-08:** Idempotent authored-only migration. ADD COLUMN with `DEFAULT NULL` — existing rows get NULL (no limit), which is the correct retrocompat behavior. Zero data changes to existing companies.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Estimate generation guard
- `lib/services/generate-estimate.ts` — GUARD-03 block; the new demo quota check slots in here (before the AI call, after existing billing checks)
- `lib/billing/credit-ledger.ts` — existing credit deduction pattern; the demo quota guard is SEPARATE from this, it runs BEFORE credit deduction

### Admin panel pattern
- `app/admin/` — the existing super-admin panel structure to extend
- `app/admin/admins/actions.ts` — reference for service-role write pattern

### Phase 147 dependency
- `147-CONTEXT.md` — the modal creation flow must set `demo_estimate_quota = 3` after company creation

### Existing tables
- `companies` table — receives the new `demo_estimate_quota` column
- `projects` or `estimates` table — used to COUNT existing estimates for the quota check (no new counter column)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GUARD-03` pattern in `lib/services/generate-estimate.ts` — slot the demo quota check into the same guard block (before AI call, after billing check).
- Existing paywall/upgrade error handling — the quota exhaustion returns the same error shape as credit exhaustion; the existing upgrade modal handles it.
- Service-role update pattern in admin actions — for the super-admin quota override.

### Established Patterns
- Guards in estimate generation are SERVER-SIDE and return structured errors (not exceptions). Follow this pattern.
- Admin panel controls use service-role client to bypass RLS. Follow the existing `app/admin/` pattern.
- Migrations: idempotent, authored-only (never applied via MCP/remote — CI→GHCR→Coolify deploys them).

### Integration Points
- `lib/services/generate-estimate.ts` → demo quota check (new guard)
- `supabase/migrations/` → new migration file adding `demo_estimate_quota` column
- `app/admin/` → new quota management control in super-admin panel

</code_context>

<specifics>
## Specific Ideas

- The 3-estimate limit is positioned as a "demo" limit — clients who pay get unlimited estimates.
- The admin being able to override quotas for ANY company (not just demo accounts) gives flexibility for customer success: if a paying customer hits a technical issue during estimate generation, the admin can grant extra quota without going through billing.
- The user described this as "liberar mais orçamentos se caso der algum problema, se caso der algum erro" — this is the manual recovery valve.

</specifics>

<deferred>
## Deferred Ideas

- Automated quota increase tied to payment (e.g., after Stripe webhook for first payment → NULL quota automatically). Deferred — admin does this manually for now.
- Estimate quota analytics / usage dashboard in admin panel. Deferred.
- Per-tier quota defaults (e.g., trial = 5, free = 1). Current scope: just the demo quota (3) set at creation time.

</deferred>

---

*Phase: 148-demo-estimate-quota*
*Context gathered: 2026-06-28*
