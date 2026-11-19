/**
 * Launch switch for Stripe Connect onboarding (owner decision 2026-11-19).
 *
 * Xtimator launches with subscriptions only: Stripe Connect is not yet set up
 * on the Xtimator Stripe account, so a company starting the OAuth flow would
 * hit a broken connect screen. While this is false:
 *   - the "Collect payments" card is hidden from Settings > Integrations for
 *     companies that never connected,
 *   - /settings/integrations/stripe shows the "not enabled on this platform"
 *     state to companies that never connected,
 *   - GET /api/stripe/connect/initiate refuses to start onboarding.
 * A company that already has a stripe_account_id keeps seeing its status and
 * can still disconnect. Payment surfaces are unaffected: they already render
 * only for connected companies (lib/billing/payments-enabled.ts).
 *
 * To open Connect: finish Connect setup on the Xtimator Stripe account, add
 * the Connect webhook + OAuth redirect, save the new client ID in the admin
 * panel, set STRIPE_CONNECT_WEBHOOK_SECRET, then flip this to true and deploy.
 */
const CONNECT_ONBOARDING_OPEN = false

export function isConnectOnboardingOpen(): boolean {
  return CONNECT_ONBOARDING_OPEN
}
