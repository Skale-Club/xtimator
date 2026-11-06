import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * SEED-055 Phase B — hourly credit-lot expiry cron.
 *
 * expireCreditLots (the RPC wrapper) is mocked; this file locks the runner
 * contract and the Inngest wiring (id, hourly cron, retries, step name,
 * serve() registration).
 */
const { mockExpireCreditLots } = vi.hoisted(() => ({
  mockExpireCreditLots: vi.fn(),
}))

vi.mock('@/lib/billing/credit-ledger', () => ({
  expireCreditLots: mockExpireCreditLots,
}))

import {
  runExpireCreditLots,
  expireCreditLotsJob,
} from '@/lib/inngest/functions/expire-credit-lots'

describe('runExpireCreditLots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns how many lots the RPC expired', async () => {
    mockExpireCreditLots.mockResolvedValue(4)
    await expect(runExpireCreditLots()).resolves.toEqual({ expired: 4 })
    expect(mockExpireCreditLots).toHaveBeenCalledTimes(1)
  })

  it('a run with nothing to expire reports 0 (the normal case in Phase B)', async () => {
    mockExpireCreditLots.mockResolvedValue(0)
    await expect(runExpireCreditLots()).resolves.toEqual({ expired: 0 })
  })
})

describe('expireCreditLotsJob (Inngest function config)', () => {
  type FnInternals = {
    opts: {
      id: string
      retries?: number
      triggers?: Array<{ cron?: string; event?: string }>
    }
  }

  it('is created with id "expire-credit-lots" and an hourly cron', () => {
    const fn = expireCreditLotsJob as unknown as FnInternals
    expect(fn.opts.id).toBe('expire-credit-lots')
    expect(fn.opts.triggers).toContainEqual({ cron: '0 * * * *' })
  })

  it('is configured with retries: 3', () => {
    const fn = expireCreditLotsJob as unknown as FnInternals
    expect(fn.opts.retries).toBe(3)
  })

  it('wraps the sweep in step.run("expire-credit-lots", ...)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/expire-credit-lots.ts'),
      'utf8',
    )
    expect(src).toMatch(/step\.run\(['"]expire-credit-lots['"]/)
  })

  it('is exported from the barrel and registered in the serve() array', () => {
    const barrel = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/index.ts'),
      'utf8',
    )
    const route = readFileSync(
      resolve(process.cwd(), 'app/api/inngest/route.ts'),
      'utf8',
    )
    expect(barrel).toMatch(/expireCreditLotsJob[\s\S]*expire-credit-lots/)
    expect(route.match(/expireCreditLotsJob/g)?.length).toBe(2) // import + functions array
  })
})
