import {
  getOpenRouterDefaultModel,
  getTranscriptionModel,
} from '@/lib/platform-config'
import type { Category } from '@/lib/admin/integrations-providers'
import { loadCategoryInitials } from '@/lib/admin/integrations-providers'
import { requireServiceClient } from '@/lib/supabase/service'
import { T } from '@/components/i18n/t'

import { OpenRouterModelForm } from './openrouter-model-form'
import { TranscriptionModelSelector } from './transcription-model-selector'
import { IntegrationCard } from './integration-card'
import { TwilioFromPhoneForm } from './twilio-from-phone-form'
import { WhatsAppConfigForm } from './whatsapp-config-form'
import { WhatsAppSystemPromptForm } from './whatsapp-system-prompt-form'
import { XphereConfigForm } from './xphere-config-form'
import { XphereStatus } from './xphere-status'
import { TelegramChatIdForm } from './telegram-chat-id-form'
import { PriceResearchConfigForm } from './price-research-config-form'
import { DEFAULT_BILLING_CONFIG } from '@/lib/billing/billing-config'
import { aggregateAiCostByOperation, type OpCostStat } from '@/lib/billing/calibration'
import { BillingConfigForm } from './billing-config-form'
import { MeasuredCostCard } from './measured-cost-card'

type IntegrationCategoryContentProps = {
  category: Category
}

export async function IntegrationCategoryContent({
  category,
}: IntegrationCategoryContentProps) {
  const [initials, openRouterModel, transcriptionModel] =
    await Promise.all([
      loadCategoryInitials(category),
      category.showAISelector ? getOpenRouterDefaultModel() : Promise.resolve(null),
      category.showAISelector ? getTranscriptionModel() : Promise.resolve(null),
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

  let telegramChatId = ''
  if (category.showTelegramConfig) {
    const svc = requireServiceClient()
    const { data } = await svc
      .from('platform_integrations')
      .select('metadata')
      .eq('provider', 'telegram')
      .maybeSingle()
    telegramChatId = (data?.metadata as { chat_id?: string } | null)?.chat_id ?? ''
  }

  let priceResearch = {
    enabled: false,
    source: 'openrouter_web' as 'openrouter_web' | 'anthropic_web',
    engine: 'exa' as 'exa' | 'native',
  }
  if (category.showPriceResearchConfig) {
    const svc = requireServiceClient()
    const { data } = await svc
      .from('platform_integrations')
      .select('metadata')
      .eq('provider', 'price_research')
      .maybeSingle()
    const meta =
      (data?.metadata as { research_source?: string; research_engine?: string } | null) ?? {}
    const src = meta.research_source
    priceResearch = {
      enabled: src === 'openrouter_web' || src === 'anthropic_web',
      source: src === 'anthropic_web' ? 'anthropic_web' : 'openrouter_web',
      engine: meta.research_engine === 'native' ? 'native' : 'exa',
    }
  }

  let billingConfig = DEFAULT_BILLING_CONFIG
  let costStats: OpCostStat[] = []
  if (category.showBillingConfig) {
    const svc = requireServiceClient()
    const { data } = await svc
      .from('platform_integrations')
      .select('metadata')
      .eq('provider', 'billing_config')
      .maybeSingle()
    const stored = (data?.metadata as Partial<typeof DEFAULT_BILLING_CONFIG> | null) ?? null
    billingConfig = stored
      ? {
          ...DEFAULT_BILLING_CONFIG,
          ...stored,
          tiers: { ...DEFAULT_BILLING_CONFIG.tiers, ...(stored.tiers ?? {}) },
        }
      : DEFAULT_BILLING_CONFIG
    // Measured real cost → shown next to the config so numbers are set against
    // data, not guesses (empty until real generations exist).
    costStats = await aggregateAiCostByOperation()
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

      {category.showAISelector && (
        <div className="rounded-lg border border-border bg-card/40 p-4 md:p-6 space-y-4">
          <OpenRouterModelForm currentModel={openRouterModel} />
          <TranscriptionModelSelector current={transcriptionModel ?? 'openai/whisper-1'} />
        </div>
      )}

      {category.showFromPhone && (
        <TwilioFromPhoneForm current={twilioFromPhone} />
      )}

      {category.showXphereConfig && (
        <>
          <XphereConfigForm current={xphereBaseUrl} />
          <XphereStatus />
        </>
      )}

      {category.showTelegramConfig && (
        <TelegramChatIdForm current={telegramChatId} />
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

      {category.showPriceResearchConfig && (
        <PriceResearchConfigForm current={priceResearch} />
      )}

      {category.showBillingConfig && (
        <>
          <MeasuredCostCard
            stats={costStats}
            markup={billingConfig.markup}
            creditUnitUsd={billingConfig.creditUnitUsd}
          />
          <BillingConfigForm current={billingConfig} />
        </>
      )}
    </div>
  )
}
