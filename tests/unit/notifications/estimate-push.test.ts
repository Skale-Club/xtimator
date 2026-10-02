import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))
vi.mock('@/lib/notifications/web-push', () => ({ sendPushToUser: vi.fn() }))

import { buildEstimatePushMessage } from '@/lib/notifications/estimate-push'

/** 260928: the words and link of the "estimate ready" push. */
describe('buildEstimatePushMessage', () => {
  const base = { projectId: 'p1', attemptId: 'a1', estimateId: 'e1', projectName: 'Smith Kitchen' as string | null }

  it('opens the estimate itself when it is ready', () => {
    const m = buildEstimatePushMessage({ ...base, kind: 'ready', lang: 'pt' })
    expect(m).toEqual({
      title: 'Seu orçamento está pronto',
      body: 'Smith Kitchen: toque para revisar e enviar.',
      url: '/projects/p1?tab=estimate&estimate=e1',
      tag: 'a1',
    })
  })

  it('opens the project when the estimate needs details or failed', () => {
    expect(buildEstimatePushMessage({ ...base, kind: 'needs_details', lang: 'en' }).url).toBe('/projects/p1')
    expect(buildEstimatePushMessage({ ...base, kind: 'failed', lang: 'es' })).toMatchObject({
      title: 'No pudimos generar su presupuesto',
      url: '/projects/p1',
    })
  })

  it('leaves the project name out when there is none', () => {
    expect(buildEstimatePushMessage({ ...base, projectName: null, kind: 'ready', lang: 'en' }).body).toBe(
      'Tap to review and send it.'
    )
  })
})
