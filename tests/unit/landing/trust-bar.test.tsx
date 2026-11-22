import { describe, it, expect, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import { TrustBar, buildTrustStats } from '@/components/landing/trust-bar'

beforeAll(() => {
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO
})

describe('TrustBar', () => {
  it('renders nothing without stats', () => {
    expect(render(<TrustBar stats={null} />).container.firstChild).toBeNull()
    expect(render(<TrustBar />).container.firstChild).toBeNull()
    expect(
      render(<TrustBar stats={{ contractors: null, estimatesSent: null, medianMinutes: null }} />).container.firstChild,
    ).toBeNull()
  })

  it('hides missing stats and shows only the available labels', () => {
    const { container } = render(<TrustBar stats={{ contractors: 15, estimatesSent: null, medianMinutes: null }} />)
    expect(container.textContent).toContain('Contractors')
    expect(container.textContent).not.toContain('Estimates sent')
    expect(container.textContent).not.toContain('Stars')
  })

  it('maps the real values with no suffix inflation and no hard-coded numbers', () => {
    expect(buildTrustStats({ contractors: 15, estimatesSent: 15, medianMinutes: 3 })).toEqual([
      { value: 15, suffix: '', label: 'Contractors' },
      { value: 15, suffix: '', label: 'Estimates sent' },
      { value: 3, suffix: ' min', label: 'Median time to an estimate' },
    ])
    const { container } = render(<TrustBar stats={{ contractors: 3, estimatesSent: null, medianMinutes: null }} />)
    expect(container.textContent).not.toContain('+')
    expect(container.textContent).not.toContain('500')
  })
})
