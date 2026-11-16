import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/i18n/use-translation', () => ({ useTranslation: () => ({ t: (s: string) => s, language: 'en' }) }))

import { RefineWorking } from '@/components/capture/refine-working'

function states() {
  return screen.getAllByRole('listitem').map((li) => li.getAttribute('data-state'))
}

describe('RefineWorking', () => {
  it('shows the saving step as active while saving', () => {
    render(<RefineWorking phase="saving" />)
    expect(screen.getByTestId('refine-busy')).toHaveTextContent('Preparing the changes')
    expect(screen.getByTestId('refine-busy')).toHaveTextContent('Nothing changes in the estimate until you approve')
    expect(states()).toEqual(['active', 'pending', 'pending'])
  })

  it('moves on to working out the changes while refining', () => {
    render(<RefineWorking phase="refining" />)
    expect(states()).toEqual(['done', 'active', 'pending'])
    expect(screen.getByText('Comparing with the current estimate')).toBeInTheDocument()
  })

  it('has no progress bar', () => {
    render(<RefineWorking phase="refining" />)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})
