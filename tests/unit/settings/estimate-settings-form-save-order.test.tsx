// SEED-056: the Estimate defaults form saves through four actions, three of
// which read-merge-write companies.document_blocks. They must run so that the
// owner's explicit block switches (updateDocumentBlocks) are written LAST —
// in parallel the last writer would win at random.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, within } from '@testing-library/react'

const calls: string[] = []
const deferred = (name: string) =>
  vi.fn(async () => {
    calls.push(`${name}:start`)
    await new Promise((r) => setTimeout(r, 5))
    calls.push(`${name}:end`)
    return { success: true as const }
  })

const updateDefaults = deferred('defaults')
const updateEstimateTerms = deferred('terms')
const updateDeliverySettings = deferred('delivery')
const updateDocumentBlocks = deferred('blocks')

vi.mock('@/lib/actions/settings', () => ({
  updateDefaults: (...a: unknown[]) => updateDefaults(...(a as [])),
  updateEstimateTerms: (...a: unknown[]) => updateEstimateTerms(...(a as [])),
  updateDeliverySettings: (...a: unknown[]) => updateDeliverySettings(...(a as [])),
}))
vi.mock('@/lib/actions/document-blocks', () => ({
  updateDocumentBlocks: (...a: unknown[]) => updateDocumentBlocks(...(a as [])),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))

import { EstimateSettingsForm } from '@/components/settings/estimate-settings-form'
import type { CompanySettings } from '@/lib/queries/company'

const company = {
  default_tax_rate: 0.06,
  default_validity_days: 30,
  default_payment_terms: '50% deposit',
  default_warranty_terms: null,
  estimate_terms_enabled: false,
  estimate_terms_text: null,
  digital_signature_enabled: false,
  email_delivery_enabled: true,
  sms_delivery_enabled: false,
  document_blocks: null,
} as unknown as CompanySettings

describe('EstimateSettingsForm save order', () => {
  beforeEach(() => {
    calls.length = 0
    vi.clearAllMocks()
  })

  it('associates tax and validity labels and descriptions with their numeric inputs', () => {
    const { container } = render(<EstimateSettingsForm company={company} />)
    const form = within(container)
    for (const { name, description, value } of [
      { name: 'Tax rate', description: 'Filled in from your state during setup. Change it if your local rules differ.', value: '6' },
      { name: 'Valid for', description: 'How long the client has to accept after you create it.', value: '30' },
    ]) {
      const input = form.getByRole<HTMLInputElement>('spinbutton', { name, description })
      const label = input.labels?.item(0)
      expect(input.value).toBe(value)
      expect(input.id).not.toBe('')
      expect(label?.htmlFor).toBe(input.id)
      expect(label?.control).toBe(input)
      const descriptionId = input.getAttribute('aria-describedby')
      expect(document.getElementById(descriptionId ?? '')?.textContent).toBe(description)
    }
  })

  it('writes the explicit document blocks after every action that syncs block flags', async () => {
    const { container } = render(<EstimateSettingsForm company={company} />)
    // Turn the Timeline block on, then submit the form.
    const timelineSwitch = container.querySelector('#block-timeline') as HTMLElement
    fireEvent.click(timelineSwitch)
    await waitFor(() => expect(timelineSwitch.getAttribute('aria-checked')).toBe('true'))
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => expect(updateDocumentBlocks).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(calls).toContain('blocks:end'))

    const blocksStart = calls.indexOf('blocks:start')
    expect(calls.indexOf('defaults:end')).toBeLessThan(blocksStart)
    expect(calls.indexOf('terms:end')).toBeLessThan(blocksStart)
    expect(calls.indexOf('terms:start')).toBeGreaterThan(calls.indexOf('defaults:end'))
    expect(updateDocumentBlocks).toHaveBeenCalledWith(
      // Payment terms stay off until the owner switches them on (2026-11-18), even with text.
      expect.objectContaining({ timeline: true, payment_terms: false, warranty_terms: false })
    )
  })
})
