import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Invokes the REAL WhatsApp graph (heavy LangGraph tree, runtime dynamic import).
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/**
 * Phase 2a - the CREATE graph (whatsapp-process path) attributes and debits the AI
 * work of each inbound message: Whisper (audio_minutes), vision (photo_batch) and
 * the estimate attempt. Mock harness copied from batch-reporting.test.ts; the
 * credit helpers are observed, the ledger itself is covered by credits.test.ts.
 */

const sendWhatsAppMessage = vi.fn().mockResolvedValue(undefined)
const downloadWhatsAppMedia = vi.fn().mockResolvedValue(Buffer.from('x'))
vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: (...args: unknown[]) => sendWhatsAppMessage(...args),
  downloadWhatsAppMedia: (...args: unknown[]) => downloadWhatsAppMedia(...args),
}))
vi.mock('@/lib/whatsapp/conversations', () => ({
  logOutboundMessage: vi.fn().mockResolvedValue(undefined),
}))

const generateEstimateForProject = vi.fn()
vi.mock('@/lib/services/generate-estimate', () => ({
  generateEstimateForProject: (...args: unknown[]) => generateEstimateForProject(...args),
}))

const transcribeAudioOR = vi.fn()
const analyzePhotoOR = vi.fn()
vi.mock('@/lib/ai/openrouter-client', () => ({
  transcribeAudioOR: (...args: unknown[]) => transcribeAudioOR(...args),
  analyzePhotoOR: (...args: unknown[]) => analyzePhotoOR(...args),
}))

vi.mock('@/lib/storage/server', () => ({
  getServerStorage: () => ({ upload: vi.fn().mockResolvedValue(undefined) }),
}))

// getTranscriptionModel reads platform_integrations through .maybeSingle(), which the
// chainable client below does not model; pin it so the audio path reaches Whisper.
vi.mock('@/lib/platform-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/platform-config')>()
  return { ...actual, getTranscriptionModel: vi.fn().mockResolvedValue('openai/whisper-1') }
})

const debitWhatsAppMedia = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/whatsapp/credits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/whatsapp/credits')>()
  return {
    ...actual,
    debitWhatsAppMedia: (...args: unknown[]) => debitWhatsAppMedia(...args),
  }
})

function makeChainableClient() {
  const single = vi.fn().mockResolvedValue({
    data: {
      total: 1000,
      currency_code: 'USD',
      summary: 'ok',
      sections: [{ title: 'Work', subtotal: 1000, items: [{ id: 'i1' }] }],
    },
    error: null,
  })
  const eq = vi.fn()
  const select = vi.fn().mockReturnValue({ eq, single })
  eq.mockImplementation(() => ({ eq, single, then: undefined }))
  // update().eq().eq() must be chainable AND awaitable (the image path chains two .eq()).
  const chainEq = (): unknown => ({
    eq: chainEq,
    then: (resolve: (v: unknown) => unknown) => resolve({ error: null }),
  })
  const update = vi.fn().mockReturnValue({ eq: chainEq })
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'whatsapp_sessions') return { insert: vi.fn().mockResolvedValue({ error: null }) }
    return {
      insert: vi.fn().mockResolvedValue({ error: null }),
      update,
      select,
      delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }
  })
  return { from } as never
}
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => makeChainableClient(),
  createServiceClient: () => makeChainableClient(),
}))

const BASE = {
  companyId: 'company-1',
  projectId: 'project-1',
  ownerPhone: '+15555550123',
  currentMessage: undefined,
  mediaResults: [],
  estimateId: undefined,
  estimateLanguage: undefined,
  isVague: undefined,
}

async function invoke(input: Record<string, unknown>) {
  const { buildEstimateGraph } = await import('@/lib/whatsapp/estimate-graph')
  return buildEstimateGraph().invoke(input as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  sendWhatsAppMessage.mockResolvedValue(undefined)
  downloadWhatsAppMedia.mockResolvedValue(Buffer.from('x'))
  transcribeAudioOR.mockResolvedValue({ text: 'a transcript', servedBy: 'primary' })
  analyzePhotoOR.mockResolvedValue('a description')
  debitWhatsAppMedia.mockResolvedValue(undefined)
  generateEstimateForProject.mockResolvedValue({ estimateId: 'est-1', language: 'en' })
})

afterEach(() => {
  vi.resetModules()
})

describe('WhatsApp CREATE graph: media AI work is attributed and debited per message', () => {
  it('audio: the Whisper call carries the per-message attemptId and the spend is debited once as audio', async () => {
    const { waAttemptId } = await import('@/lib/whatsapp/credits')
    await invoke({
      ...BASE,
      messages: [{ id: 'wamid.voice', type: 'audio', audio: { id: 'aud-1', mime_type: 'audio/ogg' } }],
    })

    expect(transcribeAudioOR).toHaveBeenCalledTimes(1)
    expect(transcribeAudioOR.mock.calls[0][3]).toEqual({
      companyId: 'company-1',
      projectId: 'project-1',
      attemptId: waAttemptId('wamid.voice'),
    })
    expect(debitWhatsAppMedia).toHaveBeenCalledTimes(1)
    expect(debitWhatsAppMedia).toHaveBeenCalledWith({
      companyId: 'company-1',
      wamid: 'wamid.voice',
      kind: 'audio',
    })
  })

  it('photo: vision gets a cost context (company + attemptId) and the spend is debited as a photo', async () => {
    const { waAttemptId } = await import('@/lib/whatsapp/credits')
    await invoke({
      ...BASE,
      messages: [{ id: 'wamid.pic', type: 'image', image: { id: 'img-1', mime_type: 'image/jpeg' } }],
    })

    expect(analyzePhotoOR).toHaveBeenCalledTimes(1)
    expect(analyzePhotoOR.mock.calls[0][3]).toEqual({
      companyId: 'company-1',
      projectId: 'project-1',
      attemptId: waAttemptId('wamid.pic'),
    })
    expect(debitWhatsAppMedia).toHaveBeenCalledTimes(1)
    expect(debitWhatsAppMedia).toHaveBeenCalledWith({
      companyId: 'company-1',
      wamid: 'wamid.pic',
      kind: 'photo',
    })
  })

  it('a batch debits each media message under its own wamid; text costs nothing here', async () => {
    await invoke({
      ...BASE,
      messages: [
        { id: 'm-text', type: 'text', text: { body: 'paint the fence' } },
        { id: 'm-voice', type: 'audio', audio: { id: 'aud-1', mime_type: 'audio/ogg' } },
        { id: 'm-pic', type: 'image', image: { id: 'img-1', mime_type: 'image/jpeg' } },
      ],
    })

    const debited = debitWhatsAppMedia.mock.calls.map((c) => (c[0] as { wamid: string }).wamid).sort()
    expect(debited).toEqual(['m-pic', 'm-voice'])
  })

  it('an unreadable voice note (empty transcript) is not debited', async () => {
    transcribeAudioOR.mockResolvedValue({ text: '', servedBy: 'primary' })
    await invoke({
      ...BASE,
      messages: [
        { id: 'm-text', type: 'text', text: { body: 'paint the fence' } },
        { id: 'm-voice', type: 'audio', audio: { id: 'aud-1', mime_type: 'audio/ogg' } },
      ],
    })
    expect(debitWhatsAppMedia).not.toHaveBeenCalled()
  })

  it('a failed media download is not debited', async () => {
    downloadWhatsAppMedia.mockRejectedValue(new Error('media gone'))
    await invoke({
      ...BASE,
      messages: [
        { id: 'm-text', type: 'text', text: { body: 'paint the fence' } },
        { id: 'm-voice', type: 'audio', audio: { id: 'aud-1', mime_type: 'audio/ogg' } },
      ],
    })
    expect(debitWhatsAppMedia).not.toHaveBeenCalled()
  })
})

describe('WhatsApp CREATE graph: the generation attempt id reaches the cost context', () => {
  it('threads attemptId into generateEstimateForProject so the estimate cost rows are readable by the job debit', async () => {
    const { waGenerationAttemptId } = await import('@/lib/whatsapp/credits')
    const attemptId = waGenerationAttemptId('wa-batch-m1')

    await invoke({
      ...BASE,
      attemptId,
      messages: [{ id: 'm1', type: 'text', text: { body: 'paint the fence' } }],
    })

    expect(generateEstimateForProject).toHaveBeenCalledTimes(1)
    const opts = generateEstimateForProject.mock.calls[0][2] as {
      costContext: { attemptId: string; companyId: string }
    }
    expect(opts.costContext.attemptId).toBe(attemptId)
    expect(opts.costContext.companyId).toBe('company-1')
  })
})
