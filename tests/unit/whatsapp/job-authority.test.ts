// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const find = vi.hoisted(() => vi.fn())
vi.mock('@/lib/whatsapp/account-registry', () => ({ findActiveWhatsAppSender: find }))
import { isWhatsAppJobAuthorized } from '@/lib/whatsapp/job-authority'
beforeEach(() => { vi.clearAllMocks(); find.mockResolvedValue({ companyId: 'c1', userId: 'u1', phoneE164: '+15555550100' }) })
it('fails closed for old events without actor provenance', async () => {
  expect(await isWhatsAppJobAuthorized('c1','+15555550100')).toBe(false)
  expect(find).not.toHaveBeenCalled()
})
it('requires the current company and account, including after phone reassignment', async () => {
  expect(await isWhatsAppJobAuthorized('c1','+15555550100','u1')).toBe(true)
  expect(await isWhatsAppJobAuthorized('c1','+15555550100','old-account')).toBe(false)
  expect(await isWhatsAppJobAuthorized('other-company','+15555550100','u1')).toBe(false)
})
it('allows a deliberately authorized phone-only identity only with explicit null provenance', async () => {
  find.mockResolvedValue({ companyId: 'c1', userId: null, phoneE164: '+15555550100' })
  expect(await isWhatsAppJobAuthorized('c1','+15555550100',null)).toBe(true)
})
it('propagates an unreadable authority check for durable retry', async () => {
  find.mockRejectedValue(new Error('database unavailable'))
  await expect(isWhatsAppJobAuthorized('c1','+15555550100','u1')).rejects.toThrow('database unavailable')
})
