import { redirect } from 'next/navigation'
import { DEFAULT_CATEGORY_SLUG } from '@/lib/admin/integrations-providers'

/**
 * /admin/integrations → redirect to default category (currently AI).
 * Layout handles the page header + nav; individual category pages handle
 * the actual card content.
 */
export default function IntegrationsIndexPage() {
  redirect(`/admin/integrations/${DEFAULT_CATEGORY_SLUG}`)
}
