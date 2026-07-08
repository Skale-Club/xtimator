import { describe, it } from 'vitest'

// Wave 0 scaffold — Phase 162 plan 162-03 converts these to real tests when it
// wires the Bill To pencil affordance into estimate-document.tsx per DOCUX-02.

describe('Bill To pencil affordance (DOCUX-02)', () => {
  it.todo('pencil is hidden by default (opacity-0) when the Bill To block is not hovered/focused')
  it.todo('pencil reveals (opacity-100) on hover of the Bill To block (group-hover:opacity-100)')
  it.todo('pencil reveals (opacity-100) on focus of the Bill To block (focus:opacity-100)')
  it.todo('clicking pencil opens ClientPicker Popover with variant="billTo"')
  it.todo('pencil only renders when isEditable=true AND projectId is defined (not in mode="view")')
  it.todo('selecting a client in the popover dispatches linkProjectToClient (mocked server action)')
  it.todo('DocumentClient interface includes `id: string` (compile-time assertion)')
})
