import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { decrypt } from '@/lib/crypto/aes'
import type { IntegrationProvider } from '@/lib/platform-config'
import { getSelectedAIProvider } from '@/lib/platform-config'

import type { IntegrationCardInitial } from './integration-card'
import { IntegrationsTabs } from './integrations-tabs'
import { AIProviderSelector } from './ai-provider-selector'

const PROVIDERS: ReadonlyArray<{
  id: IntegrationProvider
  title: string
  description: string
}> = [
  {
    id: 'resend',
    title: 'Resend',
    description:
      'Transactional email delivery (estimate sends, notifications).',
  },
  {
    id: 'anthropic',
    title: 'Anthropic',
    description:
      'Claude models for estimate generation and photo analysis.',
  },
  {
    id: 'gemini',
    title: 'Google Gemini',
    description:
      'Gemini 2.5 Flash model (alternative to Claude for estimate generation).',
  },
  {
    id: 'openai',
    title: 'OpenAI',
    description: 'Whisper API for audio transcription.',
  },
  {
    id: 'meta_whatsapp',
    title: 'Meta WhatsApp',
    description: 'WhatsApp Cloud API token for inbound message handling and estimate delivery.',
  },
]

type IntegrationRow = {
  provider: string
  ciphertext: ArrayBuffer | Uint8Array | string
  iv: ArrayBuffer | Uint8Array | string
  auth_tag: ArrayBuffer | Uint8Array | string
  updated_at: string
  updated_by: string | null
}

function toBuffer(value: ArrayBuffer | Uint8Array | string): Buffer {
  if (typeof value === 'string') {
    // Supabase returns BYTEA as `\xHEX...` over PostgREST.
    if (value.startsWith('\\x')) {
      return Buffer.from(value.slice(2), 'hex')
    }
    // Fallback: base64
    return Buffer.from(value, 'base64')
  }
  return Buffer.from(value as ArrayBuffer)
}

export default async function IntegrationsPage() {
  await requireAdmin()
  const svc = requireServiceClient()

  const [{ data: rows }, activeProvider] = await Promise.all([
    svc
      .from('platform_integrations')
      .select('provider, ciphertext, iv, auth_tag, updated_at, updated_by'),
    getSelectedAIProvider(),
  ])

  const byProvider = new Map<IntegrationProvider, IntegrationCardInitial>()

  await Promise.all(
    (rows ?? [] as IntegrationRow[])
      .filter(r => r.provider !== 'ai_config')  // ai_config row has null ciphertext — skip decrypt (Pitfall 6)
      .map(async (r) => {
        try {
          const plaintext = decrypt({
            ciphertext: toBuffer(r.ciphertext),
            iv: toBuffer(r.iv),
            authTag: toBuffer(r.auth_tag),
          })
          let updatedByEmail = ''
          if (r.updated_by) {
            const { data: u } = await svc.auth.admin.getUserById(r.updated_by)
            updatedByEmail = u?.user?.email ?? ''
          }
          byProvider.set(r.provider as IntegrationProvider, {
            configured: true,
            last4: plaintext.slice(-4),
            updatedAt: r.updated_at,
            updatedByEmail,
          })
        } catch {
          // Decrypt failed — treat as unconfigured
        }
      })
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Integrations</h1>
        <p className="text-muted-foreground mt-1">
          Manage API keys for services shared across all tenants. Changes take effect within 60 seconds.
        </p>
      </div>
      <IntegrationsTabs
        providers={PROVIDERS.map((p) => ({
          ...p,
          initial: byProvider.get(p.id) ?? { configured: false },
        }))}
      />
      <AIProviderSelector current={activeProvider} />
    </div>
  )
}
