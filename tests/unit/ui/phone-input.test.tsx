import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { PhoneInput } from '@/components/ui/phone-input'

// nucleo-flags ships SVG components that jsdom doesn't need — stub the exact
// named exports phone-input.tsx imports, so the suite stays fast and
// independent of the flag package's build output.
vi.mock('nucleo-flags', () => {
  const Stub = () => null
  return {
    IconArgentina: Stub,
    IconAustralia: Stub,
    IconBrazil: Stub,
    IconCanada: Stub,
    IconChile: Stub,
    IconColombia: Stub,
    IconFrance: Stub,
    IconGermany: Stub,
    IconIndia: Stub,
    IconItaly: Stub,
    IconJapan: Stub,
    IconMexico: Stub,
    IconNetherlands: Stub,
    IconPortugal: Stub,
    IconSpain: Stub,
    IconUnitedKingdom: Stub,
    IconUnitedStates: Stub,
    IconUruguay: Stub,
  }
})

// Regression guard for the country-code paste bug: PhoneInput's text field holds
// the NATIONAL number (the dial code lives in the country select). Pasting a
// number that already carried its country code used to strip non-digits and
// truncate to maxDigits, swallowing the dial code into the national part:
//
//   "15082058040" → slice(0,10) → "1508205804" → "(150) 820-5804"
//
// "150" is an impossible NANP area code (area codes never start with 0 or 1), so
// the field silently produced an invalid number. Twilio rejects it (error 21212)
// and, because lib/sms/client.ts fails soft, the SMS just vanished. This affected
// EVERY PhoneInput call site (clients, onboarding, settings, profile, Twilio).

function setup(initial = '') {
  const onChange = vi.fn()
  const utils = render(<PhoneInput value={initial} onChange={onChange} />)
  const input = utils.container.querySelector('input[type="tel"]') as HTMLInputElement
  return { input, onChange }
}

describe('PhoneInput — country-code paste tolerance', () => {
  it('bare paste WITH dial code (no +) drops the dial instead of truncating', () => {
    const { input, onChange } = setup()
    fireEvent.change(input, { target: { value: '15082058040' } })
    expect(input.value).toBe('(508) 205-8040')
    expect(onChange).toHaveBeenLastCalledWith('+1 (508) 205-8040')
  })

  it('full E.164 paste (with +) reparses instead of truncating', () => {
    const { input, onChange } = setup()
    fireEvent.change(input, { target: { value: '+15082058040' } })
    expect(input.value).toBe('(508) 205-8040')
    expect(onChange).toHaveBeenLastCalledWith('+1 (508) 205-8040')
  })

  it('formatted paste (+1 (508) 205-8040) round-trips unchanged', () => {
    const { input, onChange } = setup()
    fireEvent.change(input, { target: { value: '+1 (508) 205-8040' } })
    expect(input.value).toBe('(508) 205-8040')
    expect(onChange).toHaveBeenLastCalledWith('+1 (508) 205-8040')
  })

  it('never renders the impossible "(150)" area code for the reported input', () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: '15082058040' } })
    expect(input.value).not.toContain('(150)')
    expect(input.value.startsWith('(1')).toBe(false)
  })

  it('plain 10-digit national typing is unaffected', () => {
    const { input, onChange } = setup()
    fireEvent.change(input, { target: { value: '5082058040' } })
    expect(input.value).toBe('(508) 205-8040')
    expect(onChange).toHaveBeenLastCalledWith('+1 (508) 205-8040')
  })

  it('progressive typing still masks digit-by-digit (no dial stripping mid-entry)', () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: '5' } })
    expect(input.value).toBe('(5')
    fireEvent.change(input, { target: { value: '508' } })
    expect(input.value).toBe('(508')
  })

  it('clearing the field emits empty, not a bare dial code', () => {
    const { input, onChange } = setup()
    fireEvent.change(input, { target: { value: '5082058040' } })
    fireEvent.change(input, { target: { value: '' } })
    expect(input.value).toBe('')
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('does NOT strip a national number that merely starts with the dial digits (BR DDD 55)', () => {
    // Seed BR via the value prop, then type a DDD-55 national number. It is not
    // over-long, so the dial-strip guard must leave it completely alone.
    const { input } = setup('+5511987654321')
    fireEvent.change(input, { target: { value: '5599999999' } })
    expect(input.value).toBe('(55) 99999-999')
    expect(input.value.startsWith('(99')).toBe(false)
  })

  it('BR: full E.164 paste drops the 55 dial code correctly', () => {
    const { input, onChange } = setup('+5511987654321')
    fireEvent.change(input, { target: { value: '5511987654321' } })
    expect(input.value).toBe('(11) 98765-4321')
    expect(onChange).toHaveBeenLastCalledWith('+55 (11) 98765-4321')
  })
})
