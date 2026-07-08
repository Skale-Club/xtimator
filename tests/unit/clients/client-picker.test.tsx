import { describe, it } from 'vitest'

// Wave 0 scaffold — Phase 162 plans (162-02) convert these it.todo entries to
// real tests as they implement `components/clients/client-picker.tsx` per
// DOCUX-02 (Bill To pencil variant) and DOCUX-03 (consolidated component).
// Every it.todo maps to a row in 162-VALIDATION.md's Per-Task Verification Map.

describe('ClientPicker (DOCUX-02, DOCUX-03)', () => {
  it.todo('renders card variant — Card variant="glass" shell + Link Client button (mirrors LinkClientCard)')
  it.todo('renders button variant — Button rounded-full ghost UserPlus trigger (mirrors LinkClientButton)')
  it.todo('renders inline variant — bare button "No client linked" + UserPlus (mirrors LinkClientInline)')
  it.todo('renders billTo variant — Pencil icon with opacity-0 group-hover:opacity-100 focus:opacity-100 (NEW — for DOCUX-02)')
  it.todo('dispatches linkProjectToClient(projectId, clientId) on client selection (mocked)')
  it.todo('shows Unlink footer button only when currentClientId is non-null')
  it.todo('unlink calls unlinkProjectFromClient(projectId) (mocked)')
  it.todo('search filters clients by name OR email (case-insensitive)')
  it.todo('CommandEmpty renders "No clients found." when filtered list is empty')
})
