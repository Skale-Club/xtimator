import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const generateMock = vi.fn()
vi.mock('@/lib/services/generate-estimate', () => ({
  generateEstimateForProject: (...args: unknown[]) => generateMock(...args),
}))

import { makeGenerateNode } from '@/lib/estimate/graph/nodes/generate'
import type { EstimateStateType } from '@/lib/estimate/graph/state'

const runner = { run: <T>(_name: string, fn: () => Promise<T>) => fn() }
const base = { companyId: 'c1', projectId: 'p1', attemptId: 'a1' }

describe('generate node -> service options', () => {
  beforeEach(() => {
    generateMock.mockReset()
    generateMock.mockResolvedValue({ estimateId: 'e1', language: 'es' })
  })

  it('passes the UI language selection (estimateLanguage) to the service on the web branch', async () => {
    await makeGenerateNode(runner)({ ...base, channel: 'web', estimateLanguage: 'pt' } as EstimateStateType)
    expect(generateMock.mock.calls[0][2]).toMatchObject({ language: 'pt' })
  })

  it('passes it on the whatsapp branch too', async () => {
    await makeGenerateNode(runner)({ ...base, channel: 'whatsapp', estimateLanguage: 'es' } as EstimateStateType)
    expect(generateMock.mock.calls[0][2]).toMatchObject({ channel: 'whatsapp', language: 'es' })
  })

  it('leaves language undefined when no selection exists so the cascade applies', async () => {
    await makeGenerateNode(runner)({ ...base, channel: 'web' } as EstimateStateType)
    expect(generateMock.mock.calls[0][2].language).toBeUndefined()
  })

  it('threads inputType into costContext for journal phase rows', async () => {
    await makeGenerateNode(runner)({ ...base, channel: 'web', inputType: 'recording' } as EstimateStateType)
    expect(generateMock.mock.calls[0][2].costContext).toMatchObject({ attemptId: 'a1', inputType: 'recording' })
  })
})
