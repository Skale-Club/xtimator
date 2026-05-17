import { notFound } from 'next/navigation'
import {
  CATEGORIES,
  findCategoryBySlug,
  loadCategoryInitials,
} from '@/lib/admin/integrations-providers'
import { getSelectedAIProvider } from '@/lib/platform-config'
import { IntegrationCard } from '../integration-card'
import { AIProviderSelector } from '../ai-provider-selector'

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

  const [initials, activeProvider] = await Promise.all([
    loadCategoryInitials(category),
    category.showAISelector ? getSelectedAIProvider() : Promise.resolve(null),
  ])

  return (
    <div className="flex flex-col gap-6">
      {category.description && (
        <p className="text-sm text-muted-foreground max-w-3xl">{category.description}</p>
      )}

      <div className="flex flex-col gap-4">
        {category.providers.map((p) => (
          <IntegrationCard
            key={p.id}
            provider={p.id}
            title={p.title}
            description={p.description}
            initial={initials.get(p.id) ?? { configured: false }}
          />
        ))}
      </div>

      {category.showAISelector && activeProvider && (
        <div className="rounded-lg border border-border bg-card/40 p-4 md:p-6">
          <AIProviderSelector current={activeProvider} />
        </div>
      )}
    </div>
  )
}
