import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * QA-01 — FROZEN never-throw / always-reply regression (Phase 94 Wave 0).
 *
 * This is the behavioral safety net for the canonical-graph extraction. It
 * invokes the WhatsApp-composed graph (`buildEstimateGraph()` from
 * `@/lib/whatsapp/estimate-graph`) end-to-end with mocked side-effects and
 * freezes the observable contract that MUST survive the extraction:
 *
 *   INVARIANT (all paths): `graph.invoke(...)` RESOLVES (never rejects) AND
 *   the owner receives EXACTLY ONE WhatsApp reply (`sendWhatsAppMessage`
 *   called exactly once).
 *
 * Three frozen failure paths (per 94-RESEARCH.md "QA-01 frozen-test design"):
 *   - Path A — no usable input: every message fails ingestion (mediaResults
 *     all ok:false) → checkInputsEdge → sendError → ONE reply with the
 *     no-input copy ("couldn't process your message").
 *   - Path B — generation throws: `generateEstimateForProject` rejects →
 *     generateEstimate sets `generationFailed` (does NOT throw) →
 *     checkGeneratedEdge → sendError → ONE reply with the generation-failed
 *     copy.
 *   - Path C — vague estimate: AI succeeds but the estimate is total 0 / no
 *     items → evaluateVagueness isVague:true → askDetails → revertVagueEstimate
 *     called + `awaiting_details` session insert + ONE reply (ask-details copy).
 *
 * It runs against the CURRENT graph today (the WhatsApp StateGraph still lives
 * in `lib/whatsapp/estimate-graph.ts`). After the Wave 2-4 extraction it must
 * stay green with NO assertion changes — that is the whole point of a frozen
 * test. Mirrors the chainable-Supabase mock style of
 * `tests/unit/whatsapp/ask-details.test.ts`.
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

const transcribeAudioOR = vi.fn().mockResolvedValue('a transcript')
const analyzePhotoOR = vi.fn().mockResolvedValue('a description')
vi.mock('@/lib/ai/openrouter-client', () => ({
  transcribeAudioOR: (...args: unknown[]) => transcribeAudioOR(...args),
  analyzePhotoOR: (...args: unknown[]) => analyzePhotoOR(...args),
}))

const storageUpload = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/storage', () => ({
  getServerStorage: () => ({ upload: storageUpload }),
}))

// Keep the real localized copy (buildAskDetailsMessage / isVagueEstimate) so
// the Path C reply substring assertion is authentic; only spy revertVagueEstimate.
const revertVagueEstimate = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/whatsapp/ask-details', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/whatsapp/ask-details')>()
  return {
    ...actual,
    revertVagueEstimate: (...args: unknown[]) => revertVagueEstimate(...args),
  }
})

// Chainable Supabase service mock. `estimateRow` controls the shape returned by
// the evaluateVagueness re-read (drives the vague vs confirm branch).
let estimateRow: unknown = null
const sessionInsert = vi.fn().mockResolvedValue({ error: null })

function makeChainableClient() {
  // Generic chainable builder: every terminal (`single`, `insert`, `update`,
  // `eq`) resolves; `select(...).eq(...).single()` returns `estimateRow`.
  const single = vi.fn().mockImplementation(async () => ({ data: estimateRow, error: null }))
  const eq = vi.fn()
  const select = vi.fn().mockReturnValue({ eq, single })
  // chainable .eq() that can terminate (resolve) or continue (.single())
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
    // recordings / photos / whatsapp_messages / projects → insert/update/select all resolve
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

/** Invoke the WhatsApp-composed graph and assert it RESOLVES (never rejects). */
async function invokeNeverReject(input: Record<string, unknown>) {
  const { buildEstimateGraph } = await import('@/lib/whatsapp/estimate-graph')
  const graph = buildEstimateGraph()
  try {
    return await graph.invoke(input as never)
  } catch (err) {
    expect.fail(
      `graph.invoke must never reject (the silent-failure guarantee) — got: ${String(err)}`
    )
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  sendWhatsAppMessage.mockResolvedValue(undefined)
  estimateRow = null
})

describe('QA-01: WhatsApp never-throw / always-reply (frozen behavioral regression)', () => {
  it('Path A — no usable input: exactly one no-input reply, invoke resolves', async () => {
    // Make every inbound message un-ingestable so mediaResults are all ok:false.
    downloadWhatsAppMedia.mockRejectedValue(new Error('media gone'))

    await invokeNeverReject({
      ...BASE,
      messages: [
        { id: 'm1', type: 'audio', audio: { id: 'aud-1', mime_type: 'audio/ogg' } },
      ],
    })

    // Exactly one reply, carrying the no-input copy (NOT the generation-failed copy).
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1)
    const [, payload] = sendWhatsAppMessage.mock.calls[0] as [string, { text: { body: string } }]
    expect(payload.text.body).toMatch(/couldn't process your message/i)
    expect(generateEstimateForProject).not.toHaveBeenCalled()
  })

  it('Path B — generation throws: failure-as-state → exactly one generation-failed reply, invoke resolves', async () => {
    // Ingestion succeeds (text message) so we reach generateEstimate, which rejects.
    generateEstimateForProject.mockRejectedValueOnce(new Error('OpenRouter 401 User not found'))

    await invokeNeverReject({
      ...BASE,
      messages: [{ id: 'm1', type: 'text', text: { body: 'paint the fence' } }],
    })

    expect(generateEstimateForProject).toHaveBeenCalledTimes(1)
    // Exactly one reply, carrying the generation-failed copy (distinct from no-input).
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1)
    const [, payload] = sendWhatsAppMessage.mock.calls[0] as [string, { text: { body: string } }]
    expect(payload.text.body).toMatch(/problem generating your estimate/i)
    // sendConfirmation / askDetails must NOT have run.
    expect(sessionInsert).not.toHaveBeenCalled()
  })

  it('Path C — vague estimate: askDetails reverts + awaiting_details session + exactly one reply, invoke resolves', async () => {
    // Generation succeeds…
    generateEstimateForProject.mockResolvedValueOnce({ estimateId: 'est-1', language: 'en' })
    // …but the re-read estimate is vague (total 0, no items) → isVague:true.
    estimateRow = { total: 0, sections: [{ items: [] }] }

    await invokeNeverReject({
      ...BASE,
      messages: [{ id: 'm1', type: 'text', text: { body: 'do some work' } }],
    })

    expect(generateEstimateForProject).toHaveBeenCalledTimes(1)
    // Vague path side-effects: revert the $0 estimate + persist an awaiting_details session.
    expect(revertVagueEstimate).toHaveBeenCalledTimes(1)
    expect(sessionInsert).toHaveBeenCalledTimes(1)
    const sessionArg = sessionInsert.mock.calls[0][0] as { state: string }
    expect(sessionArg.state).toBe('awaiting_details')
    // Exactly one reply, carrying the ask-details copy (real buildAskDetailsMessage('en')).
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1)
    const [, payload] = sendWhatsAppMessage.mock.calls[0] as [string, { text: { body: string } }]
    expect(payload.text.body).toMatch(/details/i)
  })
})
