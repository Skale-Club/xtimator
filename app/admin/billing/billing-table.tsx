'use client'

import { useState, useTransition } from 'react'
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
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Company')}</TableHead>
            <TableHead>{t('Credit balance')}</TableHead>
            <TableHead>{t('Real cost')}</TableHead>
            <TableHead>{t('Auto-top-up')}</TableHead>
            <TableHead>{t('Tier')}</TableHead>
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
          ) : (
            companies.map((c) => (
              <CompanyRow key={c.id} company={c} markup={markup} creditUnitUsd={creditUnitUsd} />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
