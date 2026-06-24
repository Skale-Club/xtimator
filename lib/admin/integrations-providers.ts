import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { decrypt } from '@/lib/crypto/aes'
import type { IntegrationProvider } from '@/lib/platform-config'
import type { IntegrationCardInitial } from '@/app/admin/integrations/integration-card'

/**
 * Single source of truth for integration provider catalog.
 *
 * Structured as CATEGORIES (URL segments) containing one or more PROVIDERS
 * (individual cards). The AI category groups Anthropic + Gemini + OpenAI and
 * renders the active-provider selector inline.
 */
type Provider = {
  id: IntegrationProvider
  title: string
  description: string
}

export type Category = {
  slug: string
  title: string
  /** Short label shown in the nav (defaults to title). */
  navLabel?: string
  description?: string
  providers: ReadonlyArray<Provider>
  /** AI category renders the active-provider selector below the cards. */
  showAISelector?: boolean
  /** SMS/Twilio category renders the from-phone field below the cards. */
  showFromPhone?: boolean
  /** WhatsApp category renders the Phone Number ID + WABA ID fields below the cards. */
  showWhatsAppConfig?: boolean
  /** CRM/Xphere category renders the base-URL field below the cards. */
  showXphereConfig?: boolean
  /** Price-research category renders the source/engine config card below the cards. */
  showPriceResearchConfig?: boolean
  /** Billing category renders the billing-parameters config form below. */
  showBillingConfig?: boolean
}

export const CATEGORIES: ReadonlyArray<Category> = [
  {
    slug: 'ai',
    title: 'AI Providers',
    navLabel: 'AI',
    description:
      'Models for estimate generation, photo analysis, and audio transcription. Switch active provider for LLM tasks below.',
    showAISelector: false,
    providers: [
      {
        id: 'openrouter' as IntegrationProvider,
        title: 'OpenRouter',
        description:
          'Single API key, hundreds of models. Routes all AI tasks (estimate generation, photo analysis, audio transcription) through OpenRouter.',
      },
    ],
  },
  {
    slug: 'email',
    title: 'Email',
    description: 'Transactional email delivery (estimate sends, payment receipts, notifications).',
    providers: [
      {
        id: 'resend' as IntegrationProvider,
        title: 'Resend',
        description: 'Transactional email delivery (estimate sends, notifications).',
      },
    ],
  },
  {
    slug: 'whatsapp',
    title: 'WhatsApp',
    description: 'Inbound message handling and estimate delivery via WhatsApp.',
    showWhatsAppConfig: true,
    providers: [
      {
        id: 'meta_whatsapp' as IntegrationProvider,
        title: 'Meta WhatsApp',
        description:
          'WhatsApp Cloud API token for inbound message handling and estimate delivery.',
      },
    ],
  },
  {
    slug: 'payments',
    title: 'Payments',
    description: 'Enable tenant Stripe connections so service businesses can accept card payments on shared estimates.',
    providers: [
      {
        id: 'stripe_connect_client_id' as IntegrationProvider,
        title: 'Stripe Connect Client ID',
        description:
          'ca_... value from Stripe Dashboard → Connect → Settings. Enables tenant Stripe connections for customer payments on estimates.',
      },
    ],
  },
  {
    slug: 'sms',
    title: 'SMS',
    description: 'Send estimate share links to clients via SMS.',
    showFromPhone: true,
    providers: [
      {
        id: 'twilio' as IntegrationProvider,
        title: 'Twilio',
        description:
          'Enter as "AccountSid:AuthToken". Set the outbound phone number in the From Phone field below after saving.',
      },
    ],
  },
  {
    slug: 'crm',
    title: 'CRM',
    description: 'Mirror every company into the Xphere CRM (Account + Contact + Opportunity).',
    showXphereConfig: true,
    providers: [
      {
        id: 'xphere' as IntegrationProvider,
        title: 'Xphere',
        description:
          'API key (xph_… token, scope sync:write) for the Xphere Xtimator org. Set the base URL below.',
      },
    ],
  },
  {
    slug: 'price-research',
    title: 'Price Research',
    navLabel: 'Price Research',
    description:
      'Researched regional pricing for estimate items with no price-book match. Reuses the configured OpenRouter / Anthropic key — no separate API key.',
    showPriceResearchConfig: true,
    providers: [],
  },
  {
    slug: 'billing',
    title: 'Billing',
    navLabel: 'Billing',
    description:
      'Platform billing parameters — markup, credit denomination, per-tier grants and prices, top-up packs, Whisper rate, estimate fee %, low-balance thresholds. Applied at runtime, no redeploy. Tenants never see these controls. Defaults are illustrative — calibrate before charging (CALIB-02).',
    showBillingConfig: true,
    providers: [],
  },
] as const

export const DEFAULT_CATEGORY_SLUG = CATEGORIES[0].slug

export function findCategoryBySlug(slug: string): Category | null {
  return CATEGORIES.find((c) => c.slug === slug) ?? null
}

// ───────────────────────────── data loader ─────────────────────────────

function toBuffer(value: ArrayBuffer | Uint8Array | string): Buffer {
  if (typeof value === 'string') {
    if (value.startsWith('\\x')) return Buffer.from(value.slice(2), 'hex')
    return Buffer.from(value, 'base64')
  }
  return Buffer.from(value as ArrayBuffer)
}

/**
 * Load encrypted-key state for ALL providers in a category in parallel.
 * Returns a map keyed by provider id with `{ configured, last4, updatedAt, updatedByEmail }`.
 * Server-only — never exposes plaintext to the client.
 */
export async function loadCategoryInitials(
  category: Category
): Promise<Map<IntegrationProvider, IntegrationCardInitial>> {
  const svc = requireServiceClient()
  const ids = category.providers.map((p) => p.id)
  const { data: rows } = await svc
    .from('platform_integrations')
    .select('provider, ciphertext, iv, auth_tag, updated_at, updated_by')
    .in('provider', ids)

  // Collect unique non-null updated_by user IDs from all rows
  const updatedByIds = [
    ...new Set(
      (rows ?? [])
        .filter((r): r is typeof r & { updated_by: string } => !!r.updated_by)
        .map((r) => r.updated_by)
    ),
  ]

  // One getUserById call per unique admin (typically 1-2 across all integrations)
  const userEmailMap = new Map<string, string>()
  await Promise.all(
    updatedByIds.map(async (uid) => {
      const { data: u } = await svc.auth.admin.getUserById(uid)
      if (u?.user?.email) userEmailMap.set(uid, u.user.email)
    })
  )

  const result = new Map<IntegrationProvider, IntegrationCardInitial>()
  await Promise.all(
    (rows ?? []).map(async (r) => {
      if (!r.ciphertext || !r.iv || !r.auth_tag) {
        result.set(r.provider as IntegrationProvider, { configured: false })
        return
      }
      try {
        const plaintext = decrypt({
          ciphertext: toBuffer(r.ciphertext as never),
          iv: toBuffer(r.iv as never),
          authTag: toBuffer(r.auth_tag as never),
        })
        let updatedByEmail = ''
        if (r.updated_by) {
          updatedByEmail = userEmailMap.get(r.updated_by) ?? ''
        }
        result.set(r.provider as IntegrationProvider, {
          configured: true,
          last4: plaintext.slice(-4),
          updatedAt: r.updated_at,
          updatedByEmail,
        })
      } catch {
        result.set(r.provider as IntegrationProvider, { configured: false })
      }
    })
  )
  // Ensure every provider has an entry (default to unconfigured)
  for (const p of category.providers) {
    if (!result.has(p.id)) result.set(p.id, { configured: false })
  }
  return result
}
