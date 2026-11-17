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

const SENT = '2026-11-16T09:00:00Z'

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
  it('shows project name, client, number, total and the Total label', () => {
    renderBar(baseSlot())
    expect(screen.getByText('Two-bedroom repaint')).toBeTruthy()
    expect(screen.getByText('Ava Thompson · NP-1045')).toBeTruthy()
    expect(screen.getByTestId('editor-top-bar-total').textContent).toBe('$3,486.00')
    expect(screen.getByText('Total')).toBeTruthy()
  })

  it('has a back link to /projects named "Back to projects"', () => {
    renderBar(baseSlot())
    const link = screen.getByRole('link', { name: 'Back to projects' })
    expect(link.getAttribute('href')).toBe('/projects')
    expect(link.textContent).toBe('Projects')
  })

  it('shows no status chip for a draft', () => {
    renderBar(baseSlot())
    expect(screen.queryByText('Draft')).toBeNull()
    expect(screen.queryByRole('button', { name: /Estimate status/ })).toBeNull()
  })

  it('shows the status chip once sent, in both the phone and desktop spots', () => {
    const onOpenStatus = vi.fn()
    renderBar(baseSlot({ sentAt: SENT, onOpenStatus }))
    const phone = within(screen.getByTestId('editor-top-bar-row-a'))
    const desktop = within(screen.getByTestId('editor-top-bar-inline'))
    fireEvent.click(phone.getByRole('button', { name: /Estimate status: Sent/ }))
    expect(onOpenStatus).toHaveBeenCalledTimes(1)
    expect(desktop.getByRole('button', { name: /Estimate status: Sent/ })).toBeTruthy()
    expect(screen.queryByTestId('editor-top-bar-row2')).toBeNull()
  })

  it('shows the chip for accepted and declined', () => {
    renderBar(baseSlot({ isLocked: true, clientResponse: 'accepted' }))
    expect(within(screen.getByTestId('editor-top-bar-row-a')).getByText(/Accepted/)).toBeTruthy()
    cleanup()
    renderBar(baseSlot({ isLocked: true, clientResponse: 'declined' }))
    expect(within(screen.getByTestId('editor-top-bar-row-a')).getByText(/Declined/)).toBeTruthy()
  })

  it('never renders the Saved or Unsaved changes text', () => {
    renderBar(baseSlot())
    expect(screen.queryByText('Saved')).toBeNull()
    cleanup()
    renderBar(baseSlot({ isDirty: true }))
    expect(screen.queryByText('Unsaved changes')).toBeNull()
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('shows Saving… only while saving', () => {
    renderBar(baseSlot({ saveStatus: 'saving' }))
    expect(within(screen.getByTestId('editor-top-bar-row-a')).getByText('Saving…')).toBeTruthy()
    expect(within(screen.getByTestId('editor-top-bar-inline')).getByText('Saving…')).toBeTruthy()
  })

  it('error state shows Try again and calls onRetrySave', () => {
    const onRetrySave = vi.fn()
    renderBar(baseSlot({ saveStatus: 'error', onRetrySave }))
    const row = within(screen.getByTestId('editor-top-bar-row-a'))
    expect(row.getByText('Not saved')).toBeTruthy()
    fireEvent.click(row.getByRole('button', { name: 'Try again' }))
    expect(onRetrySave).toHaveBeenCalledTimes(1)
  })

  it('has no retry button when onRetrySave is undefined', () => {
    renderBar(baseSlot({ saveStatus: 'error' }))
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.getAllByText('Not saved').length).toBeGreaterThan(0)
  })

  it('read-only hides the save state', () => {
    renderBar(baseSlot({ isReadOnly: true, saveStatus: 'error' }))
    expect(screen.queryByText('Not saved')).toBeNull()
    cleanup()
    renderBar(baseSlot({ isReadOnly: true, saveStatus: 'saving' }))
    expect(screen.queryByText('Saving…')).toBeNull()
  })

  it('sent and not locked shows the sent notice and no lock banner', () => {
    renderBar(baseSlot({ sentAt: SENT }))
    const notice = within(screen.getByTestId('editor-sent-notice'))
    expect(notice.getByText('Shared with the client.')).toBeTruthy()
    expect(notice.getByText(/Changes you make show up on their link\./)).toBeTruthy()
    expect(screen.queryByTestId('editor-lock-banner')).toBeNull()
  })

  it('no sent notice for drafts or answered estimates', () => {
    renderBar(baseSlot())
    expect(screen.queryByTestId('editor-sent-notice')).toBeNull()
    cleanup()
    renderBar(baseSlot({ sentAt: SENT, isLocked: true, clientResponse: 'accepted' }))
    expect(screen.queryByTestId('editor-sent-notice')).toBeNull()
    cleanup()
    renderBar(baseSlot({ sentAt: SENT, isLocked: true, clientResponse: 'declined' }))
    expect(screen.queryByTestId('editor-sent-notice')).toBeNull()
  })

  it('locked + accepted shows the contract banner and See status', () => {
    const onOpenStatus = vi.fn()
    renderBar(baseSlot({ isLocked: true, clientResponse: 'accepted', onOpenStatus }))
    const banner = within(screen.getByTestId('editor-lock-banner'))
    expect(banner.getByText('Estimate accepted.')).toBeTruthy()
    expect(banner.getByText(/This is the contract and it can’t be edited\./)).toBeTruthy()
    fireEvent.click(banner.getByRole('button', { name: 'See status' }))
    expect(onOpenStatus).toHaveBeenCalledTimes(1)
  })

  it('locked + declined with onReopen offers "Revise and reopen"', () => {
    const onReopen = vi.fn()
    renderBar(baseSlot({ isLocked: true, clientResponse: 'declined', onReopen, onOpenStatus: () => {} }))
    const banner = within(screen.getByTestId('editor-lock-banner'))
    expect(banner.getByText('Estimate declined.')).toBeTruthy()
    expect(banner.getByText(/Revise it and reopen it so the client can answer again\./)).toBeTruthy()
    expect(banner.queryByRole('button', { name: 'See status' })).toBeNull()
    fireEvent.click(banner.getByRole('button', { name: 'Revise and reopen' }))
    expect(onReopen).toHaveBeenCalledTimes(1)
  })

  it('locked + declined without onReopen falls back to See status', () => {
    renderBar(baseSlot({ isLocked: true, clientResponse: 'declined', onOpenStatus: () => {} }))
    const banner = within(screen.getByTestId('editor-lock-banner'))
    expect(banner.queryByRole('button', { name: 'Revise and reopen' })).toBeNull()
    expect(banner.getByRole('button', { name: 'See status' })).toBeTruthy()
  })

  it('locked without a stored answer shows the neutral banner', () => {
    renderBar(baseSlot({ isLocked: true, hasSignature: true, onOpenStatus: () => {} }))
    const banner = within(screen.getByTestId('editor-lock-banner'))
    expect(banner.getByText('Estimate locked.')).toBeTruthy()
    expect(banner.getByRole('button', { name: 'See status' })).toBeTruthy()
  })

  it('no banner when not locked', () => {
    renderBar(baseSlot())
    expect(screen.queryByTestId('editor-lock-banner')).toBeNull()
  })

  it('without a slot there is only the back link, name and client', () => {
    renderBar(null)
    expect(screen.getByRole('link', { name: 'Back to projects' })).toBeTruthy()
    expect(screen.getByText('Two-bedroom repaint')).toBeTruthy()
    expect(screen.getByText('Ava Thompson')).toBeTruthy()
    expect(screen.queryByTestId('editor-top-bar-total')).toBeNull()
    expect(screen.queryByText('Total')).toBeNull()
    expect(screen.queryByTestId('editor-top-bar-inline')).toBeNull()
    expect(screen.queryByTestId('editor-top-bar-row-a')).toBeNull()
    expect(screen.queryByText('Draft')).toBeNull()
  })
})
