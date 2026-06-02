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

const getSelectedAIProvider = vi.fn()
vi.mock('@/lib/platform-config', () => ({
  getSelectedAIProvider: () => getSelectedAIProvider(),
}))

import SettingsIntegrationsPage from '@/app/(app)/settings/integrations/page'

describe('Settings → Integrations page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSelectedAIProvider.mockResolvedValue('anthropic')
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

  it('does NOT render the old "OpenRouter integration coming soon" placeholder text', async () => {
    render(await SettingsIntegrationsPage())
    expect(screen.queryByText(/OpenRouter integration coming soon/i)).toBeNull()
  })

  it('renders the three grouped section headings (AI, Messaging channels, Assistants)', async () => {
    render(await SettingsIntegrationsPage())
    expect(screen.getByText('AI')).toBeTruthy()
    expect(screen.getByText('Messaging channels')).toBeTruthy()
    expect(screen.getByText('Assistants')).toBeTruthy()
  })

  it('AI card shows the platform-selected estimate provider and Whisper for transcription', async () => {
    getSelectedAIProvider.mockResolvedValue('anthropic')
    render(await SettingsIntegrationsPage())
    expect(screen.getByText('Powering your estimates')).toBeTruthy()
    expect(screen.getByText('Claude (Anthropic)')).toBeTruthy()
    expect(screen.getByText('Whisper (OpenAI)')).toBeTruthy()
  })

  it('AI card reflects the active provider when it is not the default (no secrets rendered)', async () => {
    getSelectedAIProvider.mockResolvedValue('gemini')
    render(await SettingsIntegrationsPage())
    expect(screen.getByText('Gemini (Google)')).toBeTruthy()
  })

  it('Messaging channels section shows read-only Platform-managed WhatsApp card', async () => {
    render(await SettingsIntegrationsPage())
    expect(screen.getByText('WhatsApp')).toBeTruthy()
    expect(screen.getByText('Platform-managed')).toBeTruthy()
  })

  it('Messaging channels card explains no setup is required', async () => {
    render(await SettingsIntegrationsPage())
    expect(
      screen.getByText(/no setup required/i)
    ).toBeTruthy()
  })

  it('does not render any connect form or WhatsApp credential inputs', async () => {
    render(await SettingsIntegrationsPage())
    expect(screen.queryByLabelText(/phone number/i)).toBeNull()
    expect(screen.queryByLabelText(/phone number id/i)).toBeNull()
    expect(screen.queryByLabelText(/waba id/i)).toBeNull()
  })
})
