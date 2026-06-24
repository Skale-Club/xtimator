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
 */
export function paymentsEnabled(company: {
  stripe_account_id: string | null
  stripe_connect_status: string | null
}): boolean {
  return Boolean(company.stripe_account_id) && company.stripe_connect_status === 'active'
}
