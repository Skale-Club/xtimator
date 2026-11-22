/**
 * Company feature switches — the SINGLE source of truth for "what may this
 * company (and its clients) do?" for the two client-facing features:
 *
 *   - online payments   (Stripe Connect hosted invoices)
 *   - digital signature (online approve-and-sign on the public link)
 *
 * Owner decision XTM-D-20261121-feature-switches. Three layers per feature;
 * a feature works only when every layer says yes:
 *
 *   1. Platform switch  — super admin, per company (`*_allowed`). Off means
 *      the feature does not exist for that company: no settings card, no call
 *      to action, every server path refuses, the public link shows nothing.
 *      Written by the service role only (protect_company_billing_columns).
 *   2. Tenant switch    — the company owner, in Settings (`*_enabled`).
 *      Shown only when the platform allows the feature.
 *   3. Readiness        — payments only: a Stripe account is linked, active
 *      and Stripe has not paused charges.
 *
 * Pure on purpose: NO `import 'server-only'`, no I/O. The company row is
 * always loaded server-side; this module only turns it into booleans, so the
 * result can be threaded to a client surface as props and unit-tested alone.
 *
 * FAIL CLOSED: a column that was not selected (undefined) or is null counts
 * as "off". A query that forgets a column therefore hides the feature instead
 * of silently ignoring the platform switch. Select COMPANY_FEATURE_COLUMNS.
 *
 * Do NOT gate on the raw columns anywhere else (a source-scan test enforces
 * this). The Stripe webhook is the one deliberate exception: it never gates
 * on these switches, because money that arrives must always be recorded.
 */

/** Every column the resolver reads. Use it in `.select()` to stay complete. */
export const COMPANY_FEATURE_COLUMNS =
  'online_payments_allowed, online_payments_enabled, digital_signature_allowed, digital_signature_enabled, stripe_account_id, stripe_connect_status, stripe_charges_enabled'

export interface CompanyFeatureRow {
  online_payments_allowed?: boolean | null
  online_payments_enabled?: boolean | null
  digital_signature_allowed?: boolean | null
  digital_signature_enabled?: boolean | null
  stripe_account_id?: string | null
  stripe_connect_status?: string | null
  stripe_charges_enabled?: boolean | null
}

/** Platform-wide state that sits above every company (billing_config). */
export interface PlatformFeatureState {
  /** Global stop for client payments. False closes onboarding and invoicing for everyone. */
  connectPaymentsOpen: boolean
}

export interface OnlinePaymentsFeature {
  /** Platform allows it for this company AND the global stop is open. */
  allowed: boolean
  /** The tenant switch, as stored (meaningful only when `allowed`). */
  enabled: boolean
  /** A Stripe account id is stored on the company. */
  linked: boolean
  /** Linked, status active, and Stripe has not paused charges. */
  healthy: boolean
  /** Linked, but Stripe has paused charges or restricted the account. */
  restricted: boolean
  /** May start connecting a Stripe account. */
  canConnect: boolean
  /** May issue a new invoice. The one gate for every "issue" path. */
  canIssue: boolean
  /**
   * Settings should show something for payments: the feature is allowed, or a
   * Stripe account is still linked (so the owner can see it and disconnect).
   */
  showInSettings: boolean
}

export interface DigitalSignatureFeature {
  /** Platform allows it for this company. */
  allowed: boolean
  /** The tenant switch, as stored (meaningful only when `allowed`). */
  enabled: boolean
  /** Clients can approve and sign online. The one gate for every sign path. */
  active: boolean
  /** Settings should show the switch. */
  showInSettings: boolean
}

export interface CompanyFeatures {
  onlinePayments: OnlinePaymentsFeature
  digitalSignature: DigitalSignatureFeature
}

/**
 * Digital signature only. It does not depend on any platform-wide state, so
 * sign routes and public payloads can call this without loading billing_config.
 */
export function resolveDigitalSignature(
  company: CompanyFeatureRow | null | undefined,
): DigitalSignatureFeature {
  const allowed = company?.digital_signature_allowed === true
  const enabled = company?.digital_signature_enabled === true
  return { allowed, enabled, active: allowed && enabled, showInSettings: allowed }
}

export function resolveCompanyFeatures(
  company: CompanyFeatureRow | null | undefined,
  platform: PlatformFeatureState,
): CompanyFeatures {
  const row = company ?? {}

  const paymentsAllowed =
    row.online_payments_allowed === true && platform.connectPaymentsOpen === true
  const paymentsEnabled = row.online_payments_enabled === true
  const linked = Boolean(row.stripe_account_id)
  // `stripe_charges_enabled` null/undefined is a row the account.updated
  // webhook has not synced yet; only an explicit false means Stripe paused it.
  const healthy =
    linked && row.stripe_connect_status === 'active' && row.stripe_charges_enabled !== false
  const restricted = linked && !healthy

  return {
    onlinePayments: {
      allowed: paymentsAllowed,
      enabled: paymentsEnabled,
      linked,
      healthy,
      restricted,
      canConnect: paymentsAllowed && paymentsEnabled && !linked,
      canIssue: paymentsAllowed && paymentsEnabled && healthy,
      showInSettings: paymentsAllowed || linked,
    },
    digitalSignature: resolveDigitalSignature(row),
  }
}
