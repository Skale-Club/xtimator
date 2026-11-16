import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/lib/i18n/use-translation', () => ({ useTranslation: () => ({ t: (s: string) => s, language: 'en' }) }))

import { CaptureNeedsDetails } from '@/components/capture/capture-needs-details'

describe('CaptureNeedsDetails', () => {
  it('panel (default) shows the Record again button only when a handler is passed', () => {
    const onRecordAgain = vi.fn()
    const { rerender } = render(
      <CaptureNeedsDetails fallbackMessage="fallback" questions={['How many m2?']} onRecordAgain={onRecordAgain} />,
    )
    fireEvent.click(screen.getByTestId('capture-needs-details-record-again'))
    expect(onRecordAgain).toHaveBeenCalledTimes(1)
    rerender(<CaptureNeedsDetails fallbackMessage="fallback" questions={['How many m2?']} />)
    expect(screen.queryByTestId('capture-needs-details-record-again')).toBeNull()
  })

  it('inline shows the header and the questions verbatim, with no button', () => {
    render(
      <CaptureNeedsDetails
        variant="inline"
        fallbackMessage="fallback"
        questions={['How many m2?', 'Who buys the paint?']}
        onRecordAgain={() => {}}
      />,
    )
    const root = screen.getByTestId('capture-needs-details')
    expect(root).toHaveTextContent('A few details are missing to price this')
    expect(root).toHaveTextContent('How many m2?')
    expect(root).toHaveTextContent('Who buys the paint?')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('inline covers the mic_test and fallback messages', () => {
    const { rerender } = render(<CaptureNeedsDetails variant="inline" reason="mic_test" fallbackMessage="fallback" />)
    expect(screen.getByTestId('capture-needs-details')).toHaveTextContent('mic test')
    rerender(<CaptureNeedsDetails variant="inline" fallbackMessage="fallback" />)
    expect(screen.getByTestId('capture-needs-details')).toHaveTextContent('fallback')
  })
})
