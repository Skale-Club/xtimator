import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ClientPicker } from '@/components/clients/client-picker'
import { PhoneInput } from '@/components/ui/phone-input'

// Stage 3: on phones (< 640px) the search popovers open as the app's bottom
// sheet (data-bottom-sheet); from 640px up they stay popovers.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/actions/project', () => ({
  linkProjectToClient: vi.fn(),
  unlinkProjectFromClient: vi.fn(),
}))
vi.mock('nucleo-flags', () => {
  const Stub = () => null
  return {
    IconArgentina: Stub, IconAustralia: Stub, IconBrazil: Stub, IconCanada: Stub, IconChile: Stub,
    IconColombia: Stub, IconFrance: Stub, IconGermany: Stub, IconIndia: Stub, IconItaly: Stub,
    IconJapan: Stub, IconMexico: Stub, IconNetherlands: Stub, IconPortugal: Stub, IconSpain: Stub,
    IconUnitedKingdom: Stub, IconUnitedStates: Stub, IconUruguay: Stub,
  }
})

function mockPhone(isPhone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(max-width: 639px)' ? isPhone : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
}

beforeEach(() => {
  // cmdk scrolls the active item into view; jsdom has no scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn()
  global.fetch = vi.fn().mockResolvedValue({
    json: async () => [{ id: 'c1', name: 'Acme', email: null, phone: null }],
  }) as unknown as typeof fetch
})
afterEach(() => cleanup())

describe('phone overlays as bottom sheets', () => {
  it('ClientPicker opens a bottom sheet on phones', async () => {
    mockPhone(true)
    render(<ClientPicker projectId="p1" currentClientId={null} variant="button" />)
    fireEvent.click(screen.getByText('Link a client'))
    await waitFor(() => expect(document.querySelector('[data-bottom-sheet]')).not.toBeNull())
    expect(await screen.findByText('Acme')).toBeTruthy()
  })

  it('ClientPicker stays a popover on desktop', async () => {
    mockPhone(false)
    render(<ClientPicker projectId="p1" currentClientId={null} variant="button" />)
    fireEvent.click(screen.getByText('Link a client'))
    expect(await screen.findByText('Acme')).toBeTruthy()
    expect(document.querySelector('[data-bottom-sheet]')).toBeNull()
  })

  it('PhoneInput country picker opens a bottom sheet on phones', async () => {
    mockPhone(true)
    render(<PhoneInput value="" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Country:/ }))
    await waitFor(() => expect(document.querySelector('[data-bottom-sheet]')).not.toBeNull())
    expect(screen.getByPlaceholderText('Search country or code')).toBeTruthy()
  })

  it('PhoneInput country picker stays a popover on desktop', async () => {
    mockPhone(false)
    render(<PhoneInput value="" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Country:/ }))
    expect(await screen.findByPlaceholderText('Search country or code')).toBeTruthy()
    expect(document.querySelector('[data-bottom-sheet]')).toBeNull()
  })
})
