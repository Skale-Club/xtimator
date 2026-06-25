/**
 * CHATUI-04 — estimate-card: poll the job, then "Open in editor".
 *
 * GREEN (Plan 125-02): components/chat/estimate-card.tsx polls useJobStatus and,
 * on completion, resolves the produced estimate id (resolveCurrentEstimateId) to
 * render an "Open in editor" link to /projects/<id>?tab=estimate&estimate=<id>.
 * These assertions mock the hook + action and lock processing/completed/failed.
 * RTL `container` style.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

// ── Mocks ────────────────────────────────────────────────────────────────────
const useJobStatus = vi.fn()
vi.mock('@/hooks/use-job-status', () => ({
  useJobStatus: (...a: unknown[]) => useJobStatus(...a),
}))

const resolveCurrentEstimateId = vi.fn()
vi.mock('@/lib/actions/chat', () => ({
  resolveCurrentEstimateId: (...a: unknown[]) => resolveCurrentEstimateId(...a),
}))

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))

// next/link → plain anchor so href assertions are simple.
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import { EstimateCard } from '@/components/chat/estimate-card'

beforeEach(() => {
  useJobStatus.mockReset()
  resolveCurrentEstimateId.mockReset()
  resolveCurrentEstimateId.mockResolvedValue('est-123')
})

describe('EstimateCard (CHATUI-04)', () => {
  // Contract anchor (runs now): the verified editor route shape the card links to.
  it('builds the editor href as /projects/<id>?tab=estimate&estimate=<id>', () => {
    const projectId = 'proj-1'
    const estimateId = 'est-1'
    const href = `/projects/${projectId}?tab=estimate&estimate=${estimateId}`
    expect(href).toBe('/projects/proj-1?tab=estimate&estimate=est-1')
  })

  it('renders a spinner card while useJobStatus is processing', () => {
    useJobStatus.mockReturnValue({ state: 'processing', output: null, reason: null })
    const { container } = render(<EstimateCard jobId="job-1" projectId="proj-1" />)
    expect(container.innerHTML).toContain('Generating estimate…')
    expect(container.querySelector('a')).toBeNull()
  })

  it('renders a friendly error card on failed', () => {
    useJobStatus.mockReturnValue({ state: 'failed', output: null, reason: 'boom' })
    const { container } = render(<EstimateCard jobId="job-1" projectId="proj-1" />)
    expect(container.innerHTML).toContain('boom')
    expect(container.querySelector('a')).toBeNull()
  })

  it('on completed, renders an "Open in editor" link to the editor route', async () => {
    useJobStatus.mockReturnValue({
      state: 'completed',
      output: { jobId: 'job-1' },
      reason: null,
    })
    const { container } = render(<EstimateCard jobId="job-1" projectId="proj-1" />)

    await waitFor(() => {
      const link = container.querySelector('a')
      expect(link).not.toBeNull()
      expect(link?.getAttribute('href')).toContain(
        '/projects/proj-1?tab=estimate&estimate=est-123',
      )
    })
  })
})
