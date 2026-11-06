import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'

/**
 * SEED-055 Phase D - UpgradeModal intercepts 402 `plan_limit_reached` from EVERY
 * AI route and shows state-specific copy (Subscribe vs Buy credits) with no
 * "build it manually" escape hatch.
 */

const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }))

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (k: string) => k, language: 'en' }),
}))

import { UpgradeModal } from '@/components/billing/upgrade-modal'

const originalFetch = window.fetch

function respond402(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 402,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function hit(url: string, body: Record<string, unknown>) {
  window.fetch = vi.fn().mockResolvedValue(respond402(body)) as never
  render(<UpgradeModal />)
  await window.fetch(url)
}

beforeEach(() => {
  toastError.mockReset()
  push.mockReset()
})
afterEach(() => {
  cleanup()
  window.fetch = originalFetch
})

const AI_URLS = [
  '/api/generate-estimate',
  '/api/analyze-photos',
  '/api/transcribe',
  '/api/estimates/6f1c/refine',
  '/api/chat',
  'https://xtimator.com/api/generate-estimate?x=1',
]

describe('UpgradeModal route coverage', () => {
  it.each(AI_URLS)('intercepts 402 from %s', async (url) => {
    await hit(url, { error: 'plan_limit_reached', reason: 'credits', state: 'paywalled' })
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
  })

  it('ignores 402 from non-AI routes', async () => {
    await hit('/api/some-other-route', { error: 'plan_limit_reached', reason: 'credits' })
    await new Promise((r) => setTimeout(r, 20))
    expect(toastError).not.toHaveBeenCalled()
  })

  it('ignores a 402 whose body is not plan_limit_reached', async () => {
    await hit('/api/generate-estimate', { error: 'something_else' })
    await new Promise((r) => setTimeout(r, 20))
    expect(toastError).not.toHaveBeenCalled()
  })
})

describe('UpgradeModal copy', () => {
  it('paywalled -> Subscribe, and never mentions building manually', async () => {
    await hit('/api/generate-estimate', {
      error: 'plan_limit_reached',
      reason: 'credits',
      state: 'paywalled',
      upgradeUrl: '/settings/billing',
    })
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    const [title, opts] = toastError.mock.calls[0] as [string, { description: string; action: { label: string; onClick: () => void } }]
    expect(title).toBe('Your free credits are used up')
    expect(opts.action.label).toBe('Subscribe')
    expect(`${title} ${opts.description}`).not.toMatch(/manual/i)
    opts.action.onClick()
    expect(push).toHaveBeenCalledWith('/settings/billing')
  })

  it('out_of_credits -> Buy credits', async () => {
    await hit('/api/analyze-photos', {
      error: 'plan_limit_reached',
      reason: 'credits',
      state: 'out_of_credits',
    })
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    const [title, opts] = toastError.mock.calls[0] as [string, { description: string; action: { label: string } }]
    expect(title).toBe("You're out of credits")
    expect(opts.action.label).toBe('Buy credits')
    expect(opts.description).not.toMatch(/manual/i)
  })

  it('a credits 402 from an older server (no state) falls back to the paywall copy', async () => {
    await hit('/api/transcribe', { error: 'plan_limit_reached', reason: 'credits' })
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastError.mock.calls[0][0]).toBe('Your free credits are used up')
  })

  it('a non-credit plan cap keeps its own copy, still without a manual fallback', async () => {
    await hit('/api/generate-estimate', { error: 'plan_limit_reached' })
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    const [title, opts] = toastError.mock.calls[0] as [string, { description: string }]
    expect(title).toBe('Plan limit reached')
    expect(opts.description).not.toMatch(/manual/i)
  })
})
