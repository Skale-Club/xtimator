'use client'

import { useState, useTransition } from 'react'
import { Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { BillingConfig, BillingTier } from '@/lib/billing/billing-config'
import { saveBillingConfig } from './actions'

type Props = {
  current: BillingConfig
}

const TIERS: BillingTier[] = ['free', 'trial', 'pro', 'business']

const inputClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm'
const fieldsetClass =
  'rounded-lg border border-border bg-card/40 p-4 md:p-6 space-y-4'
const legendClass = 'text-sm font-semibold'

export function BillingConfigForm({ current }: Props) {
  const { t } = useTranslation()
  const [isPending, startTransition] = useTransition()

  // Top-level money / rate fields
  const [markup, setMarkup] = useState(String(current.markup))
  const [creditUnitUsd, setCreditUnitUsd] = useState(String(current.creditUnitUsd))
  const [whisperUsdPerMinute, setWhisperUsdPerMinute] = useState(
    String(current.whisperUsdPerMinute)
  )
  const [estimateFeePct, setEstimateFeePct] = useState(String(current.estimateFeePct))
  const [estimateFeeMinCents, setEstimateFeeMinCents] = useState(
    String(current.estimateFeeMinCents)
  )

  // Per-tier grants + prices
  const [tiers, setTiers] = useState(() =>
    TIERS.reduce(
      (acc, tier) => {
        acc[tier] = {
          monthlyCreditGrant: String(current.tiers[tier].monthlyCreditGrant),
          subscriptionPriceCents: String(current.tiers[tier].subscriptionPriceCents),
        }
        return acc
      },
      {} as Record<BillingTier, { monthlyCreditGrant: string; subscriptionPriceCents: string }>
    )
  )

  // Top-up packs (add/removable rows)
  const [topUpPacks, setTopUpPacks] = useState(() =>
    current.topUpPacks.map((p) => ({
      credits: String(p.credits),
      priceCents: String(p.priceCents),
    }))
  )

  // Low-balance thresholds as a comma-joined text input
  const [lowBalanceThresholds, setLowBalanceThresholds] = useState(
    current.lowBalanceThresholds.join(', ')
  )

  // Master charging switch (CREDIT-05). Default false = measure-only safety:
  // debits RECORD but checkCredits never blocks until calibration flips it on.
  const [enforcementEnabled, setEnforcementEnabled] = useState(current.enforcementEnabled)

  function updateTier(
    tier: BillingTier,
    field: 'monthlyCreditGrant' | 'subscriptionPriceCents',
    value: string
  ) {
    setTiers((prev) => ({ ...prev, [tier]: { ...prev[tier], [field]: value } }))
  }

  function updatePack(index: number, field: 'credits' | 'priceCents', value: string) {
    setTopUpPacks((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    )
  }

  function addPack() {
    setTopUpPacks((prev) => [...prev, { credits: '', priceCents: '' }])
  }

  function removePack(index: number) {
    setTopUpPacks((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSave() {
    // Assemble the FULL BillingConfig payload. The server action's zod safeParse
    // is the validator of record — we only do the string→number conversion here.
    const payload: BillingConfig = {
      markup: Number(markup),
      creditUnitUsd: Number(creditUnitUsd),
      whisperUsdPerMinute: Number(whisperUsdPerMinute),
      estimateFeePct: Number(estimateFeePct),
      estimateFeeMinCents: Number(estimateFeeMinCents),
      tiers: TIERS.reduce(
        (acc, tier) => {
          acc[tier] = {
            monthlyCreditGrant: Number(tiers[tier].monthlyCreditGrant),
            subscriptionPriceCents: Number(tiers[tier].subscriptionPriceCents),
          }
          return acc
        },
        {} as BillingConfig['tiers']
      ),
      topUpPacks: topUpPacks.map((p) => ({
        credits: Number(p.credits),
        priceCents: Number(p.priceCents),
      })),
      lowBalanceThresholds: lowBalanceThresholds
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => Number(s)),
      enforcementEnabled,
      // Carried through unchanged this phase so the saved row keeps the final shape.
      meteredOperations: current.meteredOperations,
      absorbedChatRateLimitPerMin: current.absorbedChatRateLimitPerMin,
    }

    startTransition(async () => {
      const res = await saveBillingConfig(payload)
      if (res.ok) {
        toast.success(res.message ?? t('Saved'))
      } else {
        toast.error(res.message)
      }
    })
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground max-w-3xl">
        {t('Defaults are illustrative — calibrate before charging (CALIB-02).')}
      </p>

      {/* Markup & Credits */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t('Markup & Credits')}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t('Markup (multiplier)')}</span>
            <input
              type="number"
              step="0.1"
              value={markup}
              onChange={(e) => setMarkup(e.target.value)}
              disabled={isPending}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t('Credit unit (USD per credit)')}</span>
            <input
              type="number"
              step="0.001"
              value={creditUnitUsd}
              onChange={(e) => setCreditUnitUsd(e.target.value)}
              disabled={isPending}
              className={inputClass}
            />
          </label>
        </div>
      </fieldset>

      {/* Cost rates */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t('Cost rates')}</legend>
        <label className="flex flex-col gap-1 max-w-sm">
          <span className="text-sm font-medium">{t('Whisper USD per minute')}</span>
          <input
            type="number"
            step="0.001"
            value={whisperUsdPerMinute}
            onChange={(e) => setWhisperUsdPerMinute(e.target.value)}
            disabled={isPending}
            className={inputClass}
          />
        </label>
      </fieldset>

      {/* Estimate fee */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t('Estimate fee')}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t('Estimate fee % (0–1)')}</span>
            <input
              type="number"
              step="0.001"
              value={estimateFeePct}
              onChange={(e) => setEstimateFeePct(e.target.value)}
              disabled={isPending}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t('Estimate fee minimum (cents)')}</span>
            <input
              type="number"
              step="1"
              value={estimateFeeMinCents}
              onChange={(e) => setEstimateFeeMinCents(e.target.value)}
              disabled={isPending}
              className={inputClass}
            />
          </label>
        </div>
      </fieldset>

      {/* Per-tier grants & prices */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t('Per-tier grants & prices')}</legend>
        <div className="space-y-4">
          {TIERS.map((tier) => (
            <div key={tier} className="grid gap-4 sm:grid-cols-3 sm:items-end">
              <span className="text-sm font-medium capitalize">{tier}</span>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                  {t('Monthly credit grant')}
                </span>
                <input
                  type="number"
                  step="1"
                  value={tiers[tier].monthlyCreditGrant}
                  onChange={(e) => updateTier(tier, 'monthlyCreditGrant', e.target.value)}
                  disabled={isPending}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                  {t('Subscription price (cents)')}
                </span>
                <input
                  type="number"
                  step="1"
                  value={tiers[tier].subscriptionPriceCents}
                  onChange={(e) =>
                    updateTier(tier, 'subscriptionPriceCents', e.target.value)
                  }
                  disabled={isPending}
                  className={inputClass}
                />
              </label>
            </div>
          ))}
        </div>
      </fieldset>

      {/* Top-up packs */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t('Top-up packs')}</legend>
        <div className="space-y-3">
          {topUpPacks.map((pack, index) => (
            <div key={index} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{t('Credits')}</span>
                <input
                  type="number"
                  step="1"
                  value={pack.credits}
                  onChange={(e) => updatePack(index, 'credits', e.target.value)}
                  disabled={isPending}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{t('Price (cents)')}</span>
                <input
                  type="number"
                  step="1"
                  value={pack.priceCents}
                  onChange={(e) => updatePack(index, 'priceCents', e.target.value)}
                  disabled={isPending}
                  className={inputClass}
                />
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removePack(index)}
                disabled={isPending}
                aria-label={t('Remove pack')}
                className="min-h-[44px]"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={addPack}
            disabled={isPending}
            className="min-h-[44px]"
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('Add pack')}
          </Button>
        </div>
      </fieldset>

      {/* Low-balance thresholds */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t('Low-balance thresholds')}</legend>
        <label className="flex flex-col gap-1 max-w-sm">
          <span className="text-sm font-medium">
            {t('Credit balances to warn at (comma-separated)')}
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={lowBalanceThresholds}
            onChange={(e) => setLowBalanceThresholds(e.target.value)}
            disabled={isPending}
            className={inputClass}
            placeholder="200, 50"
          />
        </label>
      </fieldset>

      {/* Enforcement (master charging switch) */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t('Enforcement')}</legend>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={enforcementEnabled}
            onChange={(e) => setEnforcementEnabled(e.target.checked)}
            disabled={isPending}
            className="mt-1 h-4 w-4"
          />
          <span className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t('Enforce credit charging')}</span>
            <span className="text-xs text-muted-foreground max-w-2xl">
              {t(
                'Master charging switch. When OFF (default), debits are recorded but never block any operation — measure-only safety. Leave OFF until calibration (CALIB-02). Turn ON only when ready to charge real credits.'
              )}
            </span>
          </span>
        </label>
      </fieldset>

      {/* Carried-through (no UI this phase) */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t('Advanced (carried through)')}</legend>
        <p className="text-sm text-muted-foreground">
          {t(
            'meteredOperations and absorbedChatRateLimitPerMin are saved at their current values and not editable in this phase.'
          )}{' '}
          <span className="text-muted-foreground/80">
            absorbedChatRateLimitPerMin = {current.absorbedChatRateLimitPerMin}
          </span>
        </p>
      </fieldset>

      <Button onClick={handleSave} disabled={isPending} className="min-h-[44px]">
        {isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        {t('Save')}
      </Button>
    </div>
  )
}
