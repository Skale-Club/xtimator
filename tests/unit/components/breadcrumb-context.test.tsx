import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  BreadcrumbProvider,
  useBreadcrumb,
  useCurrentBreadcrumbs,
} from '@/components/app-shell/breadcrumb-context'

function InlineBreadcrumbPublisher({ name }: { name: string }) {
  // Deliberately create a new array on every render. This is the usage that
  // previously caused useEffect -> setBreadcrumbs -> render to loop forever.
  useBreadcrumb([
    { label: 'Projects', href: '/projects' },
    { label: name },
  ])

  return null
}

function BreadcrumbSnapshot() {
  const breadcrumbs = useCurrentBreadcrumbs()
  return (
    <output data-testid="breadcrumb-snapshot">
      {breadcrumbs.map(item => item.label).join(' / ')}
    </output>
  )
}

function Harness({ name, showPublisher = true }: {
  name: string
  showPublisher?: boolean
}) {
  return (
    <BreadcrumbProvider>
      {showPublisher && <InlineBreadcrumbPublisher name={name} />}
      <BreadcrumbSnapshot />
    </BreadcrumbProvider>
  )
}

describe('breadcrumb context', () => {
  it('does not republish semantically unchanged inline arrays', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(<Harness name="Kitchen remodel" />)

    for (let index = 0; index < 20; index += 1) {
      rerender(<Harness name="Kitchen remodel" />)
    }

    expect(screen.getByTestId('breadcrumb-snapshot').textContent)
      .toBe('Projects / Kitchen remodel')
    expect(
      consoleError.mock.calls.flat().some(
        message => String(message).includes('Maximum update depth exceeded'),
      ),
    ).toBe(false)

    consoleError.mockRestore()
  })

  it('publishes semantic changes and clears breadcrumbs on unmount', () => {
    const { rerender } = render(<Harness name="Kitchen remodel" />)

    rerender(<Harness name="Bathroom remodel" />)
    expect(screen.getByTestId('breadcrumb-snapshot').textContent)
      .toBe('Projects / Bathroom remodel')

    rerender(<Harness name="Bathroom remodel" showPublisher={false} />)
    expect(screen.getByTestId('breadcrumb-snapshot').textContent).toBe('')
  })
})
