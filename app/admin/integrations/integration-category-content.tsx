import {
  getAiModelSettings,
  getOpenRouterDefaultModel,
  getTranscriptionModel,
} from '@/lib/platform-config'
import type { Category } from '@/lib/admin/integrations-providers'
import { loadCategoryInitials } from '@/lib/admin/integrations-providers'
import { loadPlatformEventToggles } from '@/lib/admin/platform-event-preferences'
import { requireServiceClient } from '@/lib/supabase/service'
import { T } from '@/components/i18n/t'

import { OpenRouterModelForm } from './openrouter-model-form'
import { ModelSlotsForm } from './model-slots-form'
import { TranscriptionModelSelector } from './transcription-model-selector'
import { IntegrationCard } from './integration-card'
import { TwilioFromPhoneForm } from './twilio-from-phone-form'
import { TwilioCustomerMessagingForm } from './twilio-customer-messaging-form'
import { WhatsAppConfigForm } from './whatsapp-config-form'
import { WhatsAppSystemPromptForm } from './whatsapp-system-prompt-form'
import { WhatsAppWelcomeForm } from './whatsapp-welcome-form'
import { XphereConfigForm } from './xphere-config-form'
import { XphereStatus } from './xphere-status'
import { TelegramChatIdForm } from './telegram-chat-id-form'
import { NotionAcademyForm } from './notion-academy-form'
import { PlatformEventTogglesForm } from './platform-event-toggles-form'
import { PriceResearchConfigForm } from './price-research-config-form'
import { DEFAULT_BILLING_CONFIG, getBillingConfig } from '@/lib/billing/billing-config'
import { aggregateAiCostByOperation, type OpCostStat } from '@/lib/billing/calibration'
import { BillingConfigForm } from './billing-config-form'
import { MeasuredCostCard } from './measured-cost-card'

type IntegrationCategoryContentProps = {
  category: Category
}

export async function IntegrationCategoryContent({
  category,
}: IntegrationCategoryContentProps) {
  const [initials, openRouterModel, transcriptionModel, aiSettings] =
    await Promise.all([
      loadCategoryInitials(category),
      category.showAISelector ? getOpenRouterDefaultModel() : Promise.resolve(null),
      category.showAISelector ? getTranscriptionModel() : Promise.resolve(null),
      category.showAISelector ? getAiModelSettings() : Promise.resolve(null),
    ])

  let twilioFromPhone = ''
  let twilioCustomerMessagingServiceSid = ''
  if (category.showFromPhone) {
    const svc = requireServiceClient()
    const { data } = await svc
      .from('platform_integrations')
      .select('metadata')
      .eq('provider', 'twilio')
      .maybeSingle()
    const meta =
      (data?.metadata as {
        from_phone?: string
        customer_messaging_service_sid?: string
      } | null) ?? {}
    twilioFromPhone = meta.from_phone ?? ''
    twilioCustomerMessagingServiceSid = meta.customer_messaging_service_sid ?? ''
  }

  let waPhoneNumberId = ''
  let waWabaId = ''
  let waDisplayNumber = ''
  let waSystemPrompt = ''
  let waWelcomeTemplates = { pt: '', en: '', es: '' }
  let waWelcomeVideos = { pt: '', en: '', es: '' }
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
        welcome_template_names?: Partial<Record<'pt' | 'en' | 'es', string>>
        welcome_video_urls?: Partial<Record<'pt' | 'en' | 'es', string>>
      } | null) ?? {}
    waPhoneNumberId = meta.phone_number_id ?? ''
    waWabaId = meta.waba_id ?? ''
    waDisplayNumber = meta.display_number ?? ''
    waSystemPrompt = meta.system_prompt ?? ''
    waWelcomeTemplates = {
      pt: meta.welcome_template_names?.pt ?? '',
      en: meta.welcome_template_names?.en ?? '',
      es: meta.welcome_template_names?.es ?? '',
    }
    waWelcomeVideos = {
      pt: meta.welcome_video_urls?.pt ?? '',
      en: meta.welcome_video_urls?.en ?? '',
      es: meta.welcome_video_urls?.es ?? '',
    }
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

  let notionCoursesDb = ''
  let notionLessonsDb = ''
  if (category.showNotionAcademyConfig) {
    const svc = requireServiceClient()
    const { data } = await svc
      .from('platform_integrations')
      .select('metadata')
      .eq('provider', 'notion')
      .maybeSingle()
    const meta = (data?.metadata as { courses_db?: string; lessons_db?: string } | null) ?? {}
    notionCoursesDb = meta.courses_db ?? ''
    notionLessonsDb = meta.lessons_db ?? ''
  }

  const platformEventToggles = category.showPlatformEventToggles
    ? await loadPlatformEventToggles()
    : []

  let priceResearch = {
    enabled: false,
    source: 'openrouter_web' as 'openrouter_web',
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
      // Legacy 'anthropic_web' resolves to the OpenRouter source (OpenRouter only).
      enabled: src === 'openrouter_web' || src === 'anthropic_web',
      source: 'openrouter_web' as const,
      engine: meta.research_engine === 'native' ? 'native' : 'exa',
    }
  }

  let billingConfig = DEFAULT_BILLING_CONFIG
  let costStats: OpCostStat[] = []
  if (category.showBillingConfig) {
    // Source the form's `current` from the canonical deep-merge reader so a
    // legacy billing_config row that predates the nested fields (entitlements /
    // featureBullets / stripePriceId*) still resolves every field from the
    // defaults — a shallow tier merge would drop those and crash the form's
    // useState initializer (research Pitfall 6).
    billingConfig = await getBillingConfig()
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
            keyParts={p.keyParts}
          />
        ))}
      </div>

      {category.showAISelector && (
        <div className="rounded-lg border border-border bg-card/40 p-4 md:p-6 space-y-4">
          <OpenRouterModelForm currentModel={openRouterModel} />
          <ModelSlotsForm
            models={aiSettings?.models ?? {}}
            escalation={aiSettings?.escalation ?? null}
          />
          <TranscriptionModelSelector current={transcriptionModel ?? 'openai/whisper-1'} />
        </div>
      )}

      {category.showFromPhone && (
        <>
          <TwilioFromPhoneForm current={twilioFromPhone} />
          <TwilioCustomerMessagingForm current={twilioCustomerMessagingServiceSid} />
        </>
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

      {category.showNotionAcademyConfig && (
        <NotionAcademyForm currentCoursesDb={notionCoursesDb} currentLessonsDb={notionLessonsDb} />
      )}

      {category.showPlatformEventToggles && (
        <PlatformEventTogglesForm initial={platformEventToggles} />
      )}

      {category.showWhatsAppConfig && (
        <>
          <WhatsAppConfigForm
            currentPhoneNumberId={waPhoneNumberId}
            currentWabaId={waWabaId}
            currentDisplayNumber={waDisplayNumber}
          />
          <WhatsAppSystemPromptForm currentPrompt={waSystemPrompt} />
          <WhatsAppWelcomeForm
            currentTemplateNames={waWelcomeTemplates}
            currentVideoUrls={waWelcomeVideos}
          />
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
