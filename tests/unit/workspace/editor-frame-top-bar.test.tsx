import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { useEffect } from 'react'
import { BreadcrumbProvider } from '@/components/app-shell/breadcrumb-context'
import {
  EstimateVersionProvider,
  useEstimateVersionSlot,
  type VersionSlot,
} from '@/components/workspace/estimate-version-context'
import { EditorTopBar } from '@/components/workspace/editor-frame/editor-top-bar'
import type { ProjectDetail } from '@/lib/queries/project'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/actions/project', () => ({ renameProjectAction: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

afterEach(cleanup)

const PROJECT = {
  id: 'p1',
  name: 'Two-bedroom repaint',
  client: { id: 'c1', name: 'Ava Thompson' },
} as unknown as ProjectDetail

function baseSlot(over: Partial<VersionSlot> = {}): VersionSlot {
  return {
    currentVersionId: 'e1',
    versions: [],
    version: 1,
    isDirty: false,
    isReadOnly: false,
    onVersionChange: () => {},
    projectName: PROJECT.name,
    onProjectRenamed: () => {},
    saveStatus: 'saved',
    total: 3486,
    currencyCode: 'USD',
    estimateNumber: 'NP-1045',
    ...over,
  }
}

function Publisher({ slot }: { slot: VersionSlot | null }) {
  const { setSlot } = useEstimateVersionSlot()
  useEffect(() => {
    setSlot(slot)
  }, [slot, setSlot])
  return null
}

function renderBar(slot: VersionSlot | null) {
  render(
    <BreadcrumbProvider>
      <EstimateVersionProvider>
        <Publisher slot={slot} />
        <EditorTopBar project={PROJECT} />
      </EstimateVersionProvider>
    </BreadcrumbProvider>,
  )
}

describe('EditorTopBar', () => {
  it('shows project name, client, number and formatted total', () => {
    renderBar(baseSlot())
    expect(screen.getByText('Two-bedroom repaint')).toBeTruthy()
    expect(screen.getByText('Ava Thompson · NP-1045')).toBeTruthy()
    expect(screen.getByTestId('editor-top-bar-total').textContent).toBe('$3,486.00')
    expect(screen.getByRole('link', { name: 'Back to projects' }).getAttribute('href')).toBe('/projects')
  })

  it('error state shows Try again and calls onRetrySave', () => {
    const onRetrySave = vi.fn()
    renderBar(baseSlot({ saveStatus: 'error', onRetrySave }))
    const row = within(screen.getByTestId('editor-top-bar-row2'))
    expect(row.getByText('Not saved')).toBeTruthy()
    fireEvent.click(row.getByRole('button', { name: 'Try again' }))
    expect(onRetrySave).toHaveBeenCalledTimes(1)
  })

  it('has no retry button when onRetrySave is undefined', () => {
    renderBar(baseSlot({ saveStatus: 'error' }))
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.getAllByText('Not saved').length).toBeGreaterThan(0)
  })

  it('shows Saving, Unsaved changes and Saved states', () => {
    renderBar(baseSlot({ saveStatus: 'saving' }))
    expect(within(screen.getByTestId('editor-top-bar-inline')).getByText('Saving…')).toBeTruthy()
    cleanup()
    renderBar(baseSlot({ isDirty: true }))
    expect(within(screen.getByTestId('editor-top-bar-inline')).getByText('Unsaved changes')).toBeTruthy()
    cleanup()
    renderBar(baseSlot())
    expect(within(screen.getByTestId('editor-top-bar-inline')).getByText('Saved')).toBeTruthy()
  })

  it('read-only hides the save state', () => {
    renderBar(baseSlot({ isReadOnly: true }))
    expect(screen.queryByText('Saved')).toBeNull()
    expect(screen.queryByText('Not saved')).toBeNull()
  })

  it('locked + accepted shows the accepted banner', () => {
    renderBar(baseSlot({ isLocked: true, clientResponse: 'accepted', onOpenStatus: () => {} }))
    const banner = within(screen.getByTestId('editor-lock-banner'))
    expect(banner.getByText('Estimate accepted.')).toBeTruthy()
    expect(banner.getByText(/The content is locked\./)).toBeTruthy()
    expect(banner.getByRole('button', { name: 'See status' })).toBeTruthy()
  })

  it('locked + declined shows the declined banner', () => {
    renderBar(baseSlot({ isLocked: true, clientResponse: 'declined' }))
    const banner = within(screen.getByTestId('editor-lock-banner'))
    expect(banner.getByText('Estimate declined.')).toBeTruthy()
    expect(banner.queryByRole('button', { name: 'See status' })).toBeNull()
  })

  it('locked + sent shows the shared banner', () => {
    renderBar(baseSlot({ isLocked: true, sentAt: '2026-11-16T09:00:00Z' }))
    expect(within(screen.getByTestId('editor-lock-banner')).getByText('Shared with the client.')).toBeTruthy()
  })

  it('no banner when not locked', () => {
    renderBar(baseSlot())
    expect(screen.queryByTestId('editor-lock-banner')).toBeNull()
  })

  it('status chip opens the status sheet', () => {
    const onOpenStatus = vi.fn()
    renderBar(baseSlot({ sentAt: '2026-11-16T09:00:00Z', onOpenStatus }))
    fireEvent.click(within(screen.getByTestId('editor-top-bar-row2')).getByRole('button', { name: /Estimate status: Sent/ }))
    expect(onOpenStatus).toHaveBeenCalled()
  })

  it('without a slot there is no total, chip or save state', () => {
    renderBar(null)
    expect(screen.getByText('Two-bedroom repaint')).toBeTruthy()
    expect(screen.getByText('Ava Thompson')).toBeTruthy()
    expect(screen.queryByTestId('editor-top-bar-total')).toBeNull()
    expect(screen.queryByTestId('editor-top-bar-inline')).toBeNull()
    expect(screen.queryByTestId('editor-top-bar-row2')).toBeNull()
    expect(screen.queryByText('Draft')).toBeNull()
  })
})
