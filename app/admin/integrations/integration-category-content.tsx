import { getOpenRouterDefaultModel, getSelectedAIProvider } from '@/lib/platform-config'
import type { Category } from '@/lib/admin/integrations-providers'
import { loadCategoryInitials } from '@/lib/admin/integrations-providers'
import { requireServiceClient } from '@/lib/supabase/service'
import { T } from '@/components/i18n/t'

import { AIProviderSelector } from './ai-provider-selector'
import { IntegrationCard } from './integration-card'
import { TwilioFromPhoneForm } from './twilio-from-phone-form'
import { WhatsAppConfigForm } from './whatsapp-config-form'
import { WhatsAppSystemPromptForm } from './whatsapp-system-prompt-form'
import { XphereConfigForm } from './xphere-config-form'

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

  let waPhoneNumberId = ''
  let waWabaId = ''
  let waDisplayNumber = ''
  let waSystemPrompt = ''
  if (category.showWhatsAppConfig) {
    const svc = requireServiceClient()
    const { data } = await svc
      .from('platform_integrations')
      .select('metadata')
      .eq('provider', 'meta_whatsapp')
      .maybeSingle()
    const meta =
      (data?.metadata as {
        phone_number_id?: string
        waba_id?: string
        display_number?: string
        system_prompt?: string
      } | null) ?? {}
    waPhoneNumberId = meta.phone_number_id ?? ''
    waWabaId = meta.waba_id ?? ''
    waDisplayNumber = meta.display_number ?? ''
    waSystemPrompt = meta.system_prompt ?? ''
  }

  let xphereBaseUrl = ''
  if (category.showXphereConfig) {
    const svc = requireServiceClient()
    const { data } = await svc
      .from('platform_integrations')
      .select('metadata')
      .eq('provider', 'xphere')
      .maybeSingle()
    xphereBaseUrl = (data?.metadata as { base_url?: string } | null)?.base_url ?? ''
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

      {category.showXphereConfig && (
        <XphereConfigForm current={xphereBaseUrl} />
      )}

      {category.showWhatsAppConfig && (
        <>
          <WhatsAppConfigForm
            currentPhoneNumberId={waPhoneNumberId}
            currentWabaId={waWabaId}
            currentDisplayNumber={waDisplayNumber}
          />
          <WhatsAppSystemPromptForm currentPrompt={waSystemPrompt} />
        </>
      )}
    </div>
  )
}
