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
