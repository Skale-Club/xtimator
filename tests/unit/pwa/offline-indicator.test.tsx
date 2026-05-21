import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OfflineIndicator } from '@/components/pwa/offline-indicator'

describe('OfflineIndicator', () => {
  it('renders null when navigator.onLine is true', () => {
    Object.defineProperty(navigator, 'onLine', { writable: true, value: true })
    const { container } = render(<OfflineIndicator />)
    expect(container.firstChild).toBeNull()
  })

  it('shows offline bar when offline', () => {
    Object.defineProperty(navigator, 'onLine', { writable: true, value: false })
    render(<OfflineIndicator />)
    expect(screen.getByText(/You're offline/i)).toBeTruthy()
  })
})
