import { describe, it } from 'vitest'

// Wave 0 scaffold — Phase 162 plan 162-04 converts these to real tests when
// it creates `components/workspace/estimate/presentation-settings-panel.tsx`
// per DOCUX-01. GUARD-03 static-grep tests are grep commands in the plan's
// acceptance criteria, not test file assertions — see 162-VALIDATION.md L44.

describe('PresentationSettingsPanel (DOCUX-01)', () => {
  it.todo('responsive branch — renders Popover when window matches (min-width: 768px)')
  it.todo('responsive branch — renders Sheet side="bottom" when window is <768px')
  it.todo('dispatches UPDATE_PRESENTATION_SETTINGS on section-visibility Switch toggle')
  it.todo('dispatches UPDATE_PRESENTATION_SETTINGS on Tax mode RadioGroup change')
  it.todo('dispatches UPDATE_PRESENTATION_SETTINGS on Discount mode RadioGroup change')
  it.todo('dispatches UPDATE_PRESENTATION_SETTINGS on Deposit mode RadioGroup change')
  it.todo('never dispatches UPDATE_TAX_RATE / UPDATE_DISCOUNT / UPDATE_DEPOSIT (GUARD-03 — enforced statically via grep in plan acceptance criteria)')
  it.todo('sent or viewed notice — renders amber banner when estimateSentOrViewed=true')
  it.todo('sent or viewed notice — hidden when estimateSentOrViewed=false')
  it.todo('Tax mode "off" writes { tax: { mode: "off", preservedRate: <current> } } — never mutates tax_rate to 0')
  it.todo('section visibility toggle preserves other section states (immutable merge)')
})
