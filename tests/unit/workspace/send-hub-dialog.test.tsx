// Phase 163 (SENDHUB-01 + SENDHUB-06): the format-first Send hub UI contract.

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

  it('the hub has three format cards keyed by testids', () => {
    expect(source).toContain('send-hub-card-online-link')
    expect(source).toContain('send-hub-card-pdf')
    expect(source).toContain('send-hub-card-plain-text')
  })

  it('the hub does not use the retired channel-first Tabs structure', () => {
    // The old SendForm used <Tabs>. The hub must not.
    expect(source).not.toMatch(/from\s+['"]@\/components\/ui\/tabs['"]/)
  })

  it('the hub does not surface a "Share & Export" affordance (retired)', () => {
    expect(source).not.toMatch(/Share\s*&\s*Export/i)
  })

  it('the hub renders Mark as Sent + LanguageFlagChip (SENDHUB-06)', () => {
    expect(source).toMatch(/markAsSentAction/)
    expect(source).toMatch(/LanguageFlagChip/)
  })

  it.todo('renders three cards with per-card delivery action buttons (RTL smoke)')
  it.todo('Mark as Sent button click invokes markAsSentAction with the estimate id')
})
