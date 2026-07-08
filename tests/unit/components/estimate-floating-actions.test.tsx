import { describe, it } from 'vitest'

// Wave 0 scaffold — Phase 162 plan 162-04 converts these to real tests when it
// adds the gear icon to estimate-floating-actions.tsx per DOCUX-01.

describe('EstimateFloatingActions gear button (DOCUX-01)', () => {
  it.todo('renders gear button when onOpenSettings prop is provided')
  it.todo('does NOT render gear button when onOpenSettings prop is undefined (backward-compat)')
  it.todo('gear opens settings — clicking gear button invokes onOpenSettings callback')
  it.todo('gear button is the LEFTMOST child of the Pill (order: [Gear] linkClientSlot Photos Send)')
  it.todo('gear button has aria-label="Settings" for screen readers')
  it.todo('gear button renders Settings icon from lucide-react (h-3.5 w-3.5)')
})
