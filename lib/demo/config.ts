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

/**
 * Returns the only origin allowed to host the public demo session.
 *
 * This is deliberately server-only configuration: request headers, query
 * parameters, and public environment variables must never influence a demo
 * redirect destination or the cookie security policy.
 */
export function getDemoAppOrigin(): URL | null {
  const raw = process.env.DEMO_APP_ORIGIN?.trim()
  if (!raw) return null

  let origin: URL
  try {
    origin = new URL(raw)
  } catch {
    return null
  }

  if (
    (origin.protocol !== 'https:' && origin.protocol !== 'http:') ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/' ||
    origin.origin !== raw.replace(/\/$/, '')
  ) {
    return null
  }

  // HTTP is intentionally limited to the explicit local-development host. A
  // production deployment cannot accidentally lose Secure cookies by changing
  // only an environment value.
  if (origin.protocol === 'http:' && origin.hostname !== 'demo.localhost') {
    return null
  }

  if (origin.protocol === 'https:' && origin.hostname !== 'demo.xtimator.com') {
    return null
  }

  return origin
}

/** True when the given company id is the dedicated demo company. */
export function isDemoCompany(companyId: string | null | undefined): boolean {
  return !!companyId && companyId === DEMO_COMPANY_ID
}
