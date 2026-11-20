'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SettingsSaveBar } from '@/components/settings/settings-ui'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { BillingConfig, BillingTier } from '@/lib/billing/billing-config'
import { ESTIMATED_CREDIT_OPS } from '@/lib/billing/estimated-credit-ops'
import { MARKUP_OPS } from '@/lib/billing/markup-ops'
import { saveBillingConfig } from './actions'

type Props = {
  current: BillingConfig
}

const TIERS: BillingTier[] = ['free', 'pro', 'business']

const fieldsetClass =
  'rounded-lg border border-border bg-card/40 p-4 md:p-6 space-y-6'
const legendClass = 'text-sm font-semibold'

// Per-tier editable state. Number fields are held as strings (the raw <input>
// value); the three nullable caps use '' to mean null (unlimited). Booleans and
// the newline-joined featureBullets round-trip as-is until handleSave.
type TierFormState = {
  monthlyCreditGrant: string
  subscriptionPriceCents: string
  subscriptionPriceAnnualCents: string
  includedSeats: string
  maxEstimatesPerMonth: string
  maxEstimatesPerDay: string
  maxPriceResearchPerMonth: string
  maxPhotosPerEstimate: string
  maxAudioMinutesPerEstimate: string
  whatsappEnabled: boolean
  pdfEnabled: boolean
  priceBookEnabled: boolean
  customDomainEnabled: boolean
  featureBullets: string
}

// null-cap ⇒ '' so an empty input round-trips back to null (unlimited).
function capToInput(v: number | null): string {
  return v === null ? '' : String(v)
}

// '' ⇒ null (unlimited); any other value ⇒ Number(). The zod schema is the
// validator of record — this only reconstructs the nullable shape.
function inputToCap(v: string): number | null {
  return v.trim() === '' ? null : Number(v)
}

export function BillingConfigForm({ current }: Props) {
  const { t } = useTranslation()
  const [isPending, startTransition] = useTransition()

  // Top-level money / rate fields
  const [markup, setMarkup] = useState(String(current.markup))
  // Credit recalibration 2026-11-19: per-operation markup. Empty = use the global markup.
  const [markupByOp, setMarkupByOp] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      MARKUP_OPS.map((op) => {
        const v = current.markupByOp?.[op]
        return [op, v != null ? String(v) : '']
      })
    )
  )
  const [creditUnitUsd, setCreditUnitUsd] = useState(String(current.creditUnitUsd))
  const [whisperUsdPerMinute, setWhisperUsdPerMinute] = useState(
    String(current.whisperUsdPerMinute)
  )
  const [estimateFeePct, setEstimateFeePct] = useState(String(current.estimateFeePct))
  const [estimateFeeMinCents, setEstimateFeeMinCents] = useState(
    String(current.estimateFeeMinCents)
  )

  // Global per-seat price (integer cents)
  const [seatPriceCents, setSeatPriceCents] = useState(String(current.seatPriceCents))
  // Global ANNUAL per-seat price (integer cents)
  const [seatPriceAnnualCents, setSeatPriceAnnualCents] = useState(
    String(current.seatPriceAnnualCents)
  )

  // Per-tier grants + prices + included seats + entitlements + feature bullets
  const [tiers, setTiers] = useState(() =>
    TIERS.reduce(
      (acc, tier) => {
        const ent = current.tiers[tier].entitlements
        acc[tier] = {
          monthlyCreditGrant: String(current.tiers[tier].monthlyCreditGrant),
          subscriptionPriceCents: String(current.tiers[tier].subscriptionPriceCents),
          subscriptionPriceAnnualCents: String(current.tiers[tier].subscriptionPriceAnnualCents),
          includedSeats: String(current.tiers[tier].includedSeats),
          maxEstimatesPerMonth: capToInput(ent.maxEstimatesPerMonth),
          maxEstimatesPerDay: capToInput(ent.maxEstimatesPerDay),
          maxPriceResearchPerMonth: capToInput(ent.maxPriceResearchPerMonth),
          maxPhotosPerEstimate: String(ent.maxPhotosPerEstimate),
          maxAudioMinutesPerEstimate: String(ent.maxAudioMinutesPerEstimate),
          whatsappEnabled: ent.whatsappEnabled,
          pdfEnabled: ent.pdfEnabled,
          priceBookEnabled: ent.priceBookEnabled,
          customDomainEnabled: ent.customDomainEnabled,
          featureBullets: current.tiers[tier].featureBullets.join('\n'),
        }
        return acc
      },
      {} as Record<BillingTier, TierFormState>
    )
  )

  // Top-up packs (add/removable rows)
  const [topUpPacks, setTopUpPacks] = useState(() =>
    current.topUpPacks.map((p) => ({
      credits: String(p.credits),
      priceCents: String(p.priceCents),
      priceCentsBrl: p.priceCentsBrl != null ? String(p.priceCentsBrl) : '',
    }))
  )

  // SEED-055 Phase C: months until a top-up lot expires.
  const [topupExpiryMonths, setTopupExpiryMonths] = useState(
    String(current.topupExpiryMonths ?? 3)
  )

  // Credits plan 2026-11-20: estimate cost range shown on packs, and pause length.
  const [estimateRangeLow, setEstimateRangeLow] = useState(String(current.estimateCreditsRange?.low ?? 65))
  const [estimateRangeHigh, setEstimateRangeHigh] = useState(String(current.estimateCreditsRange?.high ?? 150))
  const [creditPauseDays, setCreditPauseDays] = useState(String(current.creditPauseDays ?? 7))

  // SEED-055 Phase D: pre-gate credit estimate per operation.
  const [estimatedCredits, setEstimatedCredits] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      ESTIMATED_CREDIT_OPS.map((op) => [
        op,
        String(current.estimatedCreditsByOp?.[op] ?? 1),
      ])
    )
  )

  // Phase 2b: per-message provider rates, edited as JSON (nested market -> category
  // map; PLACEHOLDER values - verify against Meta's rate card and Twilio pricing).
  const [messagingRatesJson, setMessagingRatesJson] = useState(() =>
    JSON.stringify(current.messagingRates, null, 2)
  )

  // Low-balance thresholds as a comma-joined text input
  const [lowBalanceThresholds, setLowBalanceThresholds] = useState(
    current.lowBalanceThresholds.join(', ')
  )

  // Billing v2: one-time signup credit grant — the free tier's entire allowance.
  const [signupCreditGrant, setSignupCreditGrant] = useState(
    String(current.signupCreditGrant)
  )

  // Master charging switch (CREDIT-05). Billing v2 defaults this ON — the
  // free-tier wall depends on it; unchecking reverts to record-only.
  const [enforcementEnabled, setEnforcementEnabled] = useState(current.enforcementEnabled)

  // Platform-wide auto-top-up kill switch (CREDITUI-07).
  const [autoTopupEnabled, setAutoTopupEnabled] = useState(current.autoTopupEnabled)
  const [brlPricingEnabled, setBrlPricingEnabled] = useState(current.brlPricingEnabled === true)

  // Metering: which operations debit credits vs run absorbed, keyed exactly as
  // stored (no keys invented) + the absorbed-chat anti-abuse rate limit.
  const [meteredOperations, setMeteredOperations] = useState<Record<string, boolean>>(
    () => ({ ...current.meteredOperations })
  )
  const [absorbedChatRateLimitPerMin, setAbsorbedChatRateLimitPerMin] = useState(
    String(current.absorbedChatRateLimitPerMin)
  )

  // One serialisable view of every editable field: Save appears once it
  // differs from what is stored, and Discard rewinds every field to it.
  const snapshot = {
    markup, markupByOp, creditUnitUsd, whisperUsdPerMinute, estimateFeePct, estimateFeeMinCents,
    seatPriceCents, seatPriceAnnualCents, tiers, topUpPacks, topupExpiryMonths, estimatedCredits,
    estimateRangeLow, estimateRangeHigh, creditPauseDays,
    messagingRatesJson, lowBalanceThresholds, signupCreditGrant, enforcementEnabled,
    autoTopupEnabled, brlPricingEnabled, meteredOperations, absorbedChatRateLimitPerMin,
  }
  const snapshotJson = JSON.stringify(snapshot)
  const [savedJson, setSavedJson] = useState(snapshotJson)
  const dirty = snapshotJson !== savedJson

  function handleDiscard() {
    const v = JSON.parse(savedJson) as typeof snapshot
    setMarkup(v.markup)
    setMarkupByOp(v.markupByOp)
    setCreditUnitUsd(v.creditUnitUsd)
    setWhisperUsdPerMinute(v.whisperUsdPerMinute)
    setEstimateFeePct(v.estimateFeePct)
    setEstimateFeeMinCents(v.estimateFeeMinCents)
    setSeatPriceCents(v.seatPriceCents)
    setSeatPriceAnnualCents(v.seatPriceAnnualCents)
    setTiers(v.tiers)
    setTopUpPacks(v.topUpPacks)
    setTopupExpiryMonths(v.topupExpiryMonths)
    setEstimateRangeLow(v.estimateRangeLow)
    setEstimateRangeHigh(v.estimateRangeHigh)
    setCreditPauseDays(v.creditPauseDays)
    setEstimatedCredits(v.estimatedCredits)
    setMessagingRatesJson(v.messagingRatesJson)
    setLowBalanceThresholds(v.lowBalanceThresholds)
    setSignupCreditGrant(v.signupCreditGrant)
    setEnforcementEnabled(v.enforcementEnabled)
    setAutoTopupEnabled(v.autoTopupEnabled)
    setBrlPricingEnabled(v.brlPricingEnabled)
    setMeteredOperations(v.meteredOperations)
    setAbsorbedChatRateLimitPerMin(v.absorbedChatRateLimitPerMin)
  }

  function updateTier<K extends keyof TierFormState>(
    tier: BillingTier,
    field: K,
    value: TierFormState[K]
  ) {
    setTiers((prev) => ({ ...prev, [tier]: { ...prev[tier], [field]: value } }))
  }

  function updatePack(index: number, field: 'credits' | 'priceCents' | 'priceCentsBrl', value: string) {
    setTopUpPacks((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    )
  }

  function addPack() {
    setTopUpPacks((prev) => [...prev, { credits: '', priceCents: '', priceCentsBrl: '' }])
  }

  function removePack(index: number) {
    setTopUpPacks((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSave() {
    // Assemble the FULL BillingConfig payload. The server action's zod safeParse
    // is the validator of record — we only do the string→number conversion here.
    let messagingRates: BillingConfig['messagingRates']
    try {
      messagingRates = JSON.parse(messagingRatesJson) as BillingConfig['messagingRates']
    } catch {
      toast.error(t('Messaging rates must be valid JSON'))
      return
    }
    const payload: BillingConfig = {
      markup: Number(markup),
      markupByOp: Object.fromEntries(
        MARKUP_OPS.filter((op) => markupByOp[op]?.trim()).map((op) => [op, Number(markupByOp[op])])
      ) as BillingConfig['markupByOp'],
      creditUnitUsd: Number(creditUnitUsd),
      whisperUsdPerMinute: Number(whisperUsdPerMinute),
      estimateFeePct: Number(estimateFeePct),
      estimateFeeMinCents: Number(estimateFeeMinCents),
      seatPriceCents: Number(seatPriceCents),
      seatPriceAnnualCents: Number(seatPriceAnnualCents),
      tiers: TIERS.reduce(
        (acc, tier) => {
          const s = tiers[tier]
          acc[tier] = {
            monthlyCreditGrant: Number(s.monthlyCreditGrant),
            subscriptionPriceCents: Number(s.subscriptionPriceCents),
            subscriptionPriceAnnualCents: Number(s.subscriptionPriceAnnualCents),
            // BRL prices are not editable in this form yet - pass the current
            // values through so a save never drops them.
            subscriptionPriceBrlCents: current.tiers[tier].subscriptionPriceBrlCents,
            subscriptionPriceAnnualBrlCents: current.tiers[tier].subscriptionPriceAnnualBrlCents,
            includedSeats: Number(s.includedSeats),
            // Stripe Price IDs are provisioned/refreshed by the save action from
            // the price fields — pass the current IDs through unchanged.
            stripePriceIdMonth: current.tiers[tier].stripePriceIdMonth,
            stripePriceIdYear: current.tiers[tier].stripePriceIdYear,
            entitlements: {
              maxEstimatesPerMonth: inputToCap(s.maxEstimatesPerMonth),
              maxEstimatesPerDay: inputToCap(s.maxEstimatesPerDay),
              maxPriceResearchPerMonth: inputToCap(s.maxPriceResearchPerMonth),
              maxPhotosPerEstimate: Number(s.maxPhotosPerEstimate),
              maxAudioMinutesPerEstimate: Number(s.maxAudioMinutesPerEstimate),
              whatsappEnabled: s.whatsappEnabled,
              pdfEnabled: s.pdfEnabled,
              priceBookEnabled: s.priceBookEnabled,
              customDomainEnabled: s.customDomainEnabled,
            },
            featureBullets: s.featureBullets
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.length > 0),
          }
          return acc
        },
        {} as BillingConfig['tiers']
      ),
      topUpPacks: topUpPacks.map((p) => ({
        credits: Number(p.credits),
        priceCents: Number(p.priceCents),
        ...(p.priceCentsBrl.trim() !== '' ? { priceCentsBrl: Number(p.priceCentsBrl) } : {}),
      })),
      topupExpiryMonths: Number(topupExpiryMonths),
      estimateCreditsRange: { low: Number(estimateRangeLow), high: Number(estimateRangeHigh) },
      creditPauseDays: Number(creditPauseDays),
      estimatedCreditsByOp: Object.fromEntries(
        ESTIMATED_CREDIT_OPS.map((op) => [op, Number(estimatedCredits[op])])
      ) as BillingConfig['estimatedCreditsByOp'],
      lowBalanceThresholds: lowBalanceThresholds
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => Number(s)),
      signupCreditGrant: Number(signupCreditGrant),
      enforcementEnabled,
      meteredOperations,
      absorbedChatRateLimitPerMin: Number(absorbedChatRateLimitPerMin),
      autoTopupEnabled,
      brlPricingEnabled,
      // SEED-054: pass the stored affiliate block through UNCHANGED. This panel
      // has no affiliate fields yet, and saveBillingConfig persists `parsed.data`
      // as the WHOLE metadata row — omitting the block here would silently wipe
      // the program's configuration on every unrelated billing save. Replace this
      // with real inputs when the affiliate admin slice lands.
      affiliate: current.affiliate,
      messagingRates,
    }

    startTransition(async () => {
      const res = await saveBillingConfig(payload)
      if (res.ok) {
        setSavedJson(snapshotJson)
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
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium">{t('Global markup (fallback)')}</span>
            <Input
              type="number"
              step="0.1"
              value={markup}
              onChange={(e) => setMarkup(e.target.value)}
              disabled={isPending}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">{t('Signup credit grant (free tier, one-time)')}</span>
            <Input
              type="number"
              step="1"
              value={signupCreditGrant}
              onChange={(e) => setSignupCreditGrant(e.target.value)}
              disabled={isPending}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">{t('Credit unit (USD per credit)')}</span>
            <Input
              type="number"
              step="0.001"
              value={creditUnitUsd}
              onChange={(e) => setCreditUnitUsd(e.target.value)}
              disabled={isPending}
            />
          </label>
        </div>
      </fieldset>

      {/* Cost rates */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t('Cost rates')}</legend>
        <label className="grid gap-2 max-w-sm">
          <span className="text-sm font-medium">{t('Whisper USD per minute')}</span>
          <Input
            type="number"
            step="0.001"
            value={whisperUsdPerMinute}
            onChange={(e) => setWhisperUsdPerMinute(e.target.value)}
            disabled={isPending}
          />
        </label>
      </fieldset>

      {/* Messaging rates (WhatsApp / SMS / email passed to customer credits) */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t('Messaging rates (USD)')}</legend>
        <Textarea
          value={messagingRatesJson}
          onChange={(e) => setMessagingRatesJson(e.target.value)}
          disabled={isPending}
          rows={16}
          spellCheck={false}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground max-w-3xl">
          {t("Checked 2026-11-10. WhatsApp is billed per delivered message by market and category (re-check against Meta's rate card); SMS per segment by country, including the carrier fee; email per message.")}
        </p>
      </fieldset>

      {/* Estimate fee */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t('Estimate fee')}</legend>
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium">{t('Estimate fee % (0–1)')}</span>
            <Input
              type="number"
              step="0.001"
              value={estimateFeePct}
              onChange={(e) => setEstimateFeePct(e.target.value)}
              disabled={isPending}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">{t('Estimate fee minimum (cents)')}</span>
            <Input
              type="number"
              step="1"
              value={estimateFeeMinCents}
              onChange={(e) => setEstimateFeeMinCents(e.target.value)}
              disabled={isPending}
            />
          </label>
        </div>
      </fieldset>

      {/* Seat billing */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t('Seat billing')}</legend>
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium">{t('Per-seat price (cents)')}</span>
            <Input
              type="number"
              step="1"
              value={seatPriceCents}
              onChange={(e) => setSeatPriceCents(e.target.value)}
              disabled={isPending}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">{t('Per-seat price annual (cents)')}</span>
            <Input
              type="number"
              step="1"
              value={seatPriceAnnualCents}
              onChange={(e) => setSeatPriceAnnualCents(e.target.value)}
              disabled={isPending}
            />
          </label>
        </div>
      </fieldset>

      {/* Per-tier grants, prices, entitlements & feature bullets */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t('Per-tier plans')}</legend>
        <div className="space-y-6">
          {TIERS.map((tier) => (
            <div
              key={tier}
              className="rounded-md border border-border bg-background/40 p-4 space-y-6"
            >
              <span className="text-sm font-semibold capitalize">{tier}</span>

              {/* Grants & prices */}
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <label className="grid gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t('Monthly credit grant')}
                  </span>
                  <Input
                    type="number"
                    step="1"
                    value={tiers[tier].monthlyCreditGrant}
                    onChange={(e) => updateTier(tier, 'monthlyCreditGrant', e.target.value)}
                    disabled={isPending}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t('Subscription price (cents)')}
                  </span>
                  <Input
                    type="number"
                    step="1"
                    value={tiers[tier].subscriptionPriceCents}
                    onChange={(e) =>
                      updateTier(tier, 'subscriptionPriceCents', e.target.value)
                    }
                    disabled={isPending}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t('Subscription price annual (cents)')}
                  </span>
                  <Input
                    type="number"
                    step="1"
                    value={tiers[tier].subscriptionPriceAnnualCents}
                    onChange={(e) =>
                      updateTier(tier, 'subscriptionPriceAnnualCents', e.target.value)
                    }
                    disabled={isPending}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t('Included seats')}
                  </span>
                  <Input
                    type="number"
                    step="1"
                    value={tiers[tier].includedSeats}
                    onChange={(e) => updateTier(tier, 'includedSeats', e.target.value)}
                    disabled={isPending}
                  />
                </label>
              </div>

              {/* Entitlement caps */}
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
                <label className="grid gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t('Max estimates / month')}
                  </span>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={tiers[tier].maxEstimatesPerMonth}
                    onChange={(e) =>
                      updateTier(tier, 'maxEstimatesPerMonth', e.target.value)
                    }
                    disabled={isPending}
                    placeholder={t('unlimited')}
                  />
                  <span className="text-[11px] text-muted-foreground/80">
                    {t('(empty = unlimited)')}
                  </span>
                </label>
                <label className="grid gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t('Max estimates / day')}
                  </span>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={tiers[tier].maxEstimatesPerDay}
                    onChange={(e) => updateTier(tier, 'maxEstimatesPerDay', e.target.value)}
                    disabled={isPending}
                    placeholder={t('unlimited')}
                  />
                  <span className="text-[11px] text-muted-foreground/80">
                    {t('(empty = unlimited)')}
                  </span>
                </label>
                <label className="grid gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t('Max price research / month')}
                  </span>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={tiers[tier].maxPriceResearchPerMonth}
                    onChange={(e) =>
                      updateTier(tier, 'maxPriceResearchPerMonth', e.target.value)
                    }
                    disabled={isPending}
                    placeholder={t('unlimited')}
                  />
                  <span className="text-[11px] text-muted-foreground/80">
                    {t('(empty = unlimited)')}
                  </span>
                </label>
                <label className="grid gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t('Max photos / estimate')}
                  </span>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={tiers[tier].maxPhotosPerEstimate}
                    onChange={(e) =>
                      updateTier(tier, 'maxPhotosPerEstimate', e.target.value)
                    }
                    disabled={isPending}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t('Max audio minutes / estimate')}
                  </span>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={tiers[tier].maxAudioMinutesPerEstimate}
                    onChange={(e) =>
                      updateTier(tier, 'maxAudioMinutesPerEstimate', e.target.value)
                    }
                    disabled={isPending}
                  />
                </label>
              </div>

              {/* Feature flags */}
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={tiers[tier].whatsappEnabled}
                    onChange={(e) => updateTier(tier, 'whatsappEnabled', e.target.checked)}
                    disabled={isPending}
                    className="h-4 w-4 accent-primary"
                  />
                  {t('WhatsApp')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={tiers[tier].pdfEnabled}
                    onChange={(e) => updateTier(tier, 'pdfEnabled', e.target.checked)}
                    disabled={isPending}
                    className="h-4 w-4 accent-primary"
                  />
                  {t('PDF')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={tiers[tier].priceBookEnabled}
                    onChange={(e) => updateTier(tier, 'priceBookEnabled', e.target.checked)}
                    disabled={isPending}
                    className="h-4 w-4 accent-primary"
                  />
                  {t('Price book')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={tiers[tier].customDomainEnabled}
                    onChange={(e) =>
                      updateTier(tier, 'customDomainEnabled', e.target.checked)
                    }
                    disabled={isPending}
                    className="h-4 w-4 accent-primary"
                  />
                  {t('Custom domain')}
                </label>
              </div>

              {/* Feature bullets */}
              <label className="grid gap-2">
                <span className="text-xs text-muted-foreground">
                  {t('Feature bullets (one per line)')}
                </span>
                <Textarea
                  rows={4}
                  value={tiers[tier].featureBullets}
                  onChange={(e) => updateTier(tier, 'featureBullets', e.target.value)}
                  disabled={isPending}
                />
              </label>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground max-w-2xl">
          {t(
            'Saving creates or updates the real Stripe Price charged at checkout for each subscription price. Existing subscribers keep their current price until they switch plans.'
          )}
        </p>
      </fieldset>

      {/* Top-up packs */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t('Top-up packs')}</legend>
        <div className="space-y-6">
          {topUpPacks.map((pack, index) => (
            <div key={index} className="grid gap-6 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
              <label className="grid gap-2">
                <span className="text-xs text-muted-foreground">{t('Credits')}</span>
                <Input
                  type="number"
                  step="1"
                  value={pack.credits}
                  onChange={(e) => updatePack(index, 'credits', e.target.value)}
                  disabled={isPending}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-xs text-muted-foreground">{t('Price (cents)')}</span>
                <Input
                  type="number"
                  step="1"
                  value={pack.priceCents}
                  onChange={(e) => updatePack(index, 'priceCents', e.target.value)}
                  disabled={isPending}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-xs text-muted-foreground">{t('Price in BRL (centavos)')}</span>
                <Input
                  type="number"
                  step="1"
                  value={pack.priceCentsBrl}
                  onChange={(e) => updatePack(index, 'priceCentsBrl', e.target.value)}
                  disabled={isPending}
                />
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removePack(index)}
                disabled={isPending}
                aria-label={t('Remove pack')}
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
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('Add pack')}
          </Button>
          <label className="grid gap-2 max-w-xs">
            <span className="text-xs text-muted-foreground">
              {t('Top-up expiry (months)')}
            </span>
            <Input
              type="number"
              step="1"
              min="1"
              value={topupExpiryMonths}
              onChange={(e) => setTopupExpiryMonths(e.target.value)}
              disabled={isPending}
            />
          </label>
          <div className="grid max-w-md grid-cols-3 gap-3">
            <label className="grid gap-2">
              <span className="text-xs text-muted-foreground">{t('Small estimate (credits)')}</span>
              <Input type="number" step="1" min="1" value={estimateRangeLow} onChange={(e) => setEstimateRangeLow(e.target.value)} disabled={isPending} />
            </label>
            <label className="grid gap-2">
              <span className="text-xs text-muted-foreground">{t('Large estimate (credits)')}</span>
              <Input type="number" step="1" min="1" value={estimateRangeHigh} onChange={(e) => setEstimateRangeHigh(e.target.value)} disabled={isPending} />
            </label>
            <label className="grid gap-2">
              <span className="text-xs text-muted-foreground">{t('Credit pause (days)')}</span>
              <Input type="number" step="1" min="1" max="30" value={creditPauseDays} onChange={(e) => setCreditPauseDays(e.target.value)} disabled={isPending} />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('The estimate range is shown on each pack (e.g. 6 to 13 estimates). The pause is how long an estimate waits for a top-up.')}
          </p>
        </div>
      </fieldset>

      {/* Per-operation markup (credit recalibration 2026-11-19) */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t('Markup per operation')}</legend>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {MARKUP_OPS.map((op) => (
            <label key={op} className="grid gap-2">
              <span className="text-xs text-muted-foreground">{op}</span>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={markupByOp[op]}
                placeholder={markup}
                onChange={(e) => setMarkupByOp((prev) => ({ ...prev, [op]: e.target.value }))}
                disabled={isPending}
                aria-label={`${t('Markup')}: ${op}`}
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {t('Credits debited = measured cost × this markup ÷ credit unit. Leave empty to use the global markup.')}
        </p>
      </fieldset>

      {/* Pre-gate credit estimate per operation (SEED-055 Phase D) */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t('Estimated credits per operation')}</legend>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
          {ESTIMATED_CREDIT_OPS.map((op) => (
            <label key={op} className="grid gap-2">
              <span className="text-xs text-muted-foreground">{op}</span>
              <Input
                type="number"
                step="1"
                min="0"
                value={estimatedCredits[op]}
                onChange={(e) =>
                  setEstimatedCredits((prev) => ({ ...prev, [op]: e.target.value }))
                }
                disabled={isPending}
                aria-label={`${t('Estimated credits')}: ${op}`}
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {t('Used only to decide whether an operation may start. The debit is always the measured cost.')}
        </p>
      </fieldset>

      {/* Low-balance thresholds */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t('Low-balance thresholds')}</legend>
        <label className="grid gap-2 max-w-sm">
          <span className="text-sm font-medium">
            {t('Credit balances to warn at (comma-separated)')}
          </span>
          <Input
            type="text"
            inputMode="numeric"
            value={lowBalanceThresholds}
            onChange={(e) => setLowBalanceThresholds(e.target.value)}
            disabled={isPending}
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
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span className="grid gap-2">
            <span className="text-sm font-medium">{t('Enforce credit charging')}</span>
            <span className="text-xs text-muted-foreground max-w-2xl">
              {t(
                'Master charging switch. When OFF (default), debits are recorded but never block any operation — measure-only safety. Leave OFF until calibration (CALIB-02). Turn ON only when ready to charge real credits.'
              )}
            </span>
          </span>
        </label>
      </fieldset>

      {/* Auto-top-up kill switch */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t('Auto-top-up')}</legend>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={autoTopupEnabled}
            onChange={(e) => setAutoTopupEnabled(e.target.checked)}
            disabled={isPending}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span className="grid gap-2">
            <span className="text-sm font-medium">{t('Enable auto-top-up')}</span>
            <span className="text-xs text-muted-foreground max-w-2xl">
              {t(
                'Platform-wide kill switch. Turning it on enables the tenant-facing auto-top-up feature for every company; each tenant still opts in individually.'
              )}
            </span>
          </span>
        </label>
      </fieldset>

      {/* BRL pricing switch */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t('BRL pricing')}</legend>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={brlPricingEnabled}
            onChange={(e) => setBrlPricingEnabled(e.target.checked)}
            disabled={isPending}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span className="text-sm font-medium">
            {t('BRL pricing for Brazilian companies (plans still charge in USD)')}
          </span>
        </label>
      </fieldset>

      {/* Metering */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t('Metering')}</legend>
        <div className="space-y-6">
          <span className="text-sm font-medium">{t('Metered operations')}</span>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {Object.entries(meteredOperations).map(([op, enabled]) => (
              <label key={op} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) =>
                    setMeteredOperations((prev) => ({ ...prev, [op]: e.target.checked }))
                  }
                  disabled={isPending}
                  className="h-4 w-4 accent-primary"
                />
                {op}
              </label>
            ))}
          </div>
          <label className="grid gap-2 max-w-sm">
            <span className="text-sm font-medium">
              {t('Absorbed chat rate limit (per minute)')}
            </span>
            <Input
              type="number"
              step="1"
              min="0"
              value={absorbedChatRateLimitPerMin}
              onChange={(e) => setAbsorbedChatRateLimitPerMin(e.target.value)}
              disabled={isPending}
            />
          </label>
        </div>
      </fieldset>

      <SettingsSaveBar
        dirty={dirty}
        pending={isPending}
        onDiscard={handleDiscard}
        onSave={handleSave}
        saveLabel={t('Save')}
      />
    </div>
  )
}
