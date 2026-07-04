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

type Company = {
  id: string
  name: string | null
  tier: string
  tier_trial_ends_at: string | null
  stripe_subscription_id: string | null
  tier_renews_at: string | null
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

function CompanyRow({ company }: { company: Company }) {
  const [, startTransition] = useTransition()
  const [selectedTier, setSelectedTier] = useState<TierName>(company.tier as TierName)
  const [expiresAt, setExpiresAt] = useState('')
  const [bonusUnits, setBonusUnits] = useState('')
  const [msg, setMsg] = useState('')
  const { t } = useTranslation()

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
    <TableRow>
      <TableCell className="font-medium">{company.name ?? t('(unnamed)')}</TableCell>
      <TableCell>
        <TierBadge tier={company.tier} />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {company.tier_trial_ends_at
          ? new Date(company.tier_trial_ends_at).toLocaleDateString()
          : '—'}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {company.stripe_subscription_id ? company.stripe_subscription_id.slice(-8) : '—'}
      </TableCell>
      <TableCell>
        {/* Force tier form */}
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
      </TableCell>
      <TableCell>
        {/* Grant bonus credits form */}
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
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{msg}</TableCell>
    </TableRow>
  )
}

export function BillingTable({ companies }: { companies: Company[] }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Company')}</TableHead>
            <TableHead>{t('Tier')}</TableHead>
            <TableHead>{t('Trial ends')}</TableHead>
            <TableHead>{t('Stripe sub')}</TableHead>
            <TableHead>{t('Force tier')}</TableHead>
            <TableHead>{t('Grant credits')}</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                {t('No companies found.')}
              </TableCell>
            </TableRow>
          ) : (
            companies.map((c) => <CompanyRow key={c.id} company={c} />)
          )}
        </TableBody>
      </Table>
    </div>
  )
}
