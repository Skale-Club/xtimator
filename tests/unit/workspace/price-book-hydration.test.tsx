import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { fireEvent, render, screen } from '@testing-library/react'
import { PriceBookCombobox } from '@/components/workspace/estimate/price-book-combobox'

const props = { value: 'Existing scope', onSelectPriceBookItem: vi.fn(), items: [], currencyCode: 'USD', placeholder: 'Item description' }

describe('controlled estimate descriptions are protected until hydration', () => {
  it.each([false, true])('server markup is disabled before handlers mount (multiline=%s)', multiline => {
    const html = renderToStaticMarkup(<PriceBookCombobox {...props} multiline={multiline} onChange={() => {}} />)
    expect(html).toMatch(/disabled=""/)
    expect(html).toContain('Existing scope')
  })

  it.each([false, true])('a client-only field is immediately usable and reports the replacement once (multiline=%s)', multiline => {
    const onChange = vi.fn()
    render(<PriceBookCombobox {...props} multiline={multiline} onChange={onChange} />)
    const field = screen.getByPlaceholderText('Item description')
    expect(field).not.toBeDisabled()
    fireEvent.change(field, { target: { value: 'Replacement scope' } })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('Replacement scope')
  })
})
