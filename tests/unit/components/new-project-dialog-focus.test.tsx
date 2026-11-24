import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NewXtimateFrame } from '@/components/projects/new-project-dialog'

vi.mock('@/components/projects/new-project-wizard', () => ({ NewProjectWizard: () => null }))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function scene(open: boolean, destination: boolean, onClose = () => {}) {
  return (
    <>
      <button type="button">Global estimate shortcut</button>
      <main data-shell="main" tabIndex={-1}>
        {destination ? (
          <button key="editor" type="button">Rename project</button>
        ) : (
          <button key="list" type="button">Open new estimate</button>
        )}
      </main>
      <NewXtimateFrame
        open={open}
        onClose={onClose}
        title="New Xtimate"
        description="Create an estimate"
        estimateLanguage="en"
        setEstimateLanguage={() => {}}
      >
        <button type="button">Start from scratch</button>
      </NewXtimateFrame>
    </>
  )
}

describe('New Xtimate keyboard focus', () => {
  it('lets Radix focus the dialog on open and returns focus to the connected opener on close', async () => {
    const onClose = vi.fn()
    const view = render(scene(false, false, onClose))
    const opener = screen.getByRole('button', { name: 'Open new estimate' })
    opener.focus()

    view.rerender(scene(true, false, onClose))
    const dialog = await screen.findByRole('dialog', { name: 'New Xtimate' })
    const language = within(dialog).getByRole('combobox', { name: 'Estimate language' })
    await waitFor(() => expect(document.activeElement).toBe(language))
    fireEvent.keyDown(language, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()

    view.rerender(scene(false, false, onClose))

    await waitFor(() => expect(document.activeElement).toBe(opener))
  })

  it.each([false, true])('focuses the persistent main after a route swap with a previous opener: %s', async withOpener => {
    const view = render(scene(false, false))
    const main = screen.getByRole('main')
    if (withOpener) screen.getByRole('button', { name: 'Open new estimate' }).focus()

    view.rerender(scene(true, false))
    const dialog = await screen.findByRole('dialog', { name: 'New Xtimate' })
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    view.rerender(scene(false, true))

    expect(screen.getByRole('main')).toBe(main)
    expect(screen.queryByRole('button', { name: 'Open new estimate' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Rename project' })).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(main))
  })

  it('preserves focus already placed on a connected control outside the closed sheet', async () => {
    const view = render(scene(false, false))
    const main = screen.getByRole('main')
    screen.getByRole('button', { name: 'Open new estimate' }).focus()
    view.rerender(scene(true, false))
    const dialog = await screen.findByRole('dialog', { name: 'New Xtimate' })
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

    vi.useFakeTimers()
    view.rerender(scene(false, true))
    const next = within(main).getByRole('button', { name: 'Rename project' })
    act(() => next.focus())
    // The real Radix focus scope defers its close callback to the next timer.
    await act(async () => { await vi.runOnlyPendingTimersAsync() })

    expect(document.activeElement).toBe(next)
  })

  it('uses the main on a new pathname even when the original global opener is still mounted', async () => {
    const originalUrl = window.location.href
    const originalState = window.history.state
    try {
      window.history.replaceState(null, '', '/projects')
      const view = render(scene(false, false))
      const main = screen.getByRole('main')
      const opener = screen.getByRole('button', { name: 'Global estimate shortcut' })
      opener.focus()
      view.rerender(scene(true, false))
      const dialog = await screen.findByRole('dialog', { name: 'New Xtimate' })
      await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

      window.history.replaceState(null, '', '/projects/new-estimate')
      view.rerender(scene(false, true))

      await waitFor(() => expect(document.activeElement).toBe(main))
      expect(screen.getByRole('button', { name: 'Global estimate shortcut' })).toBe(opener)

      view.rerender(scene(false, false))
      expect(screen.getByRole('main')).toBe(main)
      expect(document.activeElement).toBe(main)
    } finally {
      window.history.replaceState(originalState, '', originalUrl)
    }
  })
})
