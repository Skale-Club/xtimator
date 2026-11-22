/**
 * Call-to-action clicks on the public marketing pages, as Tag Manager events.
 *
 * Code pushes `{ event: 'xt_cta_click', xt_cta, xt_cta_placement }` to the
 * dataLayer; the container turns it into a GA4 `cta_click` event (and, once the
 * Pixel is on, a Meta custom event), each behind its consent requirement.
 * Pushing is harmless where Tag Manager is not loaded: nobody reads the array.
 *
 * Elements can opt in declaratively with `data-xt-cta="<name>"` (and an
 * optional `data-xt-cta-placement`); MarketingTags listens for those clicks.
 */

export const CTA_EVENT = 'xt_cta_click'

export type CtaName = 'open_signup' | 'open_login' | 'demo' | 'play_store'

export function trackCta(cta: CtaName | string, placement?: string): void {
  if (typeof window === 'undefined') return
  try {
    const w = window as unknown as { dataLayer?: unknown[] }
    w.dataLayer = w.dataLayer || []
    w.dataLayer.push({ event: CTA_EVENT, xt_cta: cta, xt_cta_placement: placement ?? null })
  } catch {
    /* ignore */
  }
}

/** The CTA a click landed on (closest `[data-xt-cta]`), or null. */
export function ctaFromClickTarget(target: EventTarget | null): { cta: string; placement?: string } | null {
  if (!target || typeof (target as Element).closest !== 'function') return null
  const el = (target as Element).closest('[data-xt-cta]')
  const cta = el?.getAttribute('data-xt-cta')
  if (!el || !cta) return null
  return { cta, placement: el.getAttribute('data-xt-cta-placement') ?? undefined }
}
