import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * SEED-055 Phase D - paywall UX: banner, capture full-screen block, the shared
 * billing toast, the (capture) layout switch, and a structural guard that the
 * pre-gate cost is never hard-coded again.
 */

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (k: string) => k, language: 'en' }),
}))

const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }))

// The (capture) layout reads the capture entry gate (credit recalibration
// 2026-11-19): paywalled, or below the estimate's entry gate.
const getPaywallContext = vi.fn()
vi.mock('@/lib/billing/access-guard', () => ({
  getCaptureGateContext: (...a: unknown[]) => getPaywallContext(...a),
}))
vi.mock('@/lib/queries/auth', () => ({ getAuthClaims: async () => ({ sub: 'u1' }) }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompany: async () => ({ id: 'co-1' }) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

// The inline buy picker (credits plan 2026-11-20) loads its offer on mount.
const OFFER = {
  eligible: true, balance: 0, expiryMonths: 3, defaultIndex: 1,
  card: { brand: 'Visa', last4: '4242' },
  packs: [
    { index: 0, credits: 900, priceCents: 1000, currency: 'usd', estimates: { min: 6, max: 13 }, bestValue: false },
    { index: 1, credits: 1900, priceCents: 2000, currency: 'usd', estimates: { min: 12, max: 29 }, bestValue: false },
    { index: 2, credits: 5000, priceCents: 5000, currency: 'usd', estimates: { min: 33, max: 76 }, bestValue: true },
  ],
}
globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(OFFER), { status: 200 })) as unknown as typeof fetch

import { PaywallBanner } from '@/components/billing/paywall-banner'
import { CaptureBlocked } from '@/components/billing/capture-blocked'
import { showBillingBlockToast } from '@/lib/billing/block-toast'
import CaptureLayout from '@/app/(capture)/layout'

beforeEach(() => {
  toastError.mockReset()
  getPaywallContext.mockReset()
})

describe('PaywallBanner', () => {
  it('paywalled: persistent alert with the configured price and a Subscribe link to the offer', () => {
    render(<PaywallBanner state="paywalled" priceLabel="$29" />)
    const banner = screen.getByTestId('paywall-banner')
    expect(banner.getAttribute('data-state')).toBe('paywalled')
    expect(banner.textContent).toContain('Your free credits are used up')
    // Full sentence on wide screens, short price line on phones.
    expect(banner.textContent).toContain('Subscribe to Xtimator Pro — $29/mo to keep creating estimates.')
    expect(banner.textContent).toContain('Xtimator Pro — $29/mo')
    const link = screen.getByRole('link', { name: /Subscribe/ })
    expect(link.getAttribute('href')).toBe('/settings/billing#choose-plan')
  })

  it('paywalled: shows the platform logo when one is configured, else its initial', () => {
    const { container, unmount } = render(
      <PaywallBanner state="paywalled" priceLabel="$29" logoUrl="/storage/logo.png" appName="Xtimator" />
    )
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/storage/logo.png')
    unmount()
    const fallback = render(<PaywallBanner state="paywalled" priceLabel="$29" appName="Xtimator" />)
    expect(fallback.container.querySelector('img')).toBeNull()
    expect(fallback.getByTestId('paywall-banner').textContent?.startsWith('X')).toBe(true)
  })

  it('out_of_credits: softer banner whose Buy credits opens the buy dialog in place', () => {
    const opened = vi.fn()
    window.addEventListener('xtm:buy-credits', opened)
    render(<PaywallBanner state="out_of_credits" priceLabel="$29" />)
    expect(screen.getByTestId('paywall-banner').getAttribute('data-state')).toBe('out_of_credits')
    expect(screen.getByText("You're out of credits")).toBeTruthy()
    screen.getByRole('button', { name: 'Buy credits' }).click()
    expect(opened).toHaveBeenCalledTimes(1)
    window.removeEventListener('xtm:buy-credits', opened)
  })

  it.each(['paywalled', 'out_of_credits'] as const)('%s banner cannot be dismissed', (state) => {
    render(<PaywallBanner state={state} priceLabel="$29" />)
    expect(screen.queryByRole('button', { name: /close|dismiss/i })).toBeNull()
  })
})

describe('CaptureBlocked', () => {
  it('paywalled: Subscribe CTA to the Pro offer', () => {
    render(<CaptureBlocked state="paywalled" priceLabel="$29" />)
    expect(screen.getByTestId('capture-blocked').getAttribute('data-state')).toBe('paywalled')
    expect(screen.getByRole('link', { name: 'Subscribe' }).getAttribute('href')).toBe('/settings/billing#choose-plan')
    expect(screen.getByText(/\$29\/mo/)).toBeTruthy()
  })

  it('out_of_credits: the packs right there, no manual fallback anywhere', async () => {
    const { container } = render(<CaptureBlocked state="out_of_credits" priceLabel="$29" />)
    expect(await screen.findByTestId('buy-credits-picker')).toBeTruthy()
    expect(screen.getAllByTestId('buy-credits-pack')).toHaveLength(3)
    expect(container.textContent).not.toMatch(/manual/i)
  })
})

describe('showBillingBlockToast', () => {
  it('shows the state copy; paywalled goes to the Pro offer, out of credits opens the buy dialog', () => {
    const router = { push: vi.fn() }
    expect(showBillingBlockToast('paywalled', router, (k) => k)).toBe(true)
    const [title, opts] = toastError.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }]
    expect(title).toBe('Your free credits are used up')
    expect(opts.action.label).toBe('Subscribe')
    opts.action.onClick()
    expect(router.push).toHaveBeenCalledWith('/settings/billing#choose-plan')

    toastError.mockReset()
    const opened = vi.fn()
    window.addEventListener('xtm:buy-credits', opened)
    expect(showBillingBlockToast('out_of_credits', router, (k) => k)).toBe(true)
    const outOpts = (toastError.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }])[1]
    expect(outOpts.action.label).toBe('Buy credits')
    outOpts.action.onClick()
    expect(opened).toHaveBeenCalledTimes(1)
    window.removeEventListener('xtm:buy-credits', opened)
  })

  it('ignores anything that is not a billing code so callers keep their own error toast', () => {
    const router = { push: vi.fn() }
    expect(showBillingBlockToast(undefined, router, (k) => k)).toBe(false)
    expect(showBillingBlockToast('some_error', router, (k) => k)).toBe(false)
    expect(toastError).not.toHaveBeenCalled()
  })
})

describe('(capture) layout', () => {
  async function renderLayout() {
    const el = await CaptureLayout({ children: <div data-testid="recorder-ui" /> })
    return render(el)
  }

  it('active: renders the capture UI untouched', async () => {
    getPaywallContext.mockResolvedValue({ state: 'active' })
    await renderLayout()
    expect(screen.getByTestId('recorder-ui')).toBeTruthy()
    expect(screen.queryByTestId('capture-blocked')).toBeNull()
  })

  it.each(['paywalled', 'out_of_credits'] as const)('%s: full-screen block instead of the recorder', async (state) => {
    getPaywallContext.mockResolvedValue({ state, priceLabel: '$29' })
    await renderLayout()
    expect(screen.queryByTestId('recorder-ui')).toBeNull()
    expect(screen.getByTestId('capture-blocked').getAttribute('data-state')).toBe(state)
  })

  it('asks for the access state of the active company', async () => {
    getPaywallContext.mockResolvedValue({ state: 'active' })
    await renderLayout()
    expect(getPaywallContext).toHaveBeenCalledWith('co-1')
  })
})

describe('both layouts share the same access-state source', () => {
  it('the (app) layout renders the banner from getPaywallContext', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/(app)/layout.tsx'), 'utf8')
    expect(src).toContain('getPaywallContext(activeCompanyId)')
    expect(src).toContain('<PaywallBanner')
    expect(src).toMatch(/paywall\.state !== 'active'/)
  })
})

describe('a started capture is never re-gated mid-way (credit recalibration 2026-11-19)', () => {
  it.each(['lib/inngest/functions/analyze-photos.ts', 'lib/inngest/functions/transcribe-audio.ts'])(
    '%s chains into generation without a second credit check',
    (file) => {
      const src = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(src).not.toContain('checkCredits(')
      expect(src).not.toContain("errorCode: 'insufficient_credits'")
    }
  )
})

describe('pre-gate cost is configured, never hard-coded', () => {
  const ROOTS = ['app', 'lib']
  const files: string[] = []
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules') continue
      const full = join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(name)) files.push(full)
    }
  }
  for (const r of ROOTS) walk(resolve(process.cwd(), r))

  it('no checkCredits call passes a literal 1', () => {
    const offenders = files.filter((f) => {
      if (f.replace(/\\/g, '/').endsWith('lib/billing/credit-ledger.ts')) return false
      return /checkCredits\([^)]*,\s*1\s*\)/.test(readFileSync(f, 'utf8'))
    })
    expect(offenders).toEqual([])
  })

  it.each([
    'lib/actions/recording.ts',
    'lib/agent-tools/create-estimate.ts',
    'lib/whatsapp/handler.ts',
    'app/api/analyze-photos/route.ts',
    'app/api/estimates/[id]/refine/route.ts',
    'app/api/generate-estimate/route.ts',
    'app/api/transcribe/route.ts',
  ])('%s prices the gate with getEstimatedCredits', (file) => {
    const src = readFileSync(resolve(process.cwd(), file), 'utf8')
    expect(src).toContain('getEstimatedCredits(')
  })

  it.each([
    'app/api/analyze-photos/route.ts',
    'app/api/estimates/[id]/refine/route.ts',
    'app/api/generate-estimate/route.ts',
    'app/api/transcribe/route.ts',
  ])('%s 402 body carries the access state', (file) => {
    const src = readFileSync(resolve(process.cwd(), file), 'utf8')
    expect(src).toMatch(/state:\s*await creditBlockState\(/)
    expect(src).toContain("reason: 'credits'")
    expect(src).toContain("error: 'plan_limit_reached'")
  })
})
