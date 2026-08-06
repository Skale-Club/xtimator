// @vitest-environment node
/**
 * Phase 188 Plan 05 — PROV-03: end-to-end single-backend proof for the
 * WhatsApp inbound media path.
 *
 * This is the concrete failure the whole 188 milestone exists to prevent:
 * `lib/estimate/adapters/whatsapp.ts` already honored `STORAGE_PROVIDER`
 * pre-Plan-01 (it called `getServerStorage()`), so flipping the flag made it
 * write inbound audio/photos to R2 while every reader (the admin inbox,
 * `lib/actions/admin-whatsapp.ts`) still read Supabase — silent 404s on
 * inbound media, no error anywhere. Plans 01-03 fixed the seam
 * (`lib/storage/server.ts`); this file proves it stays fixed.
 *
 * DESIGN — the anti-silent-pass mechanism:
 * The mocked Supabase service client's `.storage` property is a GETTER that
 * THROWS a distinctive error whenever it is read. In R2 mode, no code path
 * under test should ever touch Supabase Storage — so if a future regression
 * quietly routes a call back to Supabase (the split-brain bug), the poisoned
 * getter makes that failure LOUD (a thrown, named error) instead of merely
 * "different" (a wrong-but-plausible signed URL). This is stronger than
 * asserting "both writer and reader used R2" — it also proves Supabase
 * Storage was categorically unreachable on that path.
 *
 * TEST-ONLY WORKAROUND (not a production change — see SUMMARY "Deviations"):
 * `lib/storage/server.ts` lazily `require()`s `./s3-provider` and
 * `@/lib/supabase/service` behind an exported `__internal` seam (Plan 01,
 * see that file's own docblock). Vitest's SSR `require()` shim cannot
 * resolve either specifier at runtime — independent of `vi.mock`, which only
 * intercepts `import`/dynamic `import()` — a pre-existing, Vitest-only
 * Node-CJS limitation `tests/unit/storage/server-provider.test.ts` already
 * documents and works around the exact same way: `vi.spyOn` the two
 * `__internal` loaders so they return the REAL `createS3StorageProvider`
 * (imported here via a normal, working `import`, so it runs the actual
 * `lib/storage/s3-provider.ts` code against the mocked AWS SDK below) and
 * the mocked `requireServiceClient`. Neither `lib/storage/server.ts` nor
 * `lib/storage/s3-provider.ts` is modified by this workaround.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Heavy real-module imports (LangGraph adapter graph). Mirrors the timeout
// rationale in tests/unit/whatsapp/never-reply-regression.test.ts and
// tests/unit/estimate/channel-adapter.test.ts — import LATENCY under vitest's
// shared forked worker, not a mock leak.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const POISON_MESSAGE = 'Supabase Storage reached while R2 is configured'

// ---------------------------------------------------------------------------
// In-memory R2 store + AWS SDK mock. Mocking the SDK, not the provider —
// lib/storage/s3-provider.ts must stay byte-identical (verified in Task 1's
// `git diff --stat` check and this file's own static assertion below).
// ---------------------------------------------------------------------------

interface StoredObject {
  body: Uint8Array
  contentType?: string
}
interface PutCall {
  Bucket: string
  Key: string
  ContentType?: string
}

let r2Store = new Map<string, StoredObject>()
let putCalls: PutCall[] = []

vi.mock('@aws-sdk/client-s3', () => {
  class PutObjectCommand {
    readonly kind = 'put' as const
    constructor(public input: { Bucket: string; Key: string; Body: unknown; ContentType?: string }) {}
  }
  class GetObjectCommand {
    readonly kind = 'get' as const
    constructor(public input: { Bucket: string; Key: string }) {}
  }
  class DeleteObjectCommand {
    readonly kind = 'delete' as const
    constructor(public input: { Bucket: string; Key: string }) {}
  }
  class ListObjectsV2Command {
    readonly kind = 'list' as const
    constructor(public input: { Bucket: string; Prefix?: string }) {}
  }
  class S3Client {
    constructor(public config: unknown) {}
    async send(
      cmd:
        | InstanceType<typeof PutObjectCommand>
        | InstanceType<typeof GetObjectCommand>
        | InstanceType<typeof DeleteObjectCommand>
        | InstanceType<typeof ListObjectsV2Command>
    ) {
      if (cmd.kind === 'put') {
        const key = `${cmd.input.Bucket}/${cmd.input.Key}`
        const raw = (cmd as InstanceType<typeof PutObjectCommand>).input.Body
        const body = raw instanceof Uint8Array ? raw : new Uint8Array(0)
        const contentType = (cmd as InstanceType<typeof PutObjectCommand>).input.ContentType
        r2Store.set(key, { body, contentType })
        putCalls.push({ Bucket: cmd.input.Bucket, Key: cmd.input.Key, ContentType: contentType })
        return {}
      }
      if (cmd.kind === 'get') {
        const key = `${cmd.input.Bucket}/${cmd.input.Key}`
        const obj = r2Store.get(key)
        if (!obj) throw new Error(`fake-r2: no object at ${key}`)
        return { Body: { transformToByteArray: async () => obj.body } }
      }
      if (cmd.kind === 'delete') {
        r2Store.delete(`${cmd.input.Bucket}/${cmd.input.Key}`)
        return {}
      }
      // list — unused by this test, kept faithful to the real SDK shape.
      return { Contents: [] }
    }
  }
  return { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command }
})

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: async (_client: unknown, cmd: { input: { Bucket: string; Key: string } }) =>
    `https://fake-r2.test/${cmd.input.Bucket}/${cmd.input.Key}?X-Amz-Signature=stub`,
}))

// ---------------------------------------------------------------------------
// WhatsApp / AI side-effect mocks — copied from the mock harness of
// tests/unit/whatsapp/never-reply-regression.test.ts and
// tests/unit/estimate/channel-adapter.test.ts. NOT mocked: @/lib/storage/server
// (the seam under test) and lib/whatsapp/media.ts (the real MIME/ext + buffer
// glue that sits between the adapter and the AI primitives below).
// ---------------------------------------------------------------------------

const downloadWhatsAppMedia = vi.fn()
const sendWhatsAppMessage = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/whatsapp/client', () => ({
  downloadWhatsAppMedia: (...args: unknown[]) => downloadWhatsAppMedia(...args),
  sendWhatsAppMessage: (...args: unknown[]) => sendWhatsAppMessage(...args),
}))

vi.mock('@/lib/whatsapp/conversations', () => ({
  logOutboundMessage: vi.fn().mockResolvedValue(undefined),
}))

const transcribeAudioOR = vi.fn().mockResolvedValue({ text: 'a transcript', servedBy: 'primary' })
const analyzePhotoOR = vi.fn().mockResolvedValue('a description')
vi.mock('@/lib/ai/openrouter-client', () => ({
  transcribeAudioOR: (...args: unknown[]) => transcribeAudioOR(...args),
  analyzePhotoOR: (...args: unknown[]) => analyzePhotoOR(...args),
}))

vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: vi.fn(async () => ({ userId: 'admin-1', email: 'admin@test.com' })),
}))

// ---------------------------------------------------------------------------
// Chainable Supabase service-client mock. Two legs:
//   - poisonStorage: true  -> `.storage` getter throws POISON_MESSAGE (R2 leg)
//   - poisonStorage: false -> `.storage` is a real-shaped Supabase Storage
//     stub whose calls are captured (the reversibility twin, Part A)
// `.from(...)` always resolves the DB reads/writes the adapter and the
// reader perform (whatsapp_messages, photos, recordings, whatsapp_conversations).
// ---------------------------------------------------------------------------

function makeChain(finalData: unknown = null) {
  const node: Record<string, unknown> = {}
  const self = () => node
  node.eq = vi.fn(self)
  node.gte = vi.fn(self)
  node.lte = vi.fn(self)
  node.order = vi.fn(self)
  node.limit = vi.fn(async () => ({ data: finalData, error: null }))
  node.maybeSingle = vi.fn(async () => ({ data: finalData, error: null }))
  node.single = vi.fn(async () => ({ data: finalData, error: null }))
  return node
}

let supabaseUploadCalls: Array<{ bucket: string; path: string; contentType?: string }> = []
let supabaseSignCalls: Array<{ bucket: string; path: string }> = []

function makeSupabaseStorageStub() {
  return {
    from: (bucket: string) => ({
      upload: vi.fn(async (uploadPath: string, _body: unknown, opts?: { contentType?: string }) => {
        supabaseUploadCalls.push({ bucket, path: uploadPath, contentType: opts?.contentType })
        return { data: { path: uploadPath }, error: null }
      }),
      createSignedUrl: vi.fn(async (signPath: string, _expiresIn: number) => {
        supabaseSignCalls.push({ bucket, path: signPath })
        return {
          data: {
            signedUrl: `https://fake-project.supabase.co/storage/v1/object/sign/${bucket}/${signPath}?token=stub`,
          },
          error: null,
        }
      }),
    }),
  }
}

interface ServiceClientOpts {
  poisonStorage: boolean
  conversationRow?: unknown
  messagesRows?: unknown[]
}

function makeServiceClient(opts: ServiceClientOpts) {
  const from = vi.fn((table: string) => {
    if (table === 'whatsapp_conversations') {
      return { select: vi.fn(() => makeChain(opts.conversationRow ?? null)) }
    }
    if (table === 'whatsapp_messages') {
      return {
        select: vi.fn(() => makeChain(opts.messagesRows ?? [])),
        update: vi.fn(() => makeChain(null)),
      }
    }
    // recordings / photos / any other table — insert/update/select all resolve.
    return {
      insert: vi.fn(async () => ({ error: null })),
      update: vi.fn(() => makeChain(null)),
      select: vi.fn(() => makeChain(null)),
    }
  })

  const client: Record<string, unknown> = { from }

  if (opts.poisonStorage) {
    // THE anti-silent-pass mechanism (see file header). A getter, not a
    // value — reading `.storage` at all throws, so even a call site that
    // never invokes a method on it (just accesses the property) is caught.
    Object.defineProperty(client, 'storage', {
      configurable: true,
      get() {
        throw new Error(POISON_MESSAGE)
      },
    })
  } else {
    client.storage = makeSupabaseStorageStub()
  }

  return client
}

let currentServiceClient: ReturnType<typeof makeServiceClient> | null = null

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => currentServiceClient,
  createServiceClient: () => currentServiceClient,
}))

// ---------------------------------------------------------------------------
// Real imports — the seam under test and its consumers. NEVER mocked.
// ---------------------------------------------------------------------------

import * as storageServer from '@/lib/storage/server'
import { createS3StorageProvider } from '@/lib/storage/s3-provider'
import { requireServiceClient as mockedRequireServiceClient } from '@/lib/supabase/service'
import { makeWhatsAppAdapter } from '@/lib/estimate/adapters/whatsapp'
import { loadAdminConversationThread } from '@/lib/actions/admin-whatsapp'
import type { EstimateStateType } from '@/lib/estimate/graph/state'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'

// Install the __internal test seam once (see file header "TEST-ONLY WORKAROUND").
beforeAll(() => {
  vi.spyOn(storageServer.__internal, 'loadS3Provider').mockReturnValue({
    createS3StorageProvider,
  } as never)
  vi.spyOn(storageServer.__internal, 'loadServiceClient').mockReturnValue({
    requireServiceClient: mockedRequireServiceClient,
  } as never)
})

const COMPANY_ID = 'company-1'
const PROJECT_ID = 'project-1'
const OWNER_PHONE = '+15555550123'

const IMAGE_MSG_ID = 'wamid.IMAGE1'
const IMAGE_MEDIA_ID = 'media-img-1'
const AUDIO_MSG_ID = 'wamid.AUDIO1'
const AUDIO_MEDIA_ID = 'media-aud-1'

const EXPECTED_IMAGE_KEY = `${COMPANY_ID}/whatsapp/${PROJECT_ID}-${IMAGE_MEDIA_ID}.jpeg`
const EXPECTED_AUDIO_KEY = `${COMPANY_ID}/whatsapp/${AUDIO_MSG_ID}.ogg`

function imageMessage(): WhatsAppMessage {
  return {
    id: IMAGE_MSG_ID,
    from: '15555550999',
    timestamp: '1710000000',
    type: 'image',
    image: { id: IMAGE_MEDIA_ID, mime_type: 'image/jpeg' },
  }
}

function audioMessage(): WhatsAppMessage {
  return {
    id: AUDIO_MSG_ID,
    from: '15555550999',
    timestamp: '1710000001',
    type: 'audio',
    audio: { id: AUDIO_MEDIA_ID, mime_type: 'audio/ogg; codecs=opus' },
  }
}

async function driveIngest(messages: WhatsAppMessage[]) {
  const supabase = { from: () => ({}) } as never
  const adapter = makeWhatsAppAdapter({
    companyId: COMPANY_ID,
    supabase,
    ownerPhone: OWNER_PHONE,
    messages,
  })
  return adapter.ingest({ projectId: PROJECT_ID } as EstimateStateType)
}

beforeEach(() => {
  r2Store = new Map()
  putCalls = []
  supabaseUploadCalls = []
  supabaseSignCalls = []
  downloadWhatsAppMedia.mockReset()
  downloadWhatsAppMedia.mockImplementation(async (mediaId: string) =>
    Buffer.from(`fake-bytes-${mediaId}`)
  )
  transcribeAudioOR.mockClear()
  analyzePhotoOR.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// =============================================================================
// Part A / Task 1 — R2 configured: write and read on the SAME backend, with
// the Supabase Storage surface poisoned (the anti-silent-pass mechanism).
// =============================================================================

describe('WhatsApp inbound media — single-backend proof (R2 configured)', () => {
  beforeEach(() => {
    vi.stubEnv('S3_ENDPOINT', 'https://example-account.r2.cloudflarestorage.com')
    vi.stubEnv('S3_REGION', 'auto')
    vi.stubEnv('S3_ACCESS_KEY_ID', 'test-access-key-id')
    vi.stubEnv('S3_SECRET_ACCESS_KEY', 'test-secret-access-key')
    vi.stubEnv('S3_FORCE_PATH_STYLE', 'true')
    vi.stubEnv('STORAGE_PROVIDER', '')
    currentServiceClient = makeServiceClient({ poisonStorage: true })
  })

  it('serverStorageBackend() resolves r2', () => {
    expect(storageServer.serverStorageBackend()).toBe('r2')
  })

  it('an inbound image writes exactly one object to R2 (bucket photos, expected key, content type)', async () => {
    const result = await driveIngest([imageMessage()])

    expect(result).toEqual({}) // full success — no failure, no droppedInputs
    expect(putCalls).toHaveLength(1)
    expect(putCalls[0].Bucket).toBe('photos')
    expect(putCalls[0].Key).toBe(EXPECTED_IMAGE_KEY)
    expect(putCalls[0].ContentType).toBe('image/jpeg')
    expect(r2Store.has(`photos/${EXPECTED_IMAGE_KEY}`)).toBe(true)
  })

  it('an inbound audio writes exactly one object to R2 (bucket audio, expected key)', async () => {
    const result = await driveIngest([audioMessage()])

    expect(result).toEqual({})
    expect(putCalls).toHaveLength(1)
    expect(putCalls[0].Bucket).toBe('audio')
    expect(putCalls[0].Key).toBe(EXPECTED_AUDIO_KEY)
    expect(r2Store.has(`audio/${EXPECTED_AUDIO_KEY}`)).toBe(true)
  })

  it('loadAdminConversationThread signs URLs at the SAME keys the writer produced, from R2, never Supabase', async () => {
    // Drive both writer legs first so their keys exist in the fake R2 bucket.
    await driveIngest([imageMessage(), audioMessage()])
    expect(putCalls).toHaveLength(2)
    const putImageKey = putCalls.find((c) => c.Bucket === 'photos')!.Key
    const putAudioKey = putCalls.find((c) => c.Bucket === 'audio')!.Key

    // Reconfigure the service client for the reader leg: same poisoned
    // storage getter, but now with rows whose media_url holds those exact keys.
    currentServiceClient = makeServiceClient({
      poisonStorage: true,
      conversationRow: { id: 'conv-1', company_id: COMPANY_ID },
      messagesRows: [
        { id: 'm-img', conversation_id: 'conv-1', msg_type: 'image', media_url: putImageKey },
        { id: 'm-aud', conversation_id: 'conv-1', msg_type: 'audio', media_url: putAudioKey },
      ],
    })

    const result = await loadAdminConversationThread('conv-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const [imgMsg, audMsg] = result.thread.messages as Array<{ media_url: string | null }>

    // (a) contains the key
    expect(imgMsg.media_url).toContain(putImageKey)
    expect(audMsg.media_url).toContain(putAudioKey)
    // (b) points at the fake R2 host
    expect(imgMsg.media_url).toContain('fake-r2.test')
    expect(audMsg.media_url).toContain('fake-r2.test')
    // (c) contains no supabase.co substring
    expect(imgMsg.media_url).not.toContain('supabase.co')
    expect(audMsg.media_url).not.toContain('supabase.co')

    // KEY LINK: the reader looked at the SAME key the writer wrote, not merely
    // "some R2 key". Both used R2 is not enough on its own.
    expect(imgMsg.media_url).toBe(
      `https://fake-r2.test/photos/${putImageKey}?X-Amz-Signature=stub`
    )
    expect(audMsg.media_url).toBe(
      `https://fake-r2.test/audio/${putAudioKey}?X-Amz-Signature=stub`
    )
  })

  it('the Supabase Storage surface is never touched — poisoned getter never fires', async () => {
    await driveIngest([imageMessage(), audioMessage()])

    currentServiceClient = makeServiceClient({
      poisonStorage: true,
      conversationRow: { id: 'conv-1', company_id: COMPANY_ID },
      messagesRows: [
        { id: 'm-img', conversation_id: 'conv-1', msg_type: 'image', media_url: EXPECTED_IMAGE_KEY },
      ],
    })
    // The getter throws SYNCHRONOUSLY the instant `.storage` is read — if the
    // reader (or the writer above) ever fell back to Supabase, this whole
    // test would already have thrown POISON_MESSAGE and failed. Assert that
    // explicitly too, so the mechanism itself is under test, not just relied on.
    let threw = false
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      ;(currentServiceClient as unknown as { storage: unknown }).storage
    } catch (err) {
      threw = true
      expect((err as Error).message).toBe(POISON_MESSAGE)
    }
    expect(threw).toBe(true) // sanity: the poison mechanism itself works

    const result = await loadAdminConversationThread('conv-1')
    expect(result.ok).toBe(true)
    // Reaching here without a POISON_MESSAGE throw IS the assertion that no
    // storage call escaped to Supabase during the full write+read drive above.
  })

  it('the captured PutObjectCommand Key equals the key embedded in the presigned URL (reader looks where writer wrote)', async () => {
    await driveIngest([imageMessage()])
    const putKey = putCalls[0].Key

    currentServiceClient = makeServiceClient({
      poisonStorage: true,
      conversationRow: { id: 'conv-1', company_id: COMPANY_ID },
      messagesRows: [
        { id: 'm-img', conversation_id: 'conv-1', msg_type: 'image', media_url: putKey },
      ],
    })

    const result = await loadAdminConversationThread('conv-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [imgMsg] = result.thread.messages as Array<{ media_url: string | null }>
    // Parse the key back out of the fake presigned URL and compare to the
    // exact Key the PutObjectCommand captured.
    const match = imgMsg.media_url?.match(/^https:\/\/fake-r2\.test\/photos\/(.+)\?X-Amz-Signature=stub$/)
    expect(match).not.toBeNull()
    expect(match?.[1]).toBe(putKey)
  })
})

// =============================================================================
// Part B / Task 2 Part A — the reversibility twin: pull S3_* and the SAME
// path returns to Supabase, no code change.
// =============================================================================

describe('WhatsApp inbound media — reversibility twin (S3_* removed, Supabase)', () => {
  beforeEach(() => {
    vi.stubEnv('S3_ENDPOINT', '')
    vi.stubEnv('S3_REGION', '')
    vi.stubEnv('S3_ACCESS_KEY_ID', '')
    vi.stubEnv('S3_SECRET_ACCESS_KEY', '')
    vi.stubEnv('S3_FORCE_PATH_STYLE', '')
    vi.stubEnv('STORAGE_PROVIDER', '')
    currentServiceClient = makeServiceClient({ poisonStorage: false })
  })

  it('serverStorageBackend() resolves supabase', () => {
    expect(storageServer.serverStorageBackend()).toBe('supabase')
  })

  it('the writer uploads through the Supabase client; the fake R2 store stays empty', async () => {
    const result = await driveIngest([imageMessage(), audioMessage()])

    expect(result).toEqual({})
    expect(r2Store.size).toBe(0)
    expect(putCalls).toHaveLength(0)

    expect(supabaseUploadCalls).toHaveLength(2)
    expect(supabaseUploadCalls.find((c) => c.bucket === 'photos')?.path).toBe(EXPECTED_IMAGE_KEY)
    expect(supabaseUploadCalls.find((c) => c.bucket === 'audio')?.path).toBe(EXPECTED_AUDIO_KEY)
  })

  it('the reader mints its signed URL via the Supabase client; the presigner mock is never called', async () => {
    await driveIngest([imageMessage()])

    currentServiceClient = makeServiceClient({
      poisonStorage: false,
      conversationRow: { id: 'conv-1', company_id: COMPANY_ID },
      messagesRows: [
        { id: 'm-img', conversation_id: 'conv-1', msg_type: 'image', media_url: EXPECTED_IMAGE_KEY },
      ],
    })

    const result = await loadAdminConversationThread('conv-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [imgMsg] = result.thread.messages as Array<{ media_url: string | null }>

    expect(imgMsg.media_url).toContain('supabase.co')
    expect(imgMsg.media_url).not.toContain('fake-r2.test')
    expect(supabaseSignCalls).toHaveLength(1)
    expect(supabaseSignCalls[0]).toEqual({ bucket: 'photos', path: EXPECTED_IMAGE_KEY })
  })
})

// =============================================================================
// Part B (Task 2) — pin the estimate-pipeline photo readers to the seam.
// Deliberately static, not a third end-to-end drive: the @react-pdf render
// graph (lib/pdf/render-estimate-pdf.ts) is not worth booting in-process to
// re-prove a property the seam already guarantees end-to-end above, and
// Plan 04's import-graph census independently proves the reader set is
// complete (this list is illustrative of SC3's "estimate pipeline", not a
// substitute for that census).
// =============================================================================

describe('estimate-pipeline photo readers are pinned to the seam', () => {
  const ESTIMATE_PIPELINE_PHOTO_READERS = [
    'lib/actions/admin-whatsapp.ts', // WhatsApp inbox playback
    'lib/pdf/render-estimate-pdf.ts', // photos embedded in the generated PDF
    'lib/queries/share.ts', // photos on the public share page
  ] as const

  for (const relPath of ESTIMATE_PIPELINE_PHOTO_READERS) {
    it(`${relPath} imports from @/lib/storage/server and never calls createStorage(`, () => {
      const src = readFileSync(resolve(process.cwd(), relPath), 'utf8')
      expect(
        src,
        `${relPath} must import serverStorage/getServerStorage from '@/lib/storage/server' — ` +
          `a reader drifting off the seam is exactly what produces the split-brain 404s this plan proves against.`
      ).toContain("from '@/lib/storage/server'")
      expect(
        src,
        `${relPath} must not call createStorage(...) directly — that always returns the Supabase ` +
          `provider regardless of STORAGE_PROVIDER/S3_*, silently splitting this reader off the seam.`
      ).not.toMatch(/\bcreateStorage\(/)
    })
  }
})
