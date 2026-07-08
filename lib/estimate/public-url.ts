import { randomBytes } from 'node:crypto'

/**
 * Phase 160 (PUBURL-01..05): friendly estimate URL contract.
 *
 * Fixed-length token, fixed-length parsing (never "split on last hyphen") --
 * base64url's alphabet includes '-' and '_' as its 62nd/63rd characters, so a
 * token that happens to end in '-' would make "split on last hyphen"
 * genuinely ambiguous. A fixed-length suffix slice is unambiguous regardless
 * of the token's own characters. See 160-RESEARCH.md.
 */
export const PUBLIC_SLUG_TOKEN_BYTES = 9
// randomBytes(9).toString('base64url') is ALWAYS exactly 12 chars (9 is a
// multiple of 3, so base64 needs no '=' padding). ~71 bits of entropy,
// comfortably above the >=60-bit floor set by CONTEXT.md/PITFALLS.md.
export const PUBLIC_SLUG_TOKEN_LENGTH = 12

/** Generates a NEW public_slug_token. Used by lib/services/generate-estimate.ts
 *  (new estimates, Plan 160-05) and scripts/backfill-public-urls.ts (existing
 *  estimates, Plan 160-05) -- ONE code path, never re-implemented. */
export function generatePublicSlugToken(): string {
  return randomBytes(PUBLIC_SLUG_TOKEN_BYTES).toString('base64url')
}

/** Minimal slugify -- mirrors app/admin/blog/actions.ts's local one-liner
 *  (proven in production for blog_posts.slug). This phase creates its OWN
 *  copy here (blog actions.ts is out of scope) so every friendly-URL call
 *  site in this phase shares ONE implementation. */
export function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export interface PublicUrlEstimate {
  id: string
  public_slug_token: string | null
  share_token: string
  /** For the estimateSlug text -- typically the linked project's name.
   *  Falls back to the literal word "estimate" when absent (a call site
   *  that doesn't already have the project name loaded, and isn't worth
   *  a dedicated extra query for). */
  project_name?: string | null
}

export interface PublicUrlCompany {
  slug: string | null
  name: string
}

/**
 * Returns a PATH ONLY (no origin) -- callers combine with
 * window.location.origin (client) or getCanonicalBaseUrl()/
 * getBranding().canonicalBaseUrl (server), exactly as buildShareLink() and
 * every existing share-URL call site already do today.
 *
 * Falls back to the token-only legacy path when slug data is absent
 * (pre-backfill edge case, or a row somehow missing public_slug_token) --
 * this is the SOLE builder of estimate public paths (PUBURL-04); every
 * inline `/estimate/${...share_token}` construction in the codebase is
 * migrated to call this function (Plan 160-04).
 */
export function buildEstimatePublicPath(
  company: PublicUrlCompany,
  estimate: PublicUrlEstimate
): string {
  if (company.slug && estimate.public_slug_token) {
    const estimateSlug = slugify(estimate.project_name || 'estimate') || 'estimate'
    return `/estimate/${company.slug}/${estimateSlug}-${estimate.public_slug_token}`
  }
  return `/estimate/${estimate.share_token}`
}

/**
 * Inverse of buildEstimatePublicPath's friendly-path branch. Extracts the
 * fixed-length shortToken suffix from the route's `estimateSlug` URL param
 * (e.g. a slug param ending in a 12-char token suffix -> { estimateSlug: "kitchen-remodel",
 * shortToken: <trailing 12 chars> }). Returns null when the param is too short
 * or malformed -- callers (Plan 160-03's page.tsx) should notFound().
 *
 * The companySlug/estimateSlug segments are NEVER validated against the
 * resolved row (per CONTEXT.md: "slugs are cosmetic/readable, the token is
 * the actual secret") -- only shortToken is used for the DB lookup.
 */
export function parsePublicSlugParam(
  estimateSlugParam: string
): { estimateSlug: string; shortToken: string } | null {
  if (estimateSlugParam.length <= PUBLIC_SLUG_TOKEN_LENGTH + 1) return null
  const shortToken = estimateSlugParam.slice(-PUBLIC_SLUG_TOKEN_LENGTH)
  const rest = estimateSlugParam.slice(0, -PUBLIC_SLUG_TOKEN_LENGTH)
  if (!rest.endsWith('-')) return null
  return { estimateSlug: rest.slice(0, -1), shortToken }
}
