import { redirect } from 'next/navigation'

/**
 * Stripe settings moved to "Client actions" (owner decision
 * XTM-D-20261121-feature-switches). Old links, bookmarks and Stripe return
 * URLs keep working: redirect and keep the query string (?connected=1, ?error=).
 * The demo guard lives on the target page.
 */
export default async function StripeIntegrationRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(sp)) {
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v))
    else if (value !== undefined) qs.set(key, value)
  }
  const query = qs.toString()
  redirect(`/settings/client-actions${query ? `?${query}` : ''}`)
}
