import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Invokes the REAL WhatsApp graph (heavy LangGraph tree, runtime dynamic import).
// Under vitest's reused forked worker the import can exceed the 5s default (import
// latency under contention); a timed-out invoke also bleeds a session insert into
// the next test. Per-file timeout removes both. (Not a global config / mock-reset flag.)
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/**
 * HARD-07 (replay-safe session TTL) — Wave 0 RED scaffold (Phase 102).
 *
 * The WhatsApp finalize mints `expires_at` for the `whatsapp_sessions` insert. It
 * MUST be derived from a durable, server-trusted graph-entry timestamp carried in
 * state (`requestedAt`, added by Plan 01) — NOT re-minted from `Date.now()` inside
 * the node. On an Inngest replay/retry the timestamp is stable, so the TTL does
 * not drift.
 *
 * This test drives the WhatsApp-composed graph (`buildEstimateGraph().invoke`,
 * `@/lib/whatsapp/estimate-graph`) twice with the SAME `requestedAt` and asserts:
 *   1. both captured `expires_at` values are IDENTICAL and equal
 *      `new Date(requestedAt + 30*60*1000).toISOString()`.
 *   2. `expires_at` is NOT a `Date.now()`-derived value sampled AFTER the invokes
 *      (proves it was derived from `requestedAt`, not re-minted in the node).
 *
 * RED today (intended): finalize computes `new Date(Date.now() + ...)`, and the
 * WhatsApp wiring does not thread `requestedAt` into core state yet. Two invokes
 * spaced apart in wall-clock time therefore produce DIFFERENT `expires_at` values
 * → assertion 1 fails; and the value tracks `Date.now()` → assertion 2 fails.
 *
 * Wave-1/2 owner: Phase 102 Plan 01 (HARD-07) adds the neutral `requestedAt`
 * state field, threads it from the Inngest event entry, and derives both TTL mint
 * sites from `state.requestedAt ?? Date.now()`.
 *
 * Mock harness copied from `tests/unit/whatsapp/never-reply-regression.test.ts`
 * (same module mocks + chainable Supabase client), extended so the
 * `whatsapp_sessions` insert payloads are recorded into a module-level array.
 * Mocks are scoped: cleared in beforeEach, modules reset in afterEach so the
 * suite does not leak into cross-file runs.
 */

const SESSION_TTL_MS = 30 * 60 * 1000

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

const revertVagueEstimate = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/whatsapp/ask-details', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/whatsapp/ask-details')>()
  return {
    ...actual,
    revertVagueEstimate: (...args: unknown[]) => revertVagueEstimate(...args),
  }
})

// `estimateRow` controls the shape returned by the finalize estimate re-read.
// A non-vague (positive total, has items) row drives the sendConfirmation path.
let estimateRow: unknown = null

// Capture every `whatsapp_sessions` insert payload so we can read `expires_at`.
const sessionInserts: Array<Record<string, unknown>> = []

function makeChainableClient() {
  const single = vi.fn().mockImplementation(async () => ({ data: estimateRow, error: null }))
  const eq = vi.fn()
  const select = vi.fn().mockReturnValue({ eq, single })
  eq.mockImplementation(() => ({ eq, single, then: undefined }))

  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'whatsapp_sessions') {
      return {
        insert: (payload: Record<string, unknown>) => {
          sessionInserts.push(payload)
          return Promise.resolve({ error: null })
        },
      }
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

beforeEach(() => {
  vi.clearAllMocks()
  sendWhatsAppMessage.mockResolvedValue(undefined)
  sessionInserts.length = 0
  // Drive the CONFIRM (non-vague) path so finalize hits sendConfirmation, which
  // performs the `whatsapp_sessions` (awaiting_confirm) insert with `expires_at`.
  generateEstimateForProject.mockResolvedValue({ estimateId: 'est-1', language: 'en' })
  // Non-vague: the single chainable mock serves BOTH the assess re-read
  // (total + sections.items) and the finalize confirm re-read (total +
  // currency_code + sections.title/subtotal), so include every field.
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

describe('HARD-07: replay-safe session TTL (expires_at derived from requestedAt)', () => {
  it('same requestedAt → identical expires_at across two finalize invocations', async () => {
    const FIXED_MS = 1_700_000_000_000 // fixed epoch ms — server-trusted graph-entry time
    const expected = new Date(FIXED_MS + SESSION_TTL_MS).toISOString()

    await invoke({
      ...BASE,
      requestedAt: FIXED_MS,
      messages: [{ id: 'm1', type: 'text', text: { body: 'paint the fence' } }],
    })
    // Space the second invocation apart in wall-clock time. A Date.now()-minted
    // TTL would drift between the two; a requestedAt-derived TTL stays identical.
    await new Promise((r) => setTimeout(r, 25))
    await invoke({
      ...BASE,
      requestedAt: FIXED_MS,
      messages: [{ id: 'm1', type: 'text', text: { body: 'paint the fence' } }],
    })

    expect(sessionInserts.length).toBe(2)
    const first = sessionInserts[0].expires_at as string
    const second = sessionInserts[1].expires_at as string

    // RED today: finalize mints Date.now(), so first !== second and neither
    // equals the requestedAt-derived value.
    expect(first).toBe(expected)
    expect(second).toBe(expected)
    expect(first).toBe(second)
  })

  it('expires_at is derived from requestedAt, not a post-invoke Date.now() re-mint', async () => {
    const FIXED_MS = 1_700_000_000_000

    await invoke({
      ...BASE,
      requestedAt: FIXED_MS,
      messages: [{ id: 'm1', type: 'text', text: { body: 'paint the fence' } }],
    })

    expect(sessionInserts.length).toBe(1)
    const expiresAt = new Date(sessionInserts[0].expires_at as string).getTime()

    // A value derived from requestedAt is FIXED_MS + TTL, far in the past relative
    // to "now + TTL". A Date.now()-re-minted value would be ~now + TTL.
    const nowDerived = Date.now() + SESSION_TTL_MS
    expect(expiresAt).toBe(FIXED_MS + SESSION_TTL_MS)
    // RED today: the node re-mints Date.now(), so expiresAt ≈ nowDerived, not the
    // historical requestedAt-derived value.
    expect(Math.abs(expiresAt - nowDerived)).toBeGreaterThan(SESSION_TTL_MS)
  })
})
