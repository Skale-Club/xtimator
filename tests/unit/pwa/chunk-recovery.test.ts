import { describe, expect, it } from 'vitest'
import { buildChunkRecoveryUrl, isRecoverableChunkError } from '@/lib/pwa/chunk-recovery'

describe('chunk recovery helpers', () => {
  it('detects Next.js ChunkLoadError failures', () => {
    const error = new Error('Loading chunk 964893 failed.')
    error.name = 'ChunkLoadError'

    expect(isRecoverableChunkError(error)).toBe(true)
  })

  it('detects stale _next/static/chunks MIME failures', () => {
    expect(
      isRecoverableChunkError(
        "Refused to execute script from '/_next/static/chunks/07s-ujf.2tt_x.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled."
      )
    ).toBe(true)
  })

  it('detects dynamic import failures from nested causes', () => {
    const cause = new Error('Failed to fetch dynamically imported module')
    const error = new Error('Route render failed', { cause })

    expect(isRecoverableChunkError(error)).toBe(true)
  })

  it('does not treat unrelated runtime errors as recoverable chunk failures', () => {
    expect(isRecoverableChunkError(new Error('Cannot read properties of null'))).toBe(false)
  })

  it('builds a same-path recovery URL with a cache-busting query param', () => {
    expect(
      buildChunkRecoveryUrl(
        { pathname: '/dashboard', search: '?tab=clients', hash: '#top' } as Location,
        12345
      )
    ).toBe('/dashboard?tab=clients&xtimator_chunk_recovery=12345#top')
  })
})
