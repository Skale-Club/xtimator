import { getOpenRouterDefaultModel, getSelectedAIProvider } from '@/lib/platform-config'
import type { Category } from '@/lib/admin/integrations-providers'
import { loadCategoryInitials } from '@/lib/admin/integrations-providers'
import { requireServiceClient } from '@/lib/supabase/service'
import { T } from '@/components/i18n/t'

import { AIProviderSelector } from './ai-provider-selector'
import { IntegrationCard } from './integration-card'
import { TwilioFromPhoneForm } from './twilio-from-phone-form'

type IntegrationCategoryContentProps = {
  category: Category
}

export async function IntegrationCategoryContent({
  category,
}: IntegrationCategoryContentProps) {
  const [initials, activeProvider, openRouterModel] = await Promise.all([
    loadCategoryInitials(category),
    category.showAISelector ? getSelectedAIProvider() : Promise.resolve(null),
    category.showAISelector ? getOpenRouterDefaultModel() : Promise.resolve(null),
  ])

  let twilioFromPhone = ''
  if (category.showFromPhone) {
    const svc = requireServiceClient()
    const { data } = await svc
      .from('platform_integrations')
      .select('metadata')
      .eq('provider', 'twilio')
      .maybeSingle()
    twilioFromPhone = (data?.metadata as { from_phone?: string } | null)?.from_phone ?? ''
  }

  return (
    <div className="flex flex-col gap-6">
      {category.description && (
        <p className="text-sm text-muted-foreground max-w-3xl">
          <T text={category.description} />
        </p>
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
          <AIProviderSelector
            current={activeProvider}
            currentOpenRouterModel={openRouterModel}
          />
        </div>
      )}

      {category.showFromPhone && (
        <TwilioFromPhoneForm current={twilioFromPhone} />
      )}
    </div>
  )
}
