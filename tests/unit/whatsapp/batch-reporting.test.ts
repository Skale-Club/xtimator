import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Invokes the REAL WhatsApp graph (heavy LangGraph tree, runtime dynamic import).
// Under vitest's reused forked worker the import can exceed the 5s default (import
// latency under contention); a timed-out invoke also bleeds a spy call into the
// next test. Per-file timeout removes both. (Not a global config / mock-reset flag.)
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/**
 * HARD-05 (WhatsApp per-message batch isolation + reporting) — Wave 0 RED
 * scaffold (Phase 102).
 *
 * The Send fan-out already ISOLATES failures: one bad message returns
 * `{ mediaResults: [{ ok:false, reason }] }` without killing the batch. The GAP is
 * VISIBILITY — when some items fail but `hasUsableInput` is still true, the single
 * WhatsApp reply must NOTE the dropped item(s) (e.g. "couldn't process 1 ...")
 * while still building the estimate from the rest. The never-reply invariant is
 * preserved: still EXACTLY ONE `sendWhatsAppMessage` per batch.
 *
 * NOTE ON THE LOOSE REGEX: Plan 03 owns the exact dropped-item wording/pluralization.
 * The dropped-item-note regex below is intentionally TOLERANT (`/couldn't process 1/i`)
 * — the LOAD-BEARING RED assertion is merely that SOME dropped-item note substring
 * is present in the reply body, not its precise phrasing. Do not tighten it here.
 *
 * RED today (intended): PARTIAL case — finalize does not append any dropped-item
 * note, so the note-substring assertion FAILS while the estimate-ready copy passes.
 * GREEN today (pin): TOTAL case — all-fail routes to the existing no-input onError
 * reply (exactly one call, generate not invoked); kept so Plan 03 cannot regress it.
 *
 * Wave-1/2 owner: Phase 102 Plan 03 (HARD-05) carries a neutral dropped-input
 * summary forward on core state and composes the per-item note INTO the single
 * existing reply body.
 *
 * Mock harness copied from `tests/unit/whatsapp/never-reply-regression.test.ts`.
 * Mocks scoped: cleared per test, modules reset in afterEach.
 */

// --- Mock all WhatsApp / AI / DB side-effects the graph nodes reach -----------

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

// Phase 167 (BILL-05): transcribeAudioOR resolves { text, servedBy }.
const transcribeAudioOR = vi.fn().mockResolvedValue({ text: 'a transcript', servedBy: 'primary' })
const analyzePhotoOR = vi.fn().mockResolvedValue('a description')
vi.mock('@/lib/ai/openrouter-client', () => ({
  transcribeAudioOR: (...args: unknown[]) => transcribeAudioOR(...args),
  analyzePhotoOR: (...args: unknown[]) => analyzePhotoOR(...args),
}))

const storageUpload = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/storage', () => ({
  getServerStorage: () => ({ upload: storageUpload }),
}))

const revertVagueEstimate = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/whatsapp/ask-details', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/whatsapp/ask-details')>()
  return {
    ...actual,
    revertVagueEstimate: (...args: unknown[]) => revertVagueEstimate(...args),
  }
})

// `estimateRow` controls the finalize estimate re-read (non-vague drives confirm).
let estimateRow: unknown = null
const sessionInsert = vi.fn().mockResolvedValue({ error: null })

function makeChainableClient() {
  const single = vi.fn().mockImplementation(async () => ({ data: estimateRow, error: null }))
  const eq = vi.fn()
  const select = vi.fn().mockReturnValue({ eq, single })
  eq.mockImplementation(() => ({ eq, single, then: undefined }))

  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'whatsapp_sessions') {
      return { insert: (...a: unknown[]) => sessionInsert(...a) }
    }
    if (table === 'estimates') {
      return { select, delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    }
    if (table === 'estimate_sections' || table === 'estimate_items') {
      return { select }
    }
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

// --- Helpers -----------------------------------------------------------------

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
  const graph = buildEstimateGraph()
  return graph.invoke(input as never)
}

function replyBody(callIndex = 0): string {
  const call = sendWhatsAppMessage.mock.calls[callIndex] as
    | [string, { text: { body: string } }]
    | undefined
  return call?.[1]?.text?.body ?? ''
}

beforeEach(() => {
  vi.clearAllMocks()
  sendWhatsAppMessage.mockResolvedValue(undefined)
  downloadWhatsAppMedia.mockResolvedValue(Buffer.from('x'))
  estimateRow = null
})

afterEach(() => {
  vi.resetModules()
})

describe('HARD-05: WhatsApp batch isolation + per-message reporting', () => {
  it('PARTIAL failure (1 of 2 ok:false) — builds estimate + ONE reply noting the dropped item', async () => {
    // One good text + one audio whose download rejects (ok:false). hasUsableInput
    // stays true (the text succeeds), so the graph generates and confirms.
    downloadWhatsAppMedia.mockRejectedValue(new Error('media gone'))
    generateEstimateForProject.mockResolvedValue({ estimateId: 'est-1', language: 'en' })
    // Non-vague estimate → sendConfirmation path ("Estimate ready - ...").
    // The single chainable mock serves BOTH the assess re-read (total +
    // sections.items) and the finalize confirm re-read (total + currency_code +
    // sections.title/subtotal), so the row carries every field both shapes need.
    estimateRow = {
      total: 1234,
      currency_code: 'USD',
      summary: 'ok',
      sections: [{ title: 'Work', subtotal: 1234, items: [{ id: 'i1' }] }],
    }

    await invoke({
      ...BASE,
      messages: [
        { id: 'm1', type: 'text', text: { body: 'paint the fence' } },
        { id: 'm2', type: 'audio', audio: { id: 'aud-1', mime_type: 'audio/ogg' } },
      ],
    })

    // Never-reply invariant: exactly one reply for the whole batch.
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1)
    expect(generateEstimateForProject).toHaveBeenCalledTimes(1)

    const body = replyBody()
    // Estimate-ready copy is present (the usable input still produced an estimate).
    expect(body).toMatch(/estimate ready/i)
    // LOAD-BEARING RED: a dropped-item note must appear in the SAME single reply.
    // Loose substring (Plan 03 finalizes wording/pluralization).
    expect(body).toMatch(/couldn't process 1/i)
  })

  it('TOTAL failure (all ok:false) — existing no-input reply, still exactly ONE reply (GREEN pin)', async () => {
    // Every message un-ingestable → hasUsableInput false → onError no-input path.
    downloadWhatsAppMedia.mockRejectedValue(new Error('media gone'))

    await invoke({
      ...BASE,
      messages: [
        { id: 'm1', type: 'audio', audio: { id: 'aud-1', mime_type: 'audio/ogg' } },
        { id: 'm2', type: 'image', image: { id: 'img-1', mime_type: 'image/jpeg' } },
      ],
    })

    // Exactly one reply, the existing no-input copy; generate never runs.
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1)
    expect(generateEstimateForProject).not.toHaveBeenCalled()
    expect(replyBody()).toMatch(/couldn't process your message/i)
  })
})
