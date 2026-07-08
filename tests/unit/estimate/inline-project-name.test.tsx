import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { InlineProjectName } from '@/components/workspace/estimate/estimate-document'

// Wave 3 (162-03) — DOCUX-04 reconciliation. Real RTL assertions replacing
// the 162-01 scaffold placeholders. InlineProjectName is now exported from
// estimate-document.tsx so it can be tested in isolation.
//
// Behavior contract mirrors components/workspace/project-title.tsx:
//   - empty submit → toast.error + stays editing (no server call)
//   - >200 char submit → toast.error + stays editing (no server call)
//   - server error (onRename rejects) → draft reverts to name; edit mode STAYS open;
//     InlineProjectName itself does NOT re-toast (single-toast rule — the caller
//     handleRenameProject in estimate-editor.tsx owns the user-facing toast).
//   - no-op (draft === name) → closes edit mode, no server call
//   - autofocus + select-all on enter-edit
//   - Escape cancels + reverts draft
//   - maxLength=200 + aria-label="Project name"
//   - double-submit guard when isPending

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockToastError = vi.fn()
const mockToastSuccess = vi.fn()

vi.mock('sonner', () => ({
  toast: {
    error: (msg: string) => mockToastError(msg),
    success: (msg: string) => mockToastSuccess(msg),
  },
}))

// useTranslation returns identity t() in EN — matches the runtime EN fast-path.
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

beforeEach(() => {
  mockToastError.mockReset()
  mockToastSuccess.mockReset()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderIt(props?: Partial<{ name: string; onRename: (v: string) => Promise<void> }>) {
  const name = props?.name ?? 'Deck Rebuild'
  const onRename = props?.onRename ?? vi.fn().mockResolvedValue(undefined)
  const utils = render(<InlineProjectName name={name} onRename={onRename} />)
  return { ...utils, name, onRename }
}

function clickToEnterEdit(text: string): void {
  fireEvent.click(screen.getByText(text))
}

describe('InlineProjectName (DOCUX-04)', () => {
  it('solid underline — DOM contains "border-b" class and does NOT contain "decoration-dotted"', () => {
    renderIt({ name: 'Deck Rebuild' })
    const p = screen.getByText('Deck Rebuild')
    expect(p.className).toContain('border-b')
    expect(p.className).not.toContain('decoration-dotted')
    expect(p.className).not.toMatch(/\bunderline\b/)
  })

  it('underline is transparent by default and shows foreground/40 on hover (border-transparent hover:border-foreground/40)', () => {
    renderIt()
    const p = screen.getByText('Deck Rebuild')
    expect(p.className).toContain('border-transparent')
    expect(p.className).toContain('hover:border-foreground/40')
  })

  it('underline shows foreground/40 on keyboard focus (focus-visible:border-foreground/40)', () => {
    renderIt()
    const p = screen.getByText('Deck Rebuild')
    expect(p.className).toContain('focus-visible:border-foreground/40')
  })

  it('empty validation — submitting empty draft calls toast.error and stays in edit mode (no server call)', async () => {
    const onRename = vi.fn().mockResolvedValue(undefined)
    renderIt({ onRename })
    clickToEnterEdit('Deck Rebuild')
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Project name is required')
    })
    // still in edit mode: input still present
    expect(screen.getByRole('textbox')).toBeTruthy()
    // no server call
    expect(onRename).not.toHaveBeenCalled()
  })

  it('200 char limit — submitting draft.length > 200 calls toast.error and stays in edit mode', async () => {
    const onRename = vi.fn().mockResolvedValue(undefined)
    renderIt({ onRename })
    clickToEnterEdit('Deck Rebuild')
    const input = screen.getByRole('textbox') as HTMLInputElement
    // maxLength=200 on the input restricts DOM entry, so simulate via keyboard-submit
    // by setting value directly via change event with 201 chars — React allows this
    // even though maxLength would filter user typing.
    const long = 'a'.repeat(201)
    fireEvent.change(input, { target: { value: long } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Name must be 200 characters or less')
    })
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(onRename).not.toHaveBeenCalled()
  })

  it('no-op — submitting draft === name closes edit mode without server call', async () => {
    const onRename = vi.fn().mockResolvedValue(undefined)
    renderIt({ name: 'Deck Rebuild', onRename })
    clickToEnterEdit('Deck Rebuild')
    const input = screen.getByRole('textbox') as HTMLInputElement
    // draft stays === name; submit via Enter
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(screen.queryByRole('textbox')).toBeNull()
    })
    expect(onRename).not.toHaveBeenCalled()
  })

  it('error retry — server error causes draft revert to name and keeps edit mode OPEN (single-toast rule: InlineProjectName itself does not re-toast)', async () => {
    const onRename = vi.fn().mockRejectedValue(new Error('Server error'))
    renderIt({ name: 'Deck Rebuild', onRename })
    clickToEnterEdit('Deck Rebuild')
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Deck Rebuild v2' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Server call fired with trimmed value
    await waitFor(() => {
      expect(onRename).toHaveBeenCalledWith('Deck Rebuild v2')
    })
    // Draft reverts to original name; edit mode stays OPEN
    await waitFor(() => {
      const stillInput = screen.getByRole('textbox') as HTMLInputElement
      expect(stillInput.value).toBe('Deck Rebuild')
    })
    // Single-toast rule: InlineProjectName's own catch does NOT toast — the
    // toast comes from handleRenameProject in estimate-editor.tsx (Option B).
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it('autofocus + select-all when entering edit mode', () => {
    renderIt({ name: 'Deck Rebuild' })
    clickToEnterEdit('Deck Rebuild')
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(document.activeElement).toBe(input)
    // select-all: selectionStart=0, selectionEnd=length
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('Deck Rebuild'.length)
  })

  it('escape key cancels edit mode and reverts draft', async () => {
    renderIt({ name: 'Deck Rebuild' })
    clickToEnterEdit('Deck Rebuild')
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Abandoned Draft' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('textbox')).toBeNull()
    })
    // Enter edit mode again — should show original name, not the abandoned draft
    clickToEnterEdit('Deck Rebuild')
    const input2 = screen.getByRole('textbox') as HTMLInputElement
    expect(input2.value).toBe('Deck Rebuild')
  })

  it('maxLength attribute is 200 on the input element', () => {
    renderIt()
    clickToEnterEdit('Deck Rebuild')
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.maxLength).toBe(200)
  })

  it('aria-label is "Project name" on the input element', () => {
    renderIt()
    clickToEnterEdit('Deck Rebuild')
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.getAttribute('aria-label')).toBe('Project name')
  })

  it('double-submit guard — a submit while a prior submit is still pending does not trigger a second server call', async () => {
    // Freeze the first onRename call so isPending stays true across a second submit attempt.
    let resolveFirst: (() => void) | null = null
    const onRename = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve
        })
    )
    renderIt({ name: 'Deck Rebuild', onRename })
    clickToEnterEdit('Deck Rebuild')
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'v2' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // First call fires
    await waitFor(() => {
      expect(onRename).toHaveBeenCalledTimes(1)
    })
    // While pending, attempt a second submit
    fireEvent.keyDown(input, { key: 'Enter' })
    // Guard: still only one call
    await waitFor(() => {
      expect(onRename).toHaveBeenCalledTimes(1)
    })
    // Cleanup: resolve the promise so React finishes its transition without warnings
    await act(async () => {
      resolveFirst?.()
    })
  })
})
