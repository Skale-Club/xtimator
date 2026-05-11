import { describe, expect, it, vi, beforeEach } from 'vitest'
import { z } from 'zod'

import {
  XtimatorError,
  asResponse,
  throwIfNotFound,
  throwIfForbidden,
  throwIfBadRequest,
  asInternal,
} from '@/lib/errors'

// Silence console output in tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('XtimatorError', () => {
  it('builds composite code from type+surface', () => {
    const err = new XtimatorError('tier_limit', 'estimates', 'Exceeded')
    expect(err.code).toBe('tier_limit:estimates')
  })

  it('maps type to correct HTTP status code', () => {
    expect(new XtimatorError('bad_request', 'estimates', 'x').statusCode).toBe(400)
    expect(new XtimatorError('unauthorized', 'auth', 'x').statusCode).toBe(401)
    expect(new XtimatorError('forbidden', 'admin', 'x').statusCode).toBe(403)
    expect(new XtimatorError('not_found', 'projects', 'x').statusCode).toBe(404)
    expect(new XtimatorError('conflict', 'whatsapp', 'x').statusCode).toBe(409)
    expect(new XtimatorError('tier_limit', 'estimates', 'x').statusCode).toBe(402)
    expect(new XtimatorError('rate_limit', 'whatsapp', 'x').statusCode).toBe(429)
    expect(new XtimatorError('offline', 'translate', 'x').statusCode).toBe(503)
    expect(new XtimatorError('internal', 'database', 'x').statusCode).toBe(500)
  })

  it('returns per-code user message when present, falls back to type default', () => {
    const tier = new XtimatorError('tier_limit', 'estimates', 'x')
    expect(tier.userMessage).toContain('monthly estimate limit')

    const generic = new XtimatorError('not_found', 'company', 'x')
    expect(generic.userMessage).toBe('The requested resource was not found.')
  })

  it('flags internal errors as log-only', () => {
    expect(new XtimatorError('internal', 'database', 'x').logOnly).toBe(true)
    expect(new XtimatorError('not_found', 'projects', 'x').logOnly).toBe(false)
  })

  it('preserves cause and meta', () => {
    const cause = new Error('root cause')
    const err = new XtimatorError('internal', 'database', 'failed', cause, { extra: 1 })
    expect(err.cause).toBe(cause)
    expect(err.meta).toEqual({ extra: 1 })
  })
})

describe('asResponse', () => {
  it('returns typed response for XtimatorError with user message and code', async () => {
    const err = new XtimatorError('tier_limit', 'estimates', 'q exceeded', undefined, {
      used: 10,
      limit: 10,
    })
    const res = asResponse(err)
    expect(res.status).toBe(402)
    const body = await res.json()
    expect(body.code).toBe('tier_limit:estimates')
    expect(body.error).toContain('monthly estimate limit')
    expect(body.meta).toEqual({ used: 10, limit: 10 })
  })

  it('hides internal error details from response', async () => {
    const err = new XtimatorError('internal', 'database', 'connection refused')
    const res = asResponse(err)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).not.toContain('connection refused')
    expect(body.code).toBe('internal:database')
  })

  it('translates ZodError to 400 with field list', async () => {
    const schema = z.object({ name: z.string().min(1), age: z.number() })
    let zodErr: z.ZodError
    try {
      schema.parse({ name: '', age: 'not a number' })
      throw new Error('schema did not throw')
    } catch (err) {
      zodErr = err as z.ZodError
    }
    const res = asResponse(zodErr)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('bad_request:validation')
    expect(body.meta.fields.length).toBeGreaterThanOrEqual(1)
    expect(body.meta.fields[0]).toHaveProperty('path')
    expect(body.meta.fields[0]).toHaveProperty('message')
  })

  it('falls back to 500 generic for unknown errors', async () => {
    const res = asResponse(new Error('oops'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('internal:unknown')
  })

  it('handles thrown strings/objects without crashing', async () => {
    const res = asResponse('weird thrown value')
    expect(res.status).toBe(500)
  })
})

describe('throwIfNotFound', () => {
  it('throws not_found XtimatorError on null', () => {
    expect(() => throwIfNotFound(null, 'estimates')).toThrowError(XtimatorError)
    try {
      throwIfNotFound(null, 'estimates')
    } catch (err) {
      expect((err as XtimatorError).type).toBe('not_found')
      expect((err as XtimatorError).surface).toBe('estimates')
    }
  })

  it('throws not_found on undefined', () => {
    expect(() => throwIfNotFound(undefined, 'projects')).toThrowError(XtimatorError)
  })

  it('does NOT throw on valid value (incl. zero/empty string)', () => {
    expect(() => throwIfNotFound(0, 'estimates')).not.toThrow()
    expect(() => throwIfNotFound('', 'estimates')).not.toThrow()
    expect(() => throwIfNotFound({ id: 1 }, 'estimates')).not.toThrow()
  })
})

describe('throwIfForbidden', () => {
  it('throws forbidden when condition is false', () => {
    expect(() => throwIfForbidden(false, 'admin')).toThrowError(XtimatorError)
    try {
      throwIfForbidden(false, 'admin')
    } catch (err) {
      expect((err as XtimatorError).type).toBe('forbidden')
    }
  })

  it('does NOT throw when condition is true', () => {
    expect(() => throwIfForbidden(true, 'admin')).not.toThrow()
  })
})

describe('throwIfBadRequest', () => {
  it('throws bad_request when condition is false', () => {
    expect(() => throwIfBadRequest(false, 'photos')).toThrowError(XtimatorError)
  })

  it('does NOT throw when true', () => {
    expect(() => throwIfBadRequest(true, 'photos')).not.toThrow()
  })
})

describe('asInternal', () => {
  it('wraps unknown error as internal XtimatorError with cause', () => {
    const root = new Error('db down')
    const err = asInternal('database', root, 'lookup failed')
    expect(err.type).toBe('internal')
    expect(err.surface).toBe('database')
    expect(err.message).toBe('lookup failed')
    expect(err.cause).toBe(root)
  })
})
