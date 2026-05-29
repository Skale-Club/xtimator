/**
 * Phase 66 Plan 01 — STORAGE-04: storage key convention helper.
 *
 * Build a storage key matching the S3-friendly convention:
 *   {companyId}/{type}/{timestamp}-{safeFilename}
 *
 * Why this shape:
 *   - aws s3 sync s3://supabase/{companyId}/ s3://hetzner/{companyId}/   (per-company migration)
 *   - per-company lifecycle rules attach trivially to a key prefix
 *   - any misplaced asset can be diagnosed by reading its path
 *   - timestamp guarantees uniqueness without an extra DB round-trip
 *
 * Sanitization mirrors lib/whatsapp/pdf-delivery.ts buildPdfFilename:
 *   - whitespace collapses to hyphens
 *   - chars outside [a-zA-Z0-9._-] are stripped
 * The `type` and `companyId` segments are caller-controlled and NOT
 * sanitized — pass already-safe values (UUIDs, ascii-only literals).
 */

export interface BuildStorageKeyArgs {
  /** Company UUID. Used as the top-level prefix for tenant isolation. */
  companyId: string
  /**
   * Asset category, e.g. 'photos', 'audio', 'whatsapp-pdf', 'logo',
   * 'refine-photos'. Caller passes a stable ascii-only literal.
   */
  type: string
  /** Original filename, will be sanitized. */
  filename: string
  /**
   * Optional explicit timestamp (millis since epoch) for deterministic
   * test output. Defaults to Date.now().
   */
  timestamp?: number
}

/** Tenant prefix must be a real UUID. */
const COMPANY_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Asset category must be an ascii-safe literal (no slashes / traversal). */
const TYPE_RE = /^[a-zA-Z0-9_-]+$/

export function buildStorageKey(args: BuildStorageKeyArgs): string {
  // Security Review S04 — defense-in-depth: the `companyId` and `type` segments
  // are not sanitized into the key, so a non-UUID companyId (e.g. "../other-co")
  // or a type containing a slash would let an attacker escape the tenant prefix.
  // All current callers pass DB/auth-derived UUIDs, but reject anything else.
  if (!COMPANY_ID_RE.test(args.companyId)) {
    throw new Error('buildStorageKey: companyId must be a UUID')
  }
  if (!TYPE_RE.test(args.type)) {
    throw new Error('buildStorageKey: type must match [a-zA-Z0-9_-]')
  }
  const ts = args.timestamp ?? Date.now()
  const safe = args.filename
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
  return `${args.companyId}/${args.type}/${ts}-${safe}`
}
