import { notFound } from 'next/navigation'
import {
  DEFAULT_CATEGORY_SLUG,
  findCategoryBySlug,
} from '@/lib/admin/integrations-providers'

import { IntegrationCategoryContent } from './integration-category-content'

export const dynamic = 'force-dynamic'

/**
 * /admin/integrations renders the default category directly (currently AI).
 * Layout handles the page header + nav; individual category pages handle
 * the actual card content.
 */
export default function IntegrationsIndexPage() {
  const category = findCategoryBySlug(DEFAULT_CATEGORY_SLUG)
  if (!category) notFound()

  return <IntegrationCategoryContent category={category} />
}
