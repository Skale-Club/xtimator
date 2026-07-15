'use client'

import { useMemo, useState, useTransition } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown, Search } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { forceTier, grantBonusCredits } from './actions'
import type { TierName } from '@/lib/entitlements'
import { useTranslation } from '@/lib/i18n/use-translation'
import { T } from '@/components/i18n/t'

type Company = {
  id: string
  name: string | null
  tier: string
  tier_trial_ends_at: string | null
  stripe_subscription_id: string | null
  tier_renews_at: string | null
  credit_balance: number
  auto_topup_enabled: boolean
  realCostUsd: number
}

const TIER_OPTIONS: TierName[] = ['free', 'pro', 'business']

function TierBadge({ tier }: { tier: string }) {
  const { t } = useTranslation()
  const colors: Record<string, string> = {
    free: 'bg-muted text-muted-foreground',
    pro: 'bg-emerald-500/15 text-emerald-400',
    business: 'bg-purple-500/15 text-purple-400',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[tier] ?? colors.free}`}
    >
      {t(tier)}
    </span>
  )
}

function CompanyRow({
  company,
  markup,
  creditUnitUsd,
}: {
  company: Company
  markup: number
  creditUnitUsd: number
}) {
  const [, startTransition] = useTransition()
  const [selectedTier, setSelectedTier] = useState<TierName>(company.tier as TierName)
  const [expiresAt, setExpiresAt] = useState('')
  const [bonusUnits, setBonusUnits] = useState('')
  const [msg, setMsg] = useState('')
  const [manageOpen, setManageOpen] = useState(false)
  const { t } = useTranslation()

  const creditsEquivalent =
    creditUnitUsd > 0 ? Math.round((company.realCostUsd * markup) / creditUnitUsd) : 0

  const handleForceTier = () => {
    startTransition(async () => {
      const result = await forceTier(company.id, selectedTier, expiresAt || undefined)
      setMsg(result.ok ? (result.message ?? t('Saved')) : result.message)
    })
  }

  const handleGrantCredits = () => {
    const n = parseInt(bonusUnits, 10)
    if (!n || n <= 0) {
      setMsg(t('Enter a positive number'))
      return
    }
    startTransition(async () => {
      const result = await grantBonusCredits(company.id, n)
      setMsg(result.ok ? (result.message ?? t('Granted')) : result.message)
      if (result.ok) setBonusUnits('')
    })
  }

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">{company.name ?? t('(unnamed)')}</TableCell>
        <TableCell className="font-mono text-sm">{company.credit_balance.toLocaleString()}</TableCell>
        <TableCell className="font-mono text-sm">
          ${company.realCostUsd.toFixed(4)}
          <span className="block text-xs text-muted-foreground">
            {creditsEquivalent.toLocaleString()} <T>credits</T>
          </span>
        </TableCell>
        <TableCell>
          {company.auto_topup_enabled ? (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-500/15 text-emerald-400">
              {t('On')}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
              {t('Off')}
            </span>
          )}
        </TableCell>
        <TableCell>
          <TierBadge tier={company.tier} />
        </TableCell>
        <TableCell>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setManageOpen((v) => !v)}>
            {manageOpen ? t('Hide') : t('Manage')}
          </Button>
        </TableCell>
      </TableRow>
      {manageOpen && (
        <TableRow className="bg-muted/20">
          <TableCell colSpan={6} className="py-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-6 text-xs text-muted-foreground">
                <span>
                  <T>Trial ends:</T>{' '}
                  {company.tier_trial_ends_at
                    ? new Date(company.tier_trial_ends_at).toLocaleDateString()
                    : '—'}
                </span>
                <span>
                  <T>Stripe sub:</T>{' '}
                  {company.stripe_subscription_id ? company.stripe_subscription_id.slice(-8) : '—'}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={selectedTier} onValueChange={(v) => setSelectedTier(v as TierName)}>
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIER_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {t(opt)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-36 h-8 text-xs"
                  placeholder={t('Expiry (opt.)')}
                />
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleForceTier}>
                  {t('Force')}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={bonusUnits}
                  onChange={(e) => setBonusUnits(e.target.value)}
                  className="w-20 h-8 text-xs"
                  placeholder={t('Credits')}
                />
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleGrantCredits}>
                  {t('Grant')}
                </Button>
              </div>
              {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

export type SortKey = 'name' | 'credit_balance' | 'realCostUsd' | 'auto_topup_enabled' | 'tier'
export type SortDir = 'asc' | 'desc'
export type BillingFilters = { search: string; tier: string; autoTopup: string }

export function filterCompanies(companies: Company[], filters: BillingFilters): Company[] {
  const term = filters.search.trim().toLowerCase()
  return companies.filter((c) => {
    if (term && !(c.name ?? '').toLowerCase().includes(term)) return false
    if (filters.tier !== 'all' && c.tier !== filters.tier) return false
    if (filters.autoTopup !== 'all' && c.auto_topup_enabled !== (filters.autoTopup === 'on')) {
      return false
    }
    return true
  })
}

export function sortCompanies(
  companies: Company[],
  key: SortKey | null,
  dir: SortDir,
): Company[] {
  // Never mutate the prop — the server order is the default view.
  const rows = [...companies]
  if (key === null) return rows

  return rows.sort((a, b) => {
    let cmp = 0
    switch (key) {
      case 'name':
        cmp = (a.name ?? '').localeCompare(b.name ?? '')
        break
      case 'credit_balance':
        cmp = a.credit_balance - b.credit_balance
        break
      case 'realCostUsd':
        cmp = a.realCostUsd - b.realCostUsd
        break
      case 'auto_topup_enabled':
        cmp = Number(a.auto_topup_enabled) - Number(b.auto_topup_enabled)
        break
      case 'tier':
        // Rank, not alphabetical: free → pro → business. Alphabetical would
        // give business → free → pro, which is meaningless for tiers.
        cmp =
          TIER_OPTIONS.indexOf(a.tier as TierName) - TIER_OPTIONS.indexOf(b.tier as TierName)
        break
    }
    return dir === 'desc' ? -cmp : cmp
  })
}

export function paginate<T>(rows: T[], page: number, pageSize: number): T[] {
  return rows.slice((page - 1) * pageSize, page * pageSize)
}

const PAGE_SIZE_OPTIONS = [10, 25, 50]

function SortableHead({
  label,
  sortKey: k,
  active,
  dir,
  onSort,
}: {
  label: string
  sortKey: SortKey
  active: boolean
  dir: SortDir
  onSort: (key: SortKey) => void
}) {
  return (
    <TableHead aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className="group inline-flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {label}
        {active ? (
          dir === 'asc' ? (
            <ChevronUp size={12} />
          ) : (
            <ChevronDown size={12} />
          )
        ) : (
          <ChevronsUpDown size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </button>
    </TableHead>
  )
}

export function BillingTable({
  companies,
  markup,
  creditUnitUsd,
}: {
  companies: Company[]
  markup: number
  creditUnitUsd: number
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('all')
  const [autoTopupFilter, setAutoTopupFilter] = useState('all')
  // null = keep the server's created_at desc order until the admin sorts.
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const filtered = useMemo(
    () => filterCompanies(companies, { search, tier: tierFilter, autoTopup: autoTopupFilter }),
    [companies, search, tierFilter, autoTopupFilter],
  )
  const sorted = useMemo(() => sortCompanies(filtered, sortKey, sortDir), [filtered, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  // Clamp in render, not in an effect — a filter that shrinks the result set
  // while on a late page would otherwise trigger a setState-during-render loop.
  const safePage = Math.min(page, totalPages)
  const paged = paginate(sorted, safePage, pageSize)

  const filtersActive = search !== '' || tierFilter !== 'all' || autoTopupFilter !== 'all'

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  const handleClear = () => {
    setSearch('')
    setTierFilter('all')
    setAutoTopupFilter('all')
    setPage(1)
  }

  const rangeStart = sorted.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const rangeEnd = Math.min(safePage * pageSize, sorted.length)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder={t('Search by company name…')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>

        <Select
          value={tierFilter}
          onValueChange={(v) => {
            setTierFilter(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="h-8 text-sm w-[120px]">
            <SelectValue placeholder={t('Tier')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('All tiers')}</SelectItem>
            {TIER_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {t(opt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={autoTopupFilter}
          onValueChange={(v) => {
            setAutoTopupFilter(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="h-8 text-sm w-[140px]">
            <SelectValue placeholder={t('Auto-top-up')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('Any top-up')}</SelectItem>
            <SelectItem value="on">{t('On')}</SelectItem>
            <SelectItem value="off">{t('Off')}</SelectItem>
          </SelectContent>
        </Select>

        {filtersActive && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleClear}>
            {t('Clear')}
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead
                label={t('Company')}
                sortKey="name"
                active={sortKey === 'name'}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableHead
                label={t('Credit balance')}
                sortKey="credit_balance"
                active={sortKey === 'credit_balance'}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableHead
                label={t('Real cost')}
                sortKey="realCostUsd"
                active={sortKey === 'realCostUsd'}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableHead
                label={t('Auto-top-up')}
                sortKey="auto_topup_enabled"
                active={sortKey === 'auto_topup_enabled'}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableHead
                label={t('Tier')}
                sortKey="tier"
                active={sortKey === 'tier'}
                dir={sortDir}
                onSort={handleSort}
              />
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {t('No companies found.')}
                </TableCell>
              </TableRow>
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  <div className="flex flex-col items-center gap-2">
                    <span>{t('No companies match your filters.')}</span>
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleClear}>
                      {t('Clear')}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paged.map((c) => (
                <CompanyRow key={c.id} company={c} markup={markup} creditUnitUsd={creditUnitUsd} />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {sorted.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 mt-4 text-sm">
          <span className="text-muted-foreground">
            {`${t('Showing')} ${rangeStart}–${rangeEnd} ${t('of')} ${sorted.length}`}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v))
                setPage(1)
              }}
            >
              <SelectTrigger className="h-8 text-sm w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >
              {t('Previous')}
            </Button>
            <span className="text-muted-foreground">
              {`${t('Page')} ${safePage} ${t('of')} ${totalPages}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
            >
              {t('Next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
