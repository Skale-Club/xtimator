/**
 * lib/email/sender.ts
 *
 * The SINGLE source of truth for the outbound email "From" identity. The app's
 * sending domain is xtimator.com — never hardcode `notifications@xtimator.com`
 * (or any other domain) elsewhere; import from here so a domain change is a
 * one-line edit and can never drift across files again.
 */

/** The canonical From address for all Xtimator mail. */
export const EMAIL_FROM_ADDRESS = 'notifications@xtimator.com'

/**
 * Build a display-named From header: `Name <notifications@xtimator.com>`.
 * Pass the brand/app name (usually `branding.appName`).
 */
export function emailFrom(name: string): string {
  return `${name} <${EMAIL_FROM_ADDRESS}>`
}

/**
 * Build the end-customer-facing From header (CUST-01).
 *
 * Contract: ALWAYS the honest, non-deceptive `"{{business_name}} via Xtimator"`
 * friendly-from — never a bare business name (which would let a tenant's mail
 * impersonate the business with no indication a platform is sending on its
 * behalf — Gmail/Outlook penalize this "deceptive friendly-from" pattern) and
 * never bare "Xtimator" (which would hide whose message it actually is from
 * the recipient). This is the ONE place this string is constructed; every
 * end-customer send must go through it.
 */
export function customerEmailFrom(businessName: string): string {
  return `${businessName} via Xtimator <${EMAIL_FROM_ADDRESS}>`
}
