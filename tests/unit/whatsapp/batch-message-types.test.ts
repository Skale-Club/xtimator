import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/**
 * Phase 4 — batch / awaiting-details ingestion (the real WhatsApp graph adapter) applies
 * the shared per-type policy: location -> "Job location" recordings row, contacts ->
 * "Client" row, interactive/button reply -> text row, oversize media -> dropped (no
 * transcription), stickers/reactions -> nothing. Harness mirrors batch-reporting.test.ts.
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

const transcribeAudioOR = vi.fn().mockResolvedValue({ text: 'a transcript', servedBy: 'primary' })
const analyzePhotoOR = vi.fn().mockResolvedValue('a description')
vi.mock('@/lib/ai/openrouter-client', () => ({
  transcribeAudioOR: (...args: unknown[]) => transcribeAudioOR(...args),
  analyzePhotoOR: (...args: unknown[]) => analyzePhotoOR(...args),
}))

vi.mock('@/lib/storage/server', () => ({
  getServerStorage: () => ({ upload: vi.fn().mockResolvedValue(undefined) }),
}))

vi.mock('@/lib/whatsapp/ask-details', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/whatsapp/ask-details')>()
  return { ...actual, revertVagueEstimate: vi.fn().mockResolvedValue(undefined) }
})

let estimateRow: unknown = null
const recordingsInsert = vi.fn().mockResolvedValue({ error: null })

function makeChainableClient() {
  const single = vi.fn().mockImplementation(async () => ({ data: estimateRow, error: null }))
  const eq = vi.fn()
  const select = vi.fn().mockReturnValue({ eq, single })
  eq.mockImplementation(() => ({ eq, single, then: undefined }))
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'recordings') return { insert: (...a: unknown[]) => recordingsInsert(...a) }
    if (table === 'whatsapp_sessions') return { insert: vi.fn().mockResolvedValue({ error: null }) }
    if (table === 'estimates') {
      return { select, delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    }
    if (table === 'estimate_sections' || table === 'estimate_items') return { select }
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

async function invoke(messages: unknown[]) {
  const { buildEstimateGraph } = await import('@/lib/whatsapp/estimate-graph')
  return buildEstimateGraph().invoke({ ...BASE, messages } as never)
}

const transcripts = () =>
  recordingsInsert.mock.calls.map((c) => (c[0] as { transcript: string }).transcript)

beforeEach(() => {
  vi.clearAllMocks()
  sendWhatsAppMessage.mockResolvedValue(undefined)
  downloadWhatsAppMedia.mockResolvedValue(Buffer.from('x'))
  recordingsInsert.mockResolvedValue({ error: null })
  generateEstimateForProject.mockResolvedValue({ estimateId: 'est-1', language: 'en' })
  estimateRow = {
    total: 1234,
    currency_code: 'USD',
    summary: 'ok',
    sections: [{ title: 'Work', subtotal: 1234, items: [{ id: 'i1' }] }],
  }
})

afterEach(() => {
  vi.resetModules()
})

describe('Phase 4: batch ingestion applies the shared message policy', () => {
  it('location and contacts become context text rows next to the job text', async () => {
    await invoke([
      { id: 'm1', type: 'text', text: { body: 'paint the fence' } },
      {
        id: 'm2',
        type: 'location',
        location: { latitude: 28.54, longitude: -81.38, name: 'Smith house', address: '12 Oak St' },
      },
      {
        id: 'm3',
        type: 'contacts',
        contacts: [{ name: { formatted_name: 'John Smith' }, phones: [{ wa_id: '15552223333' }] }],
      },
    ])

    const t = transcripts()
    expect(t).toContain('paint the fence')
    expect(t).toContain('Job location: Smith house, 12 Oak St (28.54,-81.38)')
    expect(t).toContain('Client: John Smith, +15552223333')
    expect(generateEstimateForProject).toHaveBeenCalledTimes(1)
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1) // never-reply invariant: one reply
  })

  it('an interactive/button reply is stored as the owner text', async () => {
    await invoke([
      {
        id: 'm1',
        type: 'interactive',
        interactive: { type: 'button_reply', button_reply: { id: 'c', title: 'Add a deck' } },
      },
      { id: 'm2', type: 'button', button: { text: 'Yes' } },
    ])

    expect(transcripts()).toEqual(expect.arrayContaining(['Add a deck', 'Yes']))
  })

  it('stickers and reactions add nothing and are not counted as dropped input', async () => {
    await invoke([
      { id: 'm1', type: 'text', text: { body: 'paint the fence' } },
      { id: 'm2', type: 'sticker', sticker: { id: 's' } },
      { id: 'm3', type: 'reaction', reaction: { message_id: 'x', emoji: 'ok' } },
    ])

    expect(transcripts()).toEqual(['paint the fence'])
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1)
    const body = (sendWhatsAppMessage.mock.calls[0][1] as { text: { body: string } }).text.body
    expect(body).not.toMatch(/couldn't process/i)
  })

  it('an over-limit audio is dropped before transcription (noted in the single reply)', async () => {
    const { MediaTooLargeError } = await import('@/lib/whatsapp/message-policy')
    downloadWhatsAppMedia.mockRejectedValue(new MediaTooLargeError('audio', 20_000_000))

    await invoke([
      { id: 'm1', type: 'text', text: { body: 'paint the fence' } },
      { id: 'm2', type: 'audio', audio: { id: 'big', mime_type: 'audio/ogg' } },
    ])

    expect(transcribeAudioOR).not.toHaveBeenCalled()
    expect(transcripts()).toEqual(['paint the fence'])
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1)
    const body = (sendWhatsAppMessage.mock.calls[0][1] as { text: { body: string } }).text.body
    expect(body).toMatch(/couldn't process 1/i)
  })

  it('video and document in a batch (defensive path) are dropped, never processed', async () => {
    await invoke([
      { id: 'm1', type: 'text', text: { body: 'paint the fence' } },
      { id: 'm2', type: 'video', video: { id: 'v' } },
      { id: 'm3', type: 'document', document: { id: 'd', filename: 'a.pdf' } },
    ])

    expect(downloadWhatsAppMedia).not.toHaveBeenCalled()
    expect(transcripts()).toEqual(['paint the fence'])
  })
})
