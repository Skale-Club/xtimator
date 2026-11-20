import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { EditorDock, type EditorDockProps } from '@/components/workspace/editor-frame/editor-dock'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}))
// The real module drags in the whole New Xtimate wizard.
vi.mock('@/components/projects/new-project-dialog', () => ({
  editEstimateHref: (_qs: string, projectId: string) => `?edit=${projectId}`,
}))

afterEach(() => {
  cleanup()
  push.mockClear()
})

function renderDock(over: Partial<EditorDockProps> = {}) {
  const props: EditorDockProps = {
    projectId: 'p1',
    saving: false,
    locked: false,
    onShare: vi.fn(),
    viewMode: 'width',
    onViewModeChange: vi.fn(),
    ...over,
  }
  render(<EditorDock {...props} />)
  return props
}

describe('EditorDock', () => {
  it('Share calls onShare', () => {
    const props = renderDock()
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(props.onShare).toHaveBeenCalledTimes(1)
  })

  it('Share is disabled while saving', () => {
    renderDock({ saving: true })
    expect((screen.getByRole('button', { name: 'Share' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Edit with AI is enabled and navigates', () => {
    renderDock()
    const btn = screen.getByTestId('edit-with-ai-btn') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    fireEvent.click(btn)
    expect(push).toHaveBeenCalledWith('?edit=p1', { scroll: false })
  })

  it('Edit with AI is disabled when locked', () => {
    renderDock({ locked: true })
    expect((screen.getByTestId('edit-with-ai-btn') as HTMLButtonElement).disabled).toBe(true)
  })

  // Notices review stage 1: unanswered AI questions show as a small counter.
  it('Edit with AI shows the unanswered-question counter, and none at zero or when locked', () => {
    renderDock({ aiBadge: 2 })
    expect(screen.getByTestId('edit-with-ai-badge').textContent).toBe('2')
    cleanup()
    renderDock({ aiBadge: 0 })
    expect(screen.queryByTestId('edit-with-ai-badge')).toBeNull()
    cleanup()
    renderDock({ aiBadge: 3, locked: true })
    expect(screen.queryByTestId('edit-with-ai-badge')).toBeNull()
  })

  it('has no Options button without onOpenSettings', () => {
    renderDock()
    expect(screen.queryByRole('button', { name: 'Options' })).toBeNull()
  })

  it('renders Options and forwards the ref', () => {
    const onOpenSettings = vi.fn()
    const ref = { current: null as HTMLButtonElement | null }
    renderDock({ onOpenSettings, settingsButtonRef: ref })
    const btn = screen.getByRole('button', { name: 'Options' })
    expect(ref.current).toBe(btn)
    fireEvent.click(btn)
    expect(onOpenSettings).toHaveBeenCalled()
  })

  it('Photos only with onOpenPhotos', () => {
    renderDock()
    expect(screen.queryByRole('button', { name: 'Photos' })).toBeNull()
    cleanup()
    const onOpenPhotos = vi.fn()
    renderDock({ onOpenPhotos })
    fireEvent.click(screen.getByRole('button', { name: 'Photos' }))
    expect(onOpenPhotos).toHaveBeenCalled()
  })

  it('debug button only with onOpenDebug', () => {
    renderDock()
    expect(screen.queryByTestId('estimate-debug-trigger')).toBeNull()
    cleanup()
    const onOpenDebug = vi.fn()
    renderDock({ onOpenDebug })
    fireEvent.click(screen.getByTestId('estimate-debug-trigger'))
    expect(onOpenDebug).toHaveBeenCalled()
  })

  it('view-mode buttons call onViewModeChange and reflect aria-pressed', () => {
    const props = renderDock({ viewMode: 'width' })
    const width = screen.getByRole('button', { name: 'Full width view' })
    const page = screen.getByRole('button', { name: 'Paginated view' })
    expect(width.getAttribute('aria-pressed')).toBe('true')
    expect(page.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(page)
    expect(props.onViewModeChange).toHaveBeenCalledWith('page')
    fireEvent.click(width)
    expect(props.onViewModeChange).toHaveBeenCalledWith('width')
  })
})
