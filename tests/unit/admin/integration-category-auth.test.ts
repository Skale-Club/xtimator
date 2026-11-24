import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { IntegrationCategoryContent } from '@/app/admin/integrations/integration-category-content'
import { findCategoryBySlug, loadCategoryInitials } from '@/lib/admin/integrations-providers'
import { requireAdmin, type AdminContext } from '@/lib/auth/admin-context'
import { getAiModelSettings, getOpenRouterDefaultModel, getTranscriptionModel } from '@/lib/platform-config'
import { requireServiceClient } from '@/lib/supabase/service'

vi.mock('@/lib/auth/admin-context', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/admin/integrations-providers', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/admin/integrations-providers')>(),
  loadCategoryInitials: vi.fn(),
}))
vi.mock('@/lib/platform-config', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/platform-config')>(),
  getAiModelSettings: vi.fn(),
  getOpenRouterDefaultModel: vi.fn(),
  getTranscriptionModel: vi.fn(),
}))
vi.mock('@/lib/supabase/service', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/supabase/service')>(),
  requireServiceClient: vi.fn(),
}))

const categoryReaders = [loadCategoryInitials, getAiModelSettings, getOpenRouterDefaultModel, getTranscriptionModel]
const metadataRead = vi.fn()
const metadataQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: metadataRead }

beforeEach(() => {
  vi.mocked(loadCategoryInitials).mockResolvedValue(new Map())
  vi.mocked(getAiModelSettings).mockResolvedValue({ defaultModel: null, models: {}, escalation: null })
  vi.mocked(getOpenRouterDefaultModel).mockResolvedValue(null)
  vi.mocked(getTranscriptionModel).mockResolvedValue('openai/whisper-1')
  metadataRead.mockResolvedValue({ data: null })
  const client = { from: vi.fn().mockReturnValue(metadataQuery) }
  vi.mocked(requireServiceClient).mockReturnValue(client as unknown as ReturnType<typeof requireServiceClient>)
})

afterEach(() => vi.clearAllMocks())

function expectNoIntegrationReads() {
  for (const read of [...categoryReaders, requireServiceClient]) expect(read).not.toHaveBeenCalled()
}

it.each(['ai', 'sms'])('denies the %s category before reading any integration data', async slug => {
  const denied = new Error('Test administrator denied')
  const category = findCategoryBySlug(slug)
  if (!category) throw new Error(`Missing integration category ${slug}`)
  vi.mocked(requireAdmin).mockRejectedValueOnce(denied)

  await expect(IntegrationCategoryContent({ category })).rejects.toBe(denied)
  expect(requireAdmin).toHaveBeenCalledOnce()
  expectNoIntegrationReads()
})

it('waits for authorization, then loads the AI category for the administrator', async () => {
  const category = findCategoryBySlug('ai')
  if (!category) throw new Error('Missing AI integration category')
  let approve!: (admin: AdminContext) => void
  vi.mocked(requireAdmin).mockReturnValueOnce(new Promise(resolve => { approve = resolve }))

  const content = IntegrationCategoryContent({ category })
  expect(requireAdmin).toHaveBeenCalledOnce()
  expectNoIntegrationReads()

  approve({ userId: 'qa-admin', email: 'qa-admin@example.invalid' })
  await expect(content).resolves.toBeTruthy()
  expect(loadCategoryInitials).toHaveBeenCalledWith(category)
  for (const read of categoryReaders) expect(read).toHaveBeenCalledOnce()
  expect(requireServiceClient).toHaveBeenCalledOnce()
  expect(metadataQuery.eq).toHaveBeenCalledWith('provider', 'price_research')
  expect(metadataRead).toHaveBeenCalledOnce()
})
