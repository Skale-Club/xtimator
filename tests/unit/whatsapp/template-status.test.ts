// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ service: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: mock.service }))
import { applyTemplateStatusUpdate } from '@/lib/whatsapp/template-status'
let updates: Array<Record<string, unknown>>
let matches: Array<{ id: string }>[]
let queryError: unknown
beforeEach(() => {
  updates = []; matches = [[{ id: 'row-1' }, { id: 'row-2' }]]; queryError = null
  mock.service.mockReturnValue({ from: () => ({
    select: () => {
      const chain: Record<string, any> = {}
      chain.eq = vi.fn(() => chain)
      chain.then = (resolve: (x: unknown) => unknown) => Promise.resolve({ data: matches.shift() ?? [], error: queryError }).then(resolve)
      return chain
    },
    update: (patch: Record<string, unknown>) => { updates.push(patch); return { in: vi.fn().mockResolvedValue({ error: null }) } },
  }) })
})
it('updates every event binding for the same approved Meta template variant', async () => {
  await applyTemplateStatusUpdate({ message_template_id: 'meta-1', event: 'APPROVED' })
  expect(updates).toEqual([expect.objectContaining({ status: 'approved', meta_template_id: 'meta-1', rejection_reason: null })])
})
it('falls back to name/language and associates an imported template ID', async () => {
  matches = [[], [{ id: 'imported' }]]
  await applyTemplateStatusUpdate({ message_template_id: 'meta-new', template_name: 'owner_update', language: 'en_US', event: 'REJECTED', reason: 'INVALID_FORMAT' })
  expect(updates[0]).toMatchObject({ status: 'rejected', meta_template_id: 'meta-new', rejection_reason: 'INVALID_FORMAT' })
})
it('throws database failures so the accepted webhook remains recoverable', async () => {
  queryError = { code: 'unavailable' }
  await expect(applyTemplateStatusUpdate({ message_template_id: 'meta-1', event: 'APPROVED' })).rejects.toThrow('lookup')
  expect(updates).toEqual([])
})
it('ignores templates owned by another application instead of creating an unapproved binding', async () => {
  matches = [[]]
  await applyTemplateStatusUpdate({ message_template_id: 'someone-elses-template', event: 'APPROVED' })
  expect(updates).toEqual([])
})
