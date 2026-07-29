// The Send hub UI contract: link-first layout — online estimate is the hero
// action, the copy-ready message is visible inline, PDF download is secondary.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

const HUB_PATH = 'components/workspace/send/send-hub-dialog.tsx'

describe('SENDHUB-01/-06: SendHubDialog component contract', () => {
  it('the SendHubDialog component file exists', () => {
    expect(existsSync(HUB_PATH), `${HUB_PATH} must exist (created by 163-04)`).toBe(true)
  })

  const source = existsSync(HUB_PATH) ? readFileSync(HUB_PATH, 'utf8') : ''

  it('SendHubDialog exports the hub component', () => {
    expect(source).toMatch(/export\s+function\s+SendHubDialog\b/)
  })

  it('the hub keeps the three format surfaces keyed by testids (hero link, PDF footer action, inline message)', () => {
    expect(source).toContain('send-hub-card-online-link')
    expect(source).toContain('send-hub-card-pdf')
    expect(source).toContain('send-hub-card-plain-text')
  })

  it('the hub does not use the retired channel-first Tabs structure', () => {
    // The old channel-first form used <Tabs>. The hub must not.
    expect(source).not.toMatch(/from\s+['"]@\/components\/ui\/tabs['"]/)
  })

  it('the hub does not surface a "Share & Export" affordance (retired)', () => {
    expect(source).not.toMatch(/Share\s*&\s*Export/i)
  })

  it('the hub renders the LanguageFlagChip and never calls markAsSentAction (button dropped from the hub)', () => {
    expect(source).toMatch(/LanguageFlagChip/)
    expect(source).not.toMatch(/markAsSentAction\s*\(/)
  })

  it('the hub never dispatches in-app sends — share intents only, no fetch at all', () => {
    expect(source).not.toMatch(/\bfetch\s*\(/)
    expect(source).toMatch(/wa\.me/)
    expect(source).toMatch(/mailto:/)
    expect(source).toMatch(/sms:/)
  })

  it.todo('renders hero link, share-intent row, and inline message block (RTL smoke)')
})
