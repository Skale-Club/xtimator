'use client'

import { useState, useEffect, type ReactNode, type JSX } from 'react'
import { Eye, DollarSign, Percent } from 'lucide-react'
import {
  Popover,
  PopoverContent,
} from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  resolvePresentationSettings,
  isSectionVisible,
  type PresentationSettings,
  type SectionKey,
} from '@/lib/estimate/presentation-settings'
import { useTranslation } from '@/lib/i18n/use-translation'

// ---------------------------------------------------------------------------
// Phase 162-04 (DOCUX-01) — The gear-triggered Presentation Settings Panel.
// GUARD-03 discipline: every control calls onChange(nextPresentationSettings)
// with a plain PresentationSettings object. The caller (estimate-editor.tsx)
// converts that into a single presentation-settings dispatch. The panel does
// not dispatch reducer actions for the typed tax/discount/deposit columns
// and does not import from the totals engine (grep-verified in the plan's
// acceptance criteria).
// ---------------------------------------------------------------------------

const DESKTOP_BREAKPOINT = '(min-width: 768px)'

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(DESKTOP_BREAKPOINT)
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isDesktop
}

export interface PresentationSettingsPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: PresentationSettings | null
  onChange: (next: PresentationSettings) => void
  /** Non-null current tax_rate on the estimate — used ONLY to capture
   *  preservedRate when the user picks Tax "off"; never mutated by this panel. */
  defaultTaxRate?: number
  /** PRESENT-05: whether the client has already seen/received this estimate. */
  estimateSentOrViewed: boolean
  /** Optional trigger children — otherwise the panel opens/closes only via onOpenChange. */
  children?: ReactNode
}

const SECTION_ORDER: SectionKey[] = [
  'summary',
  'sections',
  'payment_terms',
  'timeline',
  'warranty_terms',
  'notes',
  'photos',
]

export function PresentationSettingsPanel(
  props: PresentationSettingsPanelProps,
): JSX.Element {
  const isDesktop = useIsDesktop()
  const body = <PanelBody {...props} />

  if (isDesktop) {
    return (
      <Popover open={props.open} onOpenChange={props.onOpenChange}>
        {props.children ?? <span />}
        <PopoverContent align="end" side="top" className="w-[360px] p-0">
          {body}
        </PopoverContent>
      </Popover>
    )
  }
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto p-0"
      >
        {/* Radix Sheet is built on Dialog; screen-reader users still need a
             title + description even though we present the panel visually as
             a bottom sheet with no header chrome. */}
        <SheetTitle className="sr-only">Presentation settings</SheetTitle>
        <SheetDescription className="sr-only">
          Pricing, document section visibility, and client presentation
          overrides for this estimate.
        </SheetDescription>
        {body}
      </SheetContent>
    </Sheet>
  )
}

function PanelBody({
  settings,
  onChange,
  defaultTaxRate,
  estimateSentOrViewed,
}: PresentationSettingsPanelProps): JSX.Element {
  const { t } = useTranslation()
  const resolved = resolvePresentationSettings(settings)
  const raw = settings ?? {}

  function patch(next: Partial<PresentationSettings>): void {
    onChange({ ...raw, ...next })
  }

  const sectionLabels: Record<SectionKey, string> = {
    summary: t('Summary'),
    sections: t('Line Sections'),
    payment_terms: t('Payment Terms'),
    timeline: t('Timeline'),
    warranty_terms: t('Warranty'),
    notes: t('Notes'),
    photos: t('Photos'),
  }

  return (
    <div className="space-y-4 p-4">
      {estimateSentOrViewed && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-1.5">
          <Eye className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {t(
              'This estimate has already been seen by the client. Changes here will affect the next view.',
            )}
          </span>
        </div>
      )}

      {/* --- Pricing --- */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t('Pricing')}
        </legend>

        {/* Tax */}
        <div className="space-y-1.5">
          <Label className="text-sm">{t('Tax')}</Label>
          <RadioGroup
            value={resolved.tax.mode}
            onValueChange={(mode) => {
              const nextTax =
                mode === 'off'
                  ? {
                      mode: 'off' as const,
                      preservedRate:
                        resolved.tax.preservedRate ?? defaultTaxRate ?? null,
                    }
                  : {
                      ...resolved.tax,
                      mode: mode as 'default' | 'custom',
                    }
              patch({ tax: nextTax })
            }}
            className="flex gap-3"
          >
            <RadioOption id="tax-default" value="default" label={t('Default')} />
            <RadioOption id="tax-custom" value="custom" label={t('Custom')} />
            <RadioOption id="tax-off" value="off" label={t('Off')} />
          </RadioGroup>
          {resolved.tax.mode === 'custom' && (
            <Input
              type="number"
              step="0.01"
              aria-label={t('Custom tax rate (%)')}
              value={((resolved.tax.customRate ?? 0) * 100).toFixed(2)}
              onChange={(e) =>
                patch({
                  tax: {
                    ...resolved.tax,
                    mode: 'custom',
                    customRate: (parseFloat(e.target.value) || 0) / 100,
                  },
                })
              }
              className="h-8"
            />
          )}
        </div>

        {/* Discount */}
        <div className="space-y-1.5">
          <Label className="text-sm flex items-center gap-1">
            <Percent className="h-3.5 w-3.5" />
            {t('Discount')}
          </Label>
          <RadioGroup
            value={
              !resolved.discount.enabled
                ? 'none'
                : (resolved.discount.type ?? 'percent')
            }
            onValueChange={(mode) => {
              const next =
                mode === 'none'
                  ? { enabled: false }
                  : {
                      enabled: true,
                      type: mode as 'amount' | 'percent',
                      value: resolved.discount.value ?? 0,
                    }
              patch({ discount: next })
            }}
            className="flex gap-3"
          >
            <RadioOption id="disc-none" value="none" label={t('None')} />
            <RadioOption
              id="disc-percent"
              value="percent"
              label={t('Percent')}
            />
            <RadioOption id="disc-amount" value="amount" label={t('Amount')} />
          </RadioGroup>
          {resolved.discount.enabled && (
            <Input
              type="number"
              step="0.01"
              aria-label={t('Discount value')}
              value={resolved.discount.value ?? 0}
              onChange={(e) =>
                patch({
                  discount: {
                    ...resolved.discount,
                    value: parseFloat(e.target.value) || 0,
                  },
                })
              }
              className="h-8"
            />
          )}
        </div>

        {/* Deposit */}
        <div className="space-y-1.5">
          <Label className="text-sm flex items-center gap-1">
            <DollarSign className="h-3.5 w-3.5" />
            {t('Deposit')}
          </Label>
          <RadioGroup
            value={
              !resolved.deposit.enabled
                ? 'none'
                : (resolved.deposit.type ?? 'percent')
            }
            onValueChange={(mode) => {
              const next =
                mode === 'none'
                  ? { enabled: false }
                  : {
                      enabled: true,
                      type: mode as 'amount' | 'percent',
                      value: resolved.deposit.value ?? 0,
                    }
              patch({ deposit: next })
            }}
            className="flex gap-3"
          >
            <RadioOption id="dep-none" value="none" label={t('None')} />
            <RadioOption id="dep-percent" value="percent" label={t('Percent')} />
            <RadioOption id="dep-amount" value="amount" label={t('Amount')} />
          </RadioGroup>
          {resolved.deposit.enabled && (
            <Input
              type="number"
              step="0.01"
              aria-label={t('Deposit value')}
              value={resolved.deposit.value ?? 0}
              onChange={(e) =>
                patch({
                  deposit: {
                    ...resolved.deposit,
                    value: parseFloat(e.target.value) || 0,
                  },
                })
              }
              className="h-8"
            />
          )}
        </div>
      </fieldset>

      {/* --- Document Sections --- */}
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t('Document Sections')}
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SECTION_ORDER.map((key) => (
            <div
              key={key}
              className="flex items-center justify-between gap-2"
            >
              <Label htmlFor={`section-${key}`} className="text-sm">
                {sectionLabels[key]}
              </Label>
              <Switch
                id={`section-${key}`}
                checked={isSectionVisible(resolved, key)}
                onCheckedChange={(checked) =>
                  patch({
                    sections: { ...resolved.sections, [key]: checked },
                  })
                }
              />
            </div>
          ))}
        </div>
      </fieldset>
    </div>
  )
}

function RadioOption({
  id,
  value,
  label,
}: {
  id: string
  value: string
  label: string
}): JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      <RadioGroupItem value={value} id={id} />
      <Label htmlFor={id} className="text-sm cursor-pointer">
        {label}
      </Label>
    </div>
  )
}
