import { notFound } from 'next/navigation'
import {
  CATEGORIES,
  findCategoryBySlug,
} from '@/lib/admin/integrations-providers'
import { IntegrationCategoryContent } from '../integration-category-content'

export const dynamic = 'force-dynamic'

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }))
}

export default async function IntegrationCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const category = findCategoryBySlug(slug)
  if (!category) notFound()

  return <IntegrationCategoryContent category={category} />
}
