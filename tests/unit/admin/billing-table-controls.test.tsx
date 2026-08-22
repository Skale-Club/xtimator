import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen, within } from '@testing-library/react'
import {
  BillingTable,
  filterCompanies,
  sortCompanies,
  paginate,
  type BillingFilters,
} from '@/app/admin/billing/billing-table'
import { adjustCredits } from '@/app/admin/billing/actions'

// The admin Billing table used to render up to 200 unpaginated, unsortable,
// unfilterable rows. These guards cover the client-side search/filter/sort/
// pagination pipeline added on top of it — plus the pre-existing expandable
// "Manage" row, which the refactor must not break.

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

vi.mock('@/app/admin/billing/actions', () => ({
  forceTier: vi.fn(),
  grantBonusCredits: vi.fn(),
  adjustCredits: vi.fn().mockResolvedValue({ ok: true, message: 'Balance adjusted by 5', balance: 5 }),
  reconcileCreditBalance: vi.fn().mockResolvedValue({ ok: true, message: 'Balance reconciled to 5', balance: 5 }),
}))

type TestCompany = Parameters<typeof filterCompanies>[0][number]

function company(overrides: Partial<TestCompany> & { id: string }): TestCompany {
  return {
    name: 'Acme Corp',
    tier: 'free',
    tier_trial_ends_at: null,
    stripe_subscription_id: null,
    tier_renews_at: null,
    credit_balance: 0,
    auto_topup_enabled: false,
    realCostUsd: 0,
    ...overrides,
  }
}

const NO_FILTERS: BillingFilters = { search: '', tier: 'all', autoTopup: 'all' }

describe('filterCompanies', () => {
  it('matches company name case-insensitively on a substring', () => {
    const rows = [company({ id: '1', name: 'ACME Corp' }), company({ id: '2', name: 'Globex' })]
    const result = filterCompanies(rows, { ...NO_FILTERS, search: 'acme' })
    expect(result.map((c) => c.id)).toEqual(['1'])
  })

  it('excludes a null-named company from a non-empty search without throwing', () => {
    const rows = [company({ id: '1', name: null }), company({ id: '2', name: 'Acme' })]
    expect(() => filterCompanies(rows, { ...NO_FILTERS, search: 'acme' })).not.toThrow()
    expect(filterCompanies(rows, { ...NO_FILTERS, search: 'acme' }).map((c) => c.id)).toEqual(['2'])
  })

  it('returns all rows for an empty or whitespace-only search', () => {
    const rows = [company({ id: '1', name: null }), company({ id: '2', name: 'Acme' })]
    expect(filterCompanies(rows, { ...NO_FILTERS, search: '' })).toHaveLength(2)
    expect(filterCompanies(rows, { ...NO_FILTERS, search: '   ' })).toHaveLength(2)
  })

  it('filters by tier, and keeps everything on "all"', () => {
    const rows = [
      company({ id: '1', tier: 'free' }),
      company({ id: '2', tier: 'pro' }),
      company({ id: '3', tier: 'business' }),
    ]
    expect(filterCompanies(rows, { ...NO_FILTERS, tier: 'pro' }).map((c) => c.id)).toEqual(['2'])
    expect(filterCompanies(rows, { ...NO_FILTERS, tier: 'all' })).toHaveLength(3)
  })

  it('filters by auto-top-up on/off/all', () => {
    const rows = [
      company({ id: '1', auto_topup_enabled: true }),
      company({ id: '2', auto_topup_enabled: false }),
    ]
    expect(filterCompanies(rows, { ...NO_FILTERS, autoTopup: 'on' }).map((c) => c.id)).toEqual(['1'])
    expect(filterCompanies(rows, { ...NO_FILTERS, autoTopup: 'off' }).map((c) => c.id)).toEqual(['2'])
    expect(filterCompanies(rows, { ...NO_FILTERS, autoTopup: 'all' })).toHaveLength(2)
  })

  it('ANDs search, tier and autoTopup together', () => {
    const rows = [
      company({ id: '1', name: 'Acme One', tier: 'pro', auto_topup_enabled: true }),
      company({ id: '2', name: 'Acme Two', tier: 'pro', auto_topup_enabled: false }),
      company({ id: '3', name: 'Acme Three', tier: 'free', auto_topup_enabled: true }),
      company({ id: '4', name: 'Globex', tier: 'pro', auto_topup_enabled: true }),
    ]
    const result = filterCompanies(rows, { search: 'acme', tier: 'pro', autoTopup: 'on' })
    expect(result.map((c) => c.id)).toEqual(['1'])
  })
})

describe('sortCompanies', () => {
  it('sorts by name asc and desc', () => {
    const rows = [
      company({ id: '1', name: 'Zeta' }),
      company({ id: '2', name: 'Alpha' }),
      company({ id: '3', name: 'Midco' }),
    ]
    expect(sortCompanies(rows, 'name', 'asc').map((c) => c.name)).toEqual(['Alpha', 'Midco', 'Zeta'])
    expect(sortCompanies(rows, 'name', 'desc').map((c) => c.name)).toEqual(['Zeta', 'Midco', 'Alpha'])
  })

  it('treats a null name as an empty string and never throws', () => {
    const rows = [company({ id: '1', name: 'Alpha' }), company({ id: '2', name: null })]
    expect(() => sortCompanies(rows, 'name', 'asc')).not.toThrow()
    expect(sortCompanies(rows, 'name', 'asc').map((c) => c.id)).toEqual(['2', '1'])
  })

  it('sorts credit_balance numerically, not lexicographically', () => {
    const rows = [company({ id: '1', credit_balance: 100 }), company({ id: '2', credit_balance: 9 })]
    // A string sort would put '100' before '9'. Numeric must not.
    expect(sortCompanies(rows, 'credit_balance', 'asc').map((c) => c.credit_balance)).toEqual([9, 100])
  })

  it('sorts realCostUsd numerically, not lexicographically', () => {
    const rows = [company({ id: '1', realCostUsd: 100 }), company({ id: '2', realCostUsd: 9 })]
    expect(sortCompanies(rows, 'realCostUsd', 'asc').map((c) => c.realCostUsd)).toEqual([9, 100])
  })

  it('sorts auto_topup_enabled with false before true when asc', () => {
    const rows = [
      company({ id: '1', auto_topup_enabled: true }),
      company({ id: '2', auto_topup_enabled: false }),
    ]
    expect(sortCompanies(rows, 'auto_topup_enabled', 'asc').map((c) => c.auto_topup_enabled)).toEqual([
      false,
      true,
    ])
  })

  it('sorts tier by rank (free → pro → business), not alphabetically', () => {
    const rows = [
      company({ id: '1', tier: 'business' }),
      company({ id: '2', tier: 'free' }),
      company({ id: '3', tier: 'pro' }),
    ]
    // Alphabetical would give business → free → pro. Rank must give free → pro → business.
    expect(sortCompanies(rows, 'tier', 'asc').map((c) => c.tier)).toEqual(['free', 'pro', 'business'])
    expect(sortCompanies(rows, 'tier', 'desc').map((c) => c.tier)).toEqual(['business', 'pro', 'free'])
  })

  it('does not mutate its input array', () => {
    const rows = [company({ id: '1', name: 'Zeta' }), company({ id: '2', name: 'Alpha' })]
    sortCompanies(rows, 'name', 'asc')
    expect(rows.map((c) => c.name)).toEqual(['Zeta', 'Alpha'])
  })

  it('returns rows in the original server order for a null key', () => {
    const rows = [
      company({ id: '1', name: 'Zeta' }),
      company({ id: '2', name: 'Alpha' }),
      company({ id: '3', name: 'Midco' }),
    ]
    expect(sortCompanies(rows, null, 'asc').map((c) => c.id)).toEqual(['1', '2', '3'])
  })
})

describe('paginate', () => {
  it('returns the correct slice for page 2 of size 2', () => {
    expect(paginate(['a', 'b', 'c', 'd', 'e'], 2, 2)).toEqual(['c', 'd'])
  })

  it('returns an empty array for a page beyond the range', () => {
    expect(paginate(['a', 'b'], 5, 2)).toEqual([])
  })
})

describe('BillingTable', () => {
  const companies = [
    company({ id: '1', name: 'Zeta Industries', tier: 'business', credit_balance: 500 }),
    company({ id: '2', name: 'Alpha Builders', tier: 'free', credit_balance: 10 }),
    company({ id: '3', name: 'Midco Plumbing', tier: 'pro', credit_balance: 90 }),
  ]

  function renderTable() {
    return render(<BillingTable companies={companies} markup={2} creditUnitUsd={0.01} />)
  }

  function dataRowNames(): string[] {
    const rows = screen.getAllByRole('row')
    // row 0 is the header
    return rows
      .slice(1)
      .map((r) => within(r).queryAllByRole('cell')[0]?.textContent ?? '')
      .filter((n) => n.length > 0)
  }

  it('narrows the visible rows as you type into the search box', () => {
    renderTable()
    expect(dataRowNames()).toHaveLength(3)

    fireEvent.change(screen.getByPlaceholderText('Search by company name…'), {
      target: { value: 'alpha' },
    })

    const names = dataRowNames()
    expect(names).toEqual(['Alpha Builders'])
  })

  it('sorts by company name asc on first header click and desc on the second', () => {
    renderTable()
    const companyHeader = screen.getByRole('button', { name: /Company/i })

    fireEvent.click(companyHeader)
    expect(dataRowNames()[0]).toBe('Alpha Builders')

    fireEvent.click(companyHeader)
    expect(dataRowNames()[0]).toBe('Zeta Industries')
  })

  it('still expands the Manage row with Force / Grant controls', () => {
    renderTable()
    expect(screen.queryByRole('button', { name: 'Force' })).toBeNull()

    fireEvent.click(screen.getAllByRole('button', { name: 'Manage' })[0])

    expect(screen.getByRole('button', { name: 'Force' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Grant' })).toBeTruthy()
  })

  it('calls adjustCredits with the typed delta and note, and the Reconcile control', () => {
    renderTable()
    fireEvent.click(screen.getAllByRole('button', { name: 'Manage' })[0])

    expect(screen.getByRole('button', { name: 'Adjust credits' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reconcile' })).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('+/- delta'), { target: { value: '-25' } })
    fireEvent.change(screen.getByPlaceholderText('Note (required)'), {
      target: { value: 'goodwill adjustment' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Adjust credits' }))

    expect(adjustCredits).toHaveBeenCalledWith('1', -25, 'goodwill adjustment')
  })
})
