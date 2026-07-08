import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { PresentationSettings } from '@/lib/estimate/presentation-settings'

// Wave 4 (162-04) — DOCUX-01 PresentationSettingsPanel real assertions
// replacing the Wave 0 placeholder scaffolds. Every test targets the panel
// exported from `components/workspace/estimate/presentation-settings-panel.tsx`
// (Popover ≥768px / Sheet <768px branch, three control groups, GUARD-03).

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

// matchMedia mock — the panel's useIsDesktop hook reads
// window.matchMedia('(min-width: 768px)') on mount to pick Popover vs Sheet.
function mockMatchMedia(isDesktop: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(min-width: 768px)' ? isDesktop : false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated but stubbed for safety
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

beforeEach(() => {
  cleanup()
  mockMatchMedia(true) // default to desktop; individual tests override
})

// ---------------------------------------------------------------------------
// Dynamic import — after the mocks are hoisted the component still resolves
// its `useTranslation` binding through the vi.mock table above.
// ---------------------------------------------------------------------------

async function loadPanel() {
  const mod = await import(
    '@/components/workspace/estimate/presentation-settings-panel'
  )
  return mod.PresentationSettingsPanel
}

interface RenderOpts {
  settings?: PresentationSettings | null
  onChange?: (next: PresentationSettings) => void
  defaultTaxRate?: number
  estimateSentOrViewed?: boolean
  open?: boolean
}

async function renderPanel(opts: RenderOpts = {}) {
  const Panel = await loadPanel()
  const onChange = opts.onChange ?? vi.fn()
  const onOpenChange = vi.fn()
  const result = render(
    <Panel
      open={opts.open ?? true}
      onOpenChange={onOpenChange}
      settings={opts.settings ?? null}
      onChange={onChange}
      defaultTaxRate={opts.defaultTaxRate}
      estimateSentOrViewed={opts.estimateSentOrViewed ?? false}
    />,
  )
  return { ...result, onChange, onOpenChange }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PresentationSettingsPanel (DOCUX-01)', () => {
  it('responsive branch — renders Popover when window matches (min-width: 768px)', async () => {
    mockMatchMedia(true)
    await renderPanel()
    // The Radix Popover primitive uses a portal + data-slot="popover-content"
    // when open. Sheet portal exposes data-slot="sheet-content" instead.
    const popover = document.querySelector('[data-slot="popover-content"]')
    const sheet = document.querySelector('[data-slot="sheet-content"]')
    expect(popover).not.toBeNull()
    expect(sheet).toBeNull()
  })

  it('responsive branch — renders Sheet side="bottom" when window is <768px', async () => {
    mockMatchMedia(false)
    await renderPanel()
    const popover = document.querySelector('[data-slot="popover-content"]')
    const sheet = document.querySelector('[data-slot="sheet-content"]')
    expect(sheet).not.toBeNull()
    expect(popover).toBeNull()
    // Sheet must be pinned to the bottom edge (side="bottom" → inset-x-0 bottom-0).
    expect(sheet!.className).toContain('bottom-0')
  })

  it('dispatches UPDATE_PRESENTATION_SETTINGS on section-visibility Switch toggle', async () => {
    const onChange = vi.fn()
    await renderPanel({
      settings: { sections: { summary: true } },
      onChange,
    })
    // Summary section switch — labelled by "Summary" text
    const summarySwitch = document.querySelector<HTMLButtonElement>(
      '#section-summary',
    )
    expect(summarySwitch).not.toBeNull()
    fireEvent.click(summarySwitch!)
    expect(onChange).toHaveBeenCalledTimes(1)
    const payload = onChange.mock.calls[0][0] as PresentationSettings
    expect(payload.sections?.summary).toBe(false)
  })

  it('dispatches UPDATE_PRESENTATION_SETTINGS on Tax mode RadioGroup change', async () => {
    const onChange = vi.fn()
    await renderPanel({ settings: { tax: { mode: 'default' } }, onChange })
    const customRadio = document.getElementById(
      'tax-custom',
    ) as HTMLButtonElement | null
    expect(customRadio).not.toBeNull()
    fireEvent.click(customRadio!)
    expect(onChange).toHaveBeenCalled()
    const payload = onChange.mock.calls[0][0] as PresentationSettings
    expect(payload.tax?.mode).toBe('custom')
  })

  it('dispatches UPDATE_PRESENTATION_SETTINGS on Discount mode RadioGroup change', async () => {
    const onChange = vi.fn()
    await renderPanel({ settings: null, onChange })
    const percentRadio = document.getElementById(
      'disc-percent',
    ) as HTMLButtonElement | null
    expect(percentRadio).not.toBeNull()
    fireEvent.click(percentRadio!)
    expect(onChange).toHaveBeenCalled()
    const payload = onChange.mock.calls[0][0] as PresentationSettings
    expect(payload.discount?.enabled).toBe(true)
    expect(payload.discount?.type).toBe('percent')
  })

  it('dispatches UPDATE_PRESENTATION_SETTINGS on Deposit mode RadioGroup change', async () => {
    const onChange = vi.fn()
    await renderPanel({ settings: null, onChange })
    const amountRadio = document.getElementById(
      'dep-amount',
    ) as HTMLButtonElement | null
    expect(amountRadio).not.toBeNull()
    fireEvent.click(amountRadio!)
    expect(onChange).toHaveBeenCalled()
    const payload = onChange.mock.calls[0][0] as PresentationSettings
    expect(payload.deposit?.enabled).toBe(true)
    expect(payload.deposit?.type).toBe('amount')
  })

  it('never dispatches UPDATE_TAX_RATE / UPDATE_DISCOUNT / UPDATE_DEPOSIT (GUARD-03 runtime check)', async () => {
    const onChange = vi.fn()
    await renderPanel({ settings: null, onChange })
    // Fire every toggleable control we can reach; assert every onChange
    // payload is a plain PresentationSettings object (no `type` field, no
    // reducer-action shape). GUARD-03: the panel writes only through
    // UPDATE_PRESENTATION_SETTINGS at the caller boundary.
    fireEvent.click(document.getElementById('tax-custom')!)
    fireEvent.click(document.getElementById('disc-percent')!)
    fireEvent.click(document.getElementById('dep-amount')!)
    fireEvent.click(document.getElementById('section-summary')!)
    for (const call of onChange.mock.calls) {
      const arg = call[0]
      expect(typeof arg).toBe('object')
      // A reducer action would carry `type: 'UPDATE_TAX_RATE'|...`; we
      // must NEVER see any of those literal strings anywhere in the payload.
      const flat = JSON.stringify(arg)
      expect(flat).not.toMatch(/UPDATE_TAX_RATE/)
      expect(flat).not.toMatch(/UPDATE_DISCOUNT/)
      expect(flat).not.toMatch(/UPDATE_DEPOSIT/)
    }
  })

  it('sent or viewed notice — renders amber banner when estimateSentOrViewed=true', async () => {
    await renderPanel({ estimateSentOrViewed: true })
    // The banner text (Portuguese/EN passthrough via the mocked useTranslation
    // returns the source string verbatim). Match a distinctive substring so
    // the exact copy can evolve without breaking this test.
    const banner = screen.getByText(/already been seen/i)
    expect(banner).toBeTruthy()
    // Amber styling — the banner container should carry an amber background class
    const container = banner.closest('div')
    expect(container?.className).toMatch(/amber/)
  })

  it('sent or viewed notice — hidden when estimateSentOrViewed=false', async () => {
    await renderPanel({ estimateSentOrViewed: false })
    expect(screen.queryByText(/already been seen/i)).toBeNull()
  })

  it('Tax mode "off" writes { tax: { mode: "off", preservedRate: <current> } } — never mutates tax_rate to 0', async () => {
    const onChange = vi.fn()
    await renderPanel({
      settings: { tax: { mode: 'default' } },
      defaultTaxRate: 0.0725,
      onChange,
    })
    const offRadio = document.getElementById(
      'tax-off',
    ) as HTMLButtonElement | null
    expect(offRadio).not.toBeNull()
    fireEvent.click(offRadio!)
    expect(onChange).toHaveBeenCalled()
    const payload = onChange.mock.calls[0][0] as PresentationSettings
    expect(payload.tax?.mode).toBe('off')
    expect(payload.tax?.preservedRate).toBe(0.0725)
  })

  it('section visibility toggle preserves other section states (immutable merge)', async () => {
    const onChange = vi.fn()
    await renderPanel({
      settings: {
        sections: { summary: false, notes: false, timeline: true },
      },
      onChange,
    })
    const timelineSwitch = document.getElementById(
      'section-timeline',
    ) as HTMLButtonElement | null
    expect(timelineSwitch).not.toBeNull()
    fireEvent.click(timelineSwitch!)
    expect(onChange).toHaveBeenCalledTimes(1)
    const payload = onChange.mock.calls[0][0] as PresentationSettings
    // Timeline flipped, but summary/notes must survive the immutable merge.
    expect(payload.sections?.timeline).toBe(false)
    expect(payload.sections?.summary).toBe(false)
    expect(payload.sections?.notes).toBe(false)
  })
})
