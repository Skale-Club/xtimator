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

// <T> is a client component; render its child verbatim for deterministic copy assertions.
vi.mock('@/components/i18n/t', () => ({
  T: ({ children, text }: { children?: string; text?: string }) => <>{text ?? children}</>,
}))

vi.mock('@/lib/queries/auth', () => ({
  getAuthClaims: vi.fn(),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

const { getAuthClaims } = await import('@/lib/queries/auth')
const { requireServiceClient } = await import('@/lib/supabase/service')
import SettingsIntegrationsPage from '@/app/(app)/settings/integrations/page'

function mockSupabase(company: Record<string, unknown> | null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: company, error: null }),
    }),
  } as never
}

describe('Settings → Integrations page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAuthClaims).mockResolvedValue(null)
  })

  it('header copy: H1 reads "Integrations"', async () => {
    render(await SettingsIntegrationsPage())
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Integrations')
  })

  it('header copy: subhead reads "Connect the tools your business runs on."', async () => {
    render(await SettingsIntegrationsPage())
    expect(screen.getByText('Connect the tools your business runs on.')).toBeTruthy()
  })

  it('renders section headings "Collect payments" and "Developer tools"', async () => {
    render(await SettingsIntegrationsPage())
    expect(screen.getByText('Collect payments')).toBeTruthy()
    expect(screen.getByText('Developer tools')).toBeTruthy()
  })

  it('shows Stripe card as "Not connected" when user is unauthenticated', async () => {
    vi.mocked(getAuthClaims).mockResolvedValue(null)
    render(await SettingsIntegrationsPage())
    expect(screen.getByText('Not connected')).toBeTruthy()
  })

  it('shows Stripe card as "Not connected" when company has no active Stripe account', async () => {
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user-123' } as any)
    vi.mocked(requireServiceClient).mockReturnValue(
      mockSupabase({ stripe_account_id: null, stripe_connect_status: null })
    )
    render(await SettingsIntegrationsPage())
    expect(screen.getByText('Not connected')).toBeTruthy()
  })

  it('shows Stripe card as "Connected" when company has active Stripe account', async () => {
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user-123' } as any)
    vi.mocked(requireServiceClient).mockReturnValue(
      mockSupabase({ stripe_account_id: 'acct_abc', stripe_connect_status: 'active' })
    )
    render(await SettingsIntegrationsPage())
    expect(screen.getByText('Connected')).toBeTruthy()
  })

  it('renders MCP Server card with Beta badge', async () => {
    render(await SettingsIntegrationsPage())
    expect(screen.getByText('MCP Server')).toBeTruthy()
    expect(screen.getByText('Beta')).toBeTruthy()
  })

  it('does not render any WhatsApp credential inputs', async () => {
    render(await SettingsIntegrationsPage())
    expect(screen.queryByLabelText(/phone number/i)).toBeNull()
    expect(screen.queryByLabelText(/phone number id/i)).toBeNull()
    expect(screen.queryByLabelText(/waba id/i)).toBeNull()
  })

  it('does NOT render the old "OpenRouter integration coming soon" placeholder text', async () => {
    render(await SettingsIntegrationsPage())
    expect(screen.queryByText(/OpenRouter integration coming soon/i)).toBeNull()
  })
})
