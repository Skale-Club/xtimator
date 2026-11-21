// lib/pdf/pdf-cache-key.ts
//
// Extra inputs for the estimate PDF's cache key / ETag. `estimates.updated_at` is a pure
// content version (it does not move when company branding or the attached photos change)
// and it cannot see a deploy that changes the PDF layout. The ETag therefore also carries:
//   - a hash of the company fields the PDF renders (`companies` has no updated_at trigger,
//     so a hash of the rendered fields is the reliable signal),
//   - a hash of the attached photos the PDF renders (ids, order, caption, crop),
//   - the build id (same source as /api/health: process.env.GIT_SHA).
import { createHash } from 'node:crypto'

function sha(parts: unknown): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 12)
}

/** Build id shared with /api/health; 'dev' when the deploy did not set it. */
export function pdfBuildId(): string {
  return (process.env.GIT_SHA ?? 'dev').slice(0, 12)
}

/** Hash of every company field the PDF renders (logo, colour, contact, terms, template). */
export function hashCompanyForPdf(company: object): string {
  const c = company as Record<string, unknown>
  return sha([
    c.name,
    c.owner_name,
    c.phone,
    c.email,
    c.website,
    c.address,
    c.city,
    c.state,
    c.zip,
    c.logo_url,
    c.brand_primary_color,
    c.estimate_terms_enabled,
    c.estimate_terms_text,
    c.estimate_template_style,
  ])
}

interface PhotoLike {
  id: string
  storage_path?: string | null
  caption?: string | null
  sort_order?: number | null
  position?: unknown
}

/** Hash of the attached photos in render order (ids, order, caption, crop). */
export function hashPhotosForPdf(photos: PhotoLike[] | null | undefined): string {
  return sha(
    (photos ?? []).map((p) => [p.id, p.storage_path ?? null, p.sort_order ?? null, p.caption ?? null, p.position ?? null]),
  )
}

/** Suffix appended to the content key: company + photos + build. */
export function pdfRenderKeySuffix(company: object, photos: PhotoLike[] | null | undefined): string {
  return `c${hashCompanyForPdf(company)}-p${hashPhotosForPdf(photos)}-b${pdfBuildId()}`
}
