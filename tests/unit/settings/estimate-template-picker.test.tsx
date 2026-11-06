import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'

import { EstimateTemplatePicker } from '@/components/settings/estimate-template-picker'
import { ESTIMATE_TEMPLATES } from '@/lib/estimate/templates/registry'

// t() returns the source English unchanged with no i18n provider (same
// convention as payments-disclosure.test.tsx).

describe('ESTIMATE_TEMPLATES thumbnails', () => {
  it('every template declares a public-path thumbnail', () => {
    for (const tpl of ESTIMATE_TEMPLATES) {
      expect(tpl.thumbnail).toBe(`/estimate-templates/${tpl.id}.webp`)
    }
  })
})

describe('EstimateTemplatePicker', () => {
  // Modern is on standby: the picker offers Classic only (registry untouched).
  const classic = ESTIMATE_TEMPLATES.find((tpl) => tpl.id === 'classic')!

  it('renders a thumbnail with the registry src and "<label> template preview" alt for Classic', () => {
    render(<EstimateTemplatePicker value="classic" onValueChange={() => {}} />)
    const img = screen.getByAltText(`${classic.label} template preview`) as HTMLImageElement
    expect(img.getAttribute('src')).toBe(classic.thumbnail)
    expect(img.getAttribute('width')).toBe('480')
    expect(img.getAttribute('height')).toBe('621')
  })

  it('offers only the Classic option', () => {
    render(<EstimateTemplatePicker value="classic" onValueChange={() => {}} />)
    expect(screen.getAllByRole('radio')).toHaveLength(1)
    expect(screen.getByRole('radio', { name: /Classic/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByRole('radio', { name: /Modern/ })).toBeNull()
    expect(screen.queryByAltText('Modern template preview')).toBeNull()
  })

  it('does not crash when the saved value is modern and fires onValueChange only on interaction', () => {
    const onValueChange = vi.fn()
    render(<EstimateTemplatePicker value="modern" onValueChange={onValueChange} />)
    expect(onValueChange).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: /Classic/ }).getAttribute('aria-checked')).toBe('false')
    fireEvent.click(screen.getByRole('radio', { name: /Classic/ }))
    expect(onValueChange).toHaveBeenCalledWith('classic')
  })

  it('clicking the thumbnail (inside the label) selects the template', () => {
    function Harness() {
      const [value, setValue] = useState('modern')
      return <EstimateTemplatePicker value={value} onValueChange={setValue} />
    }
    render(<Harness />)
    fireEvent.click(screen.getByAltText('Classic template preview'))
    expect(screen.getByRole('radio', { name: /Classic/ }).getAttribute('aria-checked')).toBe('true')
  })
})
