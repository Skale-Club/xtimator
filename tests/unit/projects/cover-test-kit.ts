// Shared fakes for the project-cover tests: a table-driven Supabase stub and an
// in-memory storage provider. Not a test file (no *.test suffix).
import { vi } from 'vitest'

export const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
export const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
export const PHOTO_ID = '33333333-3333-4333-8333-333333333333'

export interface Call {
  table: string
  op: 'select' | 'update' | 'insert'
  filters: Record<string, unknown>
  patch?: Record<string, unknown>
}

type Result = { data: unknown; error?: { message: string } | null }

/** A chainable Supabase stub: every query is recorded and answered by `handler`. */
export function makeSupabase(handler: (call: Call) => Result) {
  const calls: Call[] = []
  const from = (table: string) => {
    const call: Call = { table, op: 'select', filters: {} }
    const run = () => {
      calls.push(call)
      const result = handler(call)
      return { data: result.data, error: result.error ?? null }
    }
    const builder: Record<string, unknown> = {
      select: () => builder,
      update: (patch: Record<string, unknown>) => {
        call.op = 'update'
        call.patch = patch
        return builder
      },
      insert: (patch: Record<string, unknown>) => {
        call.op = 'insert'
        call.patch = patch
        return builder
      },
      eq: (key: string, value: unknown) => {
        call.filters[key] = value
        return builder
      },
      is: (key: string, value: unknown) => {
        call.filters[`${key}:is`] = value
        return builder
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => Promise.resolve(run()),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    }
    return builder
  }
  const client = {
    from,
    auth: { getClaims: async () => ({ data: { claims: { sub: 'user-1' } } }) },
  }
  return { client, calls }
}

/** In-memory `photos` bucket. `log` records upload/delete order for ordering assertions. */
export function makeStorage(initial: Record<string, Uint8Array> = {}) {
  const objects = new Map<string, Uint8Array>(Object.entries(initial))
  const log: string[] = []
  const provider = {
    upload: vi.fn(async (_bucket: string, key: string, body: Uint8Array) => {
      objects.set(key, body)
      log.push(`upload:${key}`)
      return { path: key }
    }),
    download: vi.fn(async (_bucket: string, key: string) => {
      const bytes = objects.get(key)
      if (!bytes) throw new Error('not found')
      return new Blob([new Uint8Array(bytes)])
    }),
    delete: vi.fn(async (_bucket: string, key: string) => {
      objects.delete(key)
      log.push(`delete:${key}`)
    }),
  }
  return { provider, objects, log }
}
