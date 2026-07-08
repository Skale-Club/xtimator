import { describe, it } from 'vitest'

// Wave 0 scaffold — Phase 162 plan 162-03 converts these to real tests when
// it reconciles InlineProjectName with ProjectTitle's validation contract
// per DOCUX-04. Every todo maps to a locked criterion in 162-CONTEXT
// (thin solid underline + validation contract preserved).

describe('InlineProjectName (DOCUX-04)', () => {
  it.todo('solid underline — DOM contains "border-b" class and does NOT contain "decoration-dotted"')
  it.todo('underline is transparent by default and shows foreground/40 on hover (border-transparent hover:border-foreground/40)')
  it.todo('underline shows foreground/40 on keyboard focus (focus-visible:border-foreground/40)')
  it.todo('empty validation — submitting empty draft calls toast.error and stays in edit mode (no server call)')
  it.todo('200 char limit — submitting draft.length > 200 calls toast.error and stays in edit mode')
  it.todo('no-op — submitting draft === name closes edit mode without server call')
  it.todo('error retry — server error causes toast.error, reverts draft to name, keeps edit mode OPEN')
  it.todo('autofocus + select-all when entering edit mode')
  it.todo('escape key cancels edit mode and reverts draft')
  it.todo('maxLength attribute is 200 on the input element')
  it.todo('aria-label is "Project name" on the input element')
  it.todo('double-submit guard — subsequent submit while isPending returns early')
})
