/**
 * Phase 187 Plan 02 — MIG-03: coverage for scripts/r2-verify.ts's decision
 * logic via aws-sdk-client-mock. Zero real credentials, zero network calls,
 * zero `process.exit` escaping the test process (spied and restored).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'

const FAKE_ENV = {
  S3_ENDPOINT: 'https://fake-account.r2.cloudflarestorage.com',
  S3_REGION: 'auto',
  S3_ACCESS_KEY_ID: 'fake-access-key-id',
  S3_SECRET_ACCESS_KEY: 'fake-secret-access-key',
}

const config = {
  endpoint: FAKE_ENV.S3_ENDPOINT,
  region: FAKE_ENV.S3_REGION,
  accessKeyId: FAKE_ENV.S3_ACCESS_KEY_ID,
  secretAccessKey: FAKE_ENV.S3_SECRET_ACCESS_KEY,
  forcePathStyle: true,
}

function bodyOf(text: string) {
  const bytes = new TextEncoder().encode(text)
  return { transformToByteArray: async () => bytes }
}

const s3Mock = mockClient(S3Client)

beforeEach(() => {
  s3Mock.reset()
})

describe('r2-verify: module import has no side effects', () => {
  it('importing the module performs no S3 call and does not touch process.exit', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    vi.resetModules()
    s3Mock.reset()
    await import('../../../scripts/r2-verify')

    expect(s3Mock.calls()).toHaveLength(0)
    expect(exitSpy).not.toHaveBeenCalled()

    exitSpy.mockRestore()
  })
})

describe('EXPECTED_BUCKETS', () => {
  it('is exactly the five provisioned buckets', async () => {
    const { EXPECTED_BUCKETS } = await import('../../../scripts/r2-verify')
    expect(EXPECTED_BUCKETS).toEqual(['audio', 'photos', 'pdfs', 'logos', 'platform-brand'])
  })
})

describe('verifyBuckets', () => {
  it('resolves for all five buckets -> five ok:true results', async () => {
    const { EXPECTED_BUCKETS, verifyBuckets } = await import('../../../scripts/r2-verify')
    s3Mock.on(HeadBucketCommand).resolves({})

    const client = new S3Client(config)
    const results = await verifyBuckets(client, EXPECTED_BUCKETS)

    expect(results).toHaveLength(5)
    expect(results.every((r) => r.ok)).toBe(true)
  })

  it('HeadBucket rejecting for pdfs -> that entry is ok:false with the error name captured', async () => {
    const { EXPECTED_BUCKETS, verifyBuckets } = await import('../../../scripts/r2-verify')
    s3Mock.on(HeadBucketCommand).resolves({})
    s3Mock
      .on(HeadBucketCommand, { Bucket: 'pdfs' })
      .rejects(Object.assign(new Error('denied'), { name: 'AccessDenied' }))

    const client = new S3Client(config)
    const results = await verifyBuckets(client, EXPECTED_BUCKETS)

    const pdfsResult = results.find((r) => r.name.includes('pdfs'))
    expect(pdfsResult).toMatchObject({ ok: false, detail: 'AccessDenied' })
    expect(results.filter((r) => r.ok)).toHaveLength(4)
  })
})

describe('verifyScope', () => {
  it('HeadBucket rejecting (AccessDenied/NotFound) for the forbidden bucket -> ok:true (correctly denied)', async () => {
    const { verifyScope } = await import('../../../scripts/r2-verify')
    s3Mock
      .on(HeadBucketCommand, { Bucket: 'xtimator' })
      .rejects(Object.assign(new Error('not found'), { name: 'NotFound' }))

    const client = new S3Client(config)
    const result = await verifyScope(client, 'xtimator')

    expect(result.ok).toBe(true)
    expect(result.detail).toContain('correctly denied')
  })

  it('HeadBucket succeeding for the forbidden bucket -> ok:false (credential is broader than intended)', async () => {
    const { verifyScope } = await import('../../../scripts/r2-verify')
    s3Mock.on(HeadBucketCommand, { Bucket: 'xtimator' }).resolves({})

    const client = new S3Client(config)
    const result = await verifyScope(client, 'xtimator')

    expect(result.ok).toBe(false)
    expect(result.detail).toBe('token reaches a bucket outside the allowlist')
  })
})

describe('verifyRoundTrip', () => {
  it('upload -> sign -> download -> delete all succeed -> ok:true, delete called', async () => {
    const { verifyRoundTrip } = await import('../../../scripts/r2-verify')

    // Precise content-echo: capture the PutObjectCommand body and return it
    // from GetObjectCommand, so the round-trip's content comparison is real
    // (the payload embeds a live timestamp, so a canned response won't do).
    let putBody: string | undefined
    s3Mock.on(PutObjectCommand).callsFake((input) => {
      putBody = Buffer.from(input.Body as Uint8Array).toString('utf8')
      return {}
    })
    s3Mock.on(GetObjectCommand).callsFake(() => ({ Body: bodyOf(putBody ?? '') as never }))
    s3Mock.on(DeleteObjectCommand).resolves({})

    const result = await verifyRoundTrip('pdfs', config)

    expect(result).toMatchObject({ ok: true, name: 'roundtrip:pdfs' })
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(1)
  })

  it('download content mismatch -> ok:false, delete still attempted', async () => {
    const { verifyRoundTrip } = await import('../../../scripts/r2-verify')
    s3Mock.on(PutObjectCommand).resolves({})
    s3Mock.on(GetObjectCommand).resolves({ Body: bodyOf('not the payload') as never })
    s3Mock.on(DeleteObjectCommand).resolves({})

    const result = await verifyRoundTrip('pdfs', config)

    expect(result.ok).toBe(false)
    expect(result.detail).toContain('did not match')
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(1)
  })

  it('upload rejects -> ok:false, delete is still attempted (finally)', async () => {
    const { verifyRoundTrip } = await import('../../../scripts/r2-verify')
    s3Mock.on(PutObjectCommand).rejects(new Error('access denied'))
    s3Mock.on(DeleteObjectCommand).resolves({})

    const result = await verifyRoundTrip('pdfs', config)

    expect(result.ok).toBe(false)
    expect(result.detail).toContain('access denied')
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(1)
  })

  it('delete itself failing does not mask the primary result', async () => {
    const { verifyRoundTrip } = await import('../../../scripts/r2-verify')
    s3Mock.on(PutObjectCommand).resolves({})
    s3Mock.on(GetObjectCommand).resolves({ Body: bodyOf('not the payload') as never })
    s3Mock.on(DeleteObjectCommand).rejects(new Error('delete failed'))

    const result = await verifyRoundTrip('pdfs', config)

    expect(result.ok).toBe(false)
    expect(result.detail).toContain('did not match')
  })
})

describe('verifyPublicAccessDisabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('CLOUDFLARE_* vars absent -> SKIPPED, ok:true, skipped:true', async () => {
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', undefined)
    vi.stubEnv('CLOUDFLARE_API_TOKEN', undefined)
    const { verifyPublicAccessDisabled } = await import('../../../scripts/r2-verify')

    const result = await verifyPublicAccessDisabled('logos')

    expect(result).toMatchObject({ ok: true, skipped: true })
  })

  it('both vars set and managed-domain enabled=false -> PASS', async () => {
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'fake-account-id')
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'fake-token')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: { enabled: false } }),
      }),
    )
    const { verifyPublicAccessDisabled } = await import('../../../scripts/r2-verify')

    const result = await verifyPublicAccessDisabled('logos')

    expect(result.ok).toBe(true)
    expect(result.skipped).toBeFalsy()
  })

  it('managed-domain enabled=true -> FAIL (never a pass)', async () => {
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'fake-account-id')
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'fake-token')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: { enabled: true } }),
      }),
    )
    const { verifyPublicAccessDisabled } = await import('../../../scripts/r2-verify')

    const result = await verifyPublicAccessDisabled('logos')

    expect(result.ok).toBe(false)
  })

  it('non-200 response -> FAIL', async () => {
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'fake-account-id')
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'fake-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))
    const { verifyPublicAccessDisabled } = await import('../../../scripts/r2-verify')

    const result = await verifyPublicAccessDisabled('logos')

    expect(result.ok).toBe(false)
    expect(result.detail).toContain('403')
  })

  it('unparseable body -> FAIL', async () => {
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'fake-account-id')
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'fake-token')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('bad json')
        },
      }),
    )
    const { verifyPublicAccessDisabled } = await import('../../../scripts/r2-verify')

    const result = await verifyPublicAccessDisabled('logos')

    expect(result.ok).toBe(false)
  })

  it('missing enabled field -> FAIL', async () => {
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'fake-account-id')
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'fake-token')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: {} }) }),
    )
    const { verifyPublicAccessDisabled } = await import('../../../scripts/r2-verify')

    const result = await verifyPublicAccessDisabled('logos')

    expect(result.ok).toBe(false)
  })
})

describe('formatReport', () => {
  it('allPassed is true when every result is ok', async () => {
    const { formatReport } = await import('../../../scripts/r2-verify')
    const { allPassed } = formatReport([
      { name: 'a', ok: true, detail: 'x' },
      { name: 'b', ok: true, detail: 'y' },
    ])
    expect(allPassed).toBe(true)
  })

  it('allPassed is false when any result is ok:false', async () => {
    const { formatReport } = await import('../../../scripts/r2-verify')
    const { allPassed } = formatReport([
      { name: 'a', ok: true, detail: 'x' },
      { name: 'b', ok: false, detail: 'y' },
    ])
    expect(allPassed).toBe(false)
  })

  it('a SKIPPED entry does not flip allPassed to false, but renders distinctly from PASS', async () => {
    const { formatReport } = await import('../../../scripts/r2-verify')
    const { text, allPassed } = formatReport([
      { name: 'a', ok: true, detail: 'x' },
      { name: 'b', ok: true, skipped: true, detail: 'skipped reason' },
    ])
    expect(allPassed).toBe(true)
    expect(text).toContain('[SKIP] b')
    expect(text).not.toContain('[PASS] b')
  })
})

describe('main() — missing config', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('with S3_* unset, main() exits non-zero with a message naming the missing config, never throwing an SDK error', async () => {
    vi.stubEnv('S3_ENDPOINT', undefined)
    vi.stubEnv('S3_REGION', undefined)
    vi.stubEnv('S3_ACCESS_KEY_ID', undefined)
    vi.stubEnv('S3_SECRET_ACCESS_KEY', undefined)

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    s3Mock.reset()

    const { main } = await import('../../../scripts/r2-verify')
    await expect(main()).resolves.toBeUndefined()

    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errorSpy.mock.calls[0][0]).toContain('S3_*')
    // Never reached the SDK: no HeadBucket/PutObject/etc. calls were made.
    expect(s3Mock.calls()).toHaveLength(0)

    exitSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
