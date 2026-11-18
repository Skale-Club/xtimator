// The Share estimate sheet contract: online estimate first (link, status, Copy
// link, Open, password), the ready message always visible, PDF as a text button
// at the end. No share intents: the owner pastes into their own apps.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

const HUB_PATH = 'components/workspace/send/send-hub-dialog.tsx'

describe('SendHubDialog component contract', () => {
  it('the SendHubDialog component file exists', () => {
    expect(existsSync(HUB_PATH), `${HUB_PATH} must exist`).toBe(true)
  })

  const source = existsSync(HUB_PATH) ? readFileSync(HUB_PATH, 'utf8') : ''

  it('SendHubDialog exports the hub component', () => {
    expect(source).toMatch(/export\s+function\s+SendHubDialog\b/)
  })

  it('keeps the format surfaces keyed by testids (online link card, PDF action, ready message)', () => {
    expect(source).toContain('send-hub-card-online-link')
    expect(source).toContain('send-hub-card-pdf')
    expect(source).toContain('send-hub-card-plain-text')
  })

  it('does not use the retired channel-first Tabs structure or a "Share & Export" affordance', () => {
    expect(source).not.toMatch(/from\s+['"]@\/components\/ui\/tabs['"]/)
    expect(source).not.toMatch(/Share\s*&\s*Export/i)
  })

  it('never calls markAsSentAction and never dispatches in-app sends (no fetch)', () => {
    expect(source).not.toMatch(/markAsSentAction\s*\(/)
    expect(source).not.toMatch(/\bfetch\s*\(/)
  })

  it('has no share intents: no WhatsApp, mailto, sms or native share', () => {
    expect(source).not.toContain('wa.me')
    expect(source).not.toContain('mailto:')
    expect(source).not.toContain('sms:')
    expect(source).not.toContain('navigator.share')
    expect(source).not.toMatch(/DropdownMenu/)
    expect(source).not.toMatch(/LanguageFlagChip/)
    expect(source).not.toMatch(/smsDeliveryEnabled|whatsappEnabled/)
  })

  it('uses the shared bottom sheet (draggable on phones) with the New Xtimate surface', () => {
    expect(source).toContain('BottomSheetContent')
    expect(source).toContain('nx-surface')
    expect(source).toContain('sm:max-w-[580px]')
    expect(source).toContain('data-sheet-drag')
  })

  it('routes every visible string through t()', () => {
    expect(source).toContain("from '@/lib/i18n/use-translation'")
    expect(source).toMatch(/t\('Copy link'\)/)
    expect(source).toMatch(/t\('Download PDF'\)/)
  })

  // Optional password lock on the share link, rendered inside the link card.
  it('renders the SharePasswordControl block inside the online link card', () => {
    expect(source).toContain('send-hub-share-password')
    expect(source).toMatch(/function\s+SharePasswordControl\b/)
  })

  it('the password control calls setEstimateSharePassword (owner-side action), never writes the hash client-side', () => {
    expect(source).toMatch(/setEstimateSharePassword\s*\(/)
    expect(source).toMatch(/from\s+['"]@\/lib\/actions\/estimate['"]/)
  })

  it('shows a lock affordance when protected and an unlock affordance to remove it', () => {
    expect(source).toContain('Password protected')
    expect(source).toContain('Remove')
    expect(source).toContain('Add password')
  })

  it('refreshes the router after a successful set/remove so the header Insights lock badge stays in sync', () => {
    expect(source).toMatch(/router\.refresh\(\)/)
  })
})
