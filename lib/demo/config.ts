import 'server-only'

/**
 * Central configuration for the public demo workspace.
 *
 * The demo is a single dedicated company that outside visitors can explore in
 * read-only mode (see Notion: "Xtimator Public Demo Workspace" — Decisions D01-D11).
 *
 * Credentials for the shared demo user live ONLY in server-side env vars and are
 * never exposed to the browser. The demo company id is deterministic so the seed
 * script and read-only RLS can reference it reliably.
 */

/**
 * Deterministic id of the dedicated demo company.
 *
 * Defaults to a recognizable "de(mo)" UUID but can be overridden via env for
 * staging vs. production. Keep this in sync with the seed script and the
 * read-only enforcement migration.
 */
export const DEMO_COMPANY_ID =
  process.env.DEMO_COMPANY_ID ?? '0000de00-0000-0000-0000-000000000001'

/** The dedicated demo company id. */
export function getDemoCompanyId(): string {
  return DEMO_COMPANY_ID
}

/**
 * Email of the shared demo user used for programmatic server-side auto-login.
 * Returns null when not configured, so callers can degrade gracefully instead
 * of throwing on the public landing page.
 */
export function getDemoUserEmail(): string | null {
  return process.env.DEMO_USER_EMAIL ?? null
}

/** Password of the shared demo user. Server-only; never sent to the browser. */
export function getDemoUserPassword(): string | null {
  return process.env.DEMO_USER_PASSWORD ?? null
}

/** True when the demo is fully configured (credentials present). */
export function isDemoConfigured(): boolean {
  return Boolean(getDemoUserEmail() && getDemoUserPassword())
}

/** True when the given company id is the dedicated demo company. */
export function isDemoCompany(companyId: string | null | undefined): boolean {
  return !!companyId && companyId === DEMO_COMPANY_ID
}
