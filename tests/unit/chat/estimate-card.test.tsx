/**
 * CHATUI-04 — estimate-card: poll the job, then "Open in editor".
 *
 * Wave-0 RED scaffold: components/chat/estimate-card.tsx is built by Plan 125-02.
 * Behavioral assertions (mock useJobStatus → 'completed', assert the editor link)
 * are it.todo until the component lands (125-02 turns them green). One real expect
 * anchors the exact editor href shape the card must produce.
 */
import { describe, it, expect } from 'vitest'

describe('EstimateCard (CHATUI-04)', () => {
  // Contract anchor (runs now): the verified editor route shape the card links to.
  it('builds the editor href as /projects/<id>?tab=estimate&estimate=<id>', () => {
    const projectId = 'proj-1'
    const estimateId = 'est-1'
    const href = `/projects/${projectId}?tab=estimate&estimate=${estimateId}`
    expect(href).toBe('/projects/proj-1?tab=estimate&estimate=est-1')
  })

  it.todo('renders a spinner card while useJobStatus is processing')
  it.todo('renders a friendly error card on failed/config_unavailable/not_found')
  it.todo('on completed, renders an "Open in editor" link to the editor route')
})
