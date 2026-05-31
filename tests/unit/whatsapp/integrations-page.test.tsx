import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// next/link reads router config at import in jsdom; mock to a plain anchor (repo convention).
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

// Mock the client card so we can inspect the `initial` prop without its internals.
vi.mock('@/components/settings/whatsapp-connect-card', () => ({
  WhatsAppConnectCard: vi.fn(({ initial }: { initial: unknown }) => (
    <div data-testid="wa-card">{JSON.stringify(initial)}</div>
  )),
}))

// <T> is a client component; render its child verbatim for deterministic copy assertions.
vi.mock('@/components/i18n/t', () => ({
  T: ({ children, text }: { children?: string; text?: string }) => <>{text ?? children}</>,
}))

const getActiveCompanyId = vi.fn()
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: () => getActiveCompanyId(),
}))

const maybeSingle = vi.fn()
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: () => maybeSingle(),
        })),
      })),
    })),
  })),
}))

import SettingsIntegrationsPage from '@/app/(app)/settings/integrations/page'
import { WhatsAppConnectCard } from '@/components/settings/whatsapp-connect-card'

describe('Settings → Integrations page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getActiveCompanyId.mockResolvedValue('company-123')
    maybeSingle.mockResolvedValue({ data: null })
  })

  it('header copy: H1 reads "Integrations"', async () => {
    render(await SettingsIntegrationsPage())
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Integrations'
    )
  })

  it('header copy: subhead reads "Connect outbound channels and AI assistants."', async () => {
    render(await SettingsIntegrationsPage())
    expect(
      screen.getByText('Connect outbound channels and AI assistants.')
    ).toBeTruthy()
  })

  it('mounts WhatsAppConnectCard with initial={null} when company has no company_whatsapp row (not connected)', async () => {
    maybeSingle.mockResolvedValue({ data: null })
    render(await SettingsIntegrationsPage())
    expect(WhatsAppConnectCard).toHaveBeenCalledWith(
      expect.objectContaining({ initial: null }),
      undefined
    )
  })

  it('mounts WhatsAppConnectCard with initial={{...}} when company_whatsapp row exists (connected)', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        phone_number: '+15551234567',
        phone_number_id: '123',
        waba_id: '456',
        status: 'active',
        delivery_format: 'share_link',
      },
    })
    render(await SettingsIntegrationsPage())
    expect(WhatsAppConnectCard).toHaveBeenCalledWith(
      expect.objectContaining({
        initial: {
          phoneNumber: '+15551234567',
          phoneNumberId: '123',
          wabaId: '456',
          status: 'active',
          deliveryFormat: 'share_link',
        },
      }),
      undefined
    )
  })

  it('does NOT render the old "OpenRouter integration coming soon" placeholder text', async () => {
    render(await SettingsIntegrationsPage())
    expect(screen.queryByText(/OpenRouter/i)).toBeNull()
  })
})
