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
  it('renders a thumbnail with the registry src and "<label> template preview" alt for each template', () => {
    render(<EstimateTemplatePicker value="classic" onValueChange={() => {}} />)
    for (const tpl of ESTIMATE_TEMPLATES) {
      const img = screen.getByAltText(`${tpl.label} template preview`) as HTMLImageElement
      expect(img.getAttribute('src')).toBe(tpl.thumbnail)
      expect(img.getAttribute('width')).toBe('480')
      expect(img.getAttribute('height')).toBe('621')
    }
  })

  it('keeps radio semantics: checked state follows value and clicking the other option fires onValueChange', () => {
    const onValueChange = vi.fn()
    render(<EstimateTemplatePicker value="classic" onValueChange={onValueChange} />)
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(ESTIMATE_TEMPLATES.length)
    expect(screen.getByRole('radio', { name: /Classic/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: /Modern/ }).getAttribute('aria-checked')).toBe('false')
    fireEvent.click(screen.getByRole('radio', { name: /Modern/ }))
    expect(onValueChange).toHaveBeenCalledWith('modern')
  })

  it('clicking the thumbnail (inside the label) selects that template', () => {
    function Harness() {
      const [value, setValue] = useState('classic')
      return <EstimateTemplatePicker value={value} onValueChange={setValue} />
    }
    render(<Harness />)
    fireEvent.click(screen.getByAltText('Modern template preview'))
    expect(screen.getByRole('radio', { name: /Modern/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: /Classic/ }).getAttribute('aria-checked')).toBe('false')
  })
})
