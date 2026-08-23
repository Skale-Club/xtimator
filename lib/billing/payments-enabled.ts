/**
 * PAYGATE-01 — the SINGLE source of truth for "may forward-looking payment UI
 * render for this company?".
 *
 * Pure on purpose: NO `import 'server-only'`. The company row is always loaded
 * server-side (RLS-scoped), but this predicate carries no secrets and no I/O, so
 * its boolean result can be computed on the server and threaded down to a client
 * surface as a prop. Keeping it pure also makes it unit-testable in isolation.
 *
 * Every gate — the `generateInvoice` server action's Connect check, the owner
 * editor's Generate-invoice affordance, any future pay surface — calls THIS
 * helper. Do not re-derive the `=== 'active'` rule inline anywhere else; one
 * predicate means zero drift.
 *
 * CONNECT-HEALTH-01: also requires `stripe_charges_enabled !== false`. Stripe
 * can restrict a previously-active connected account (failed verification, a
 * paused capability, a rejected review, ...) without the account ever
 * disconnecting — `stripe_connect_status` alone cannot see that. The
 * `account.updated` Connect webhook handler is the only writer of
 * `stripe_charges_enabled`; `null`/`undefined` means a legacy row that has
 * never been synced by the fixed handler, so it stays permissive (no
 * regression for accounts connected before this column existed).
 */
export function paymentsEnabled(company: {
  stripe_account_id: string | null
  stripe_connect_status: string | null
  stripe_charges_enabled?: boolean | null
}): boolean {
  return (
    Boolean(company.stripe_account_id) &&
    company.stripe_connect_status === 'active' &&
    company.stripe_charges_enabled !== false
  )
}
