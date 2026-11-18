'use client'

import { useState, useEffect, type ReactNode, type JSX, type RefObject } from 'react'
import { Eye, ChevronRight } from 'lucide-react'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BottomSheetCloseButton, BottomSheetContent } from '@/components/ui/bottom-sheet'
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import { RadioGroup } from '@/components/ui/radio-group'
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
import Link from 'next/link'

// ---------------------------------------------------------------------------
// Phase 162-04 (DOCUX-01) — The gear-triggered Presentation Settings Panel
// ("Estimate options"). GUARD-03 discipline: every control calls
// onChange(nextPresentationSettings) with a plain PresentationSettings object.
// The caller (estimate-editor.tsx) converts that into a single
// presentation-settings dispatch. The panel does not dispatch reducer actions
// for the typed tax/discount/deposit columns and does not import from the
// totals engine.
//
// Layout: a popover over the dock's gear from 768px up; below that the app's
// bottom sheet (components/ui/bottom-sheet.tsx), which drags to close. The
// body is the same in both: grouped cards (Client, Pricing, Document blocks).
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
  /** Link-Client affordance (a ClientPicker), moved here out of the floating
   *  action pill — the pill was wide enough to push the preview sideways, and
   *  the gear is where the estimate's other per-document settings already live.
   *  Null/undefined when a client is already linked (the document's own Bill To
   *  pencil handles changing it), in which case no Client section renders. */
  clientSlot?: ReactNode
  /** Optional trigger children — otherwise the panel opens/closes only via onOpenChange. */
  children?: ReactNode
  /**
   * The element the desktop popover opens from (the floating bar's gear).
   * Without an anchor Radix parks the popover off-screen (translate -200%),
   * which is why the gear looked dead on desktop. A click on the anchor is not
   * an "outside" click, so the gear can toggle the panel closed.
   */
  anchorRef?: RefObject<HTMLElement | null>
  /** Offer the Estimate Terms (fine print) switch; only when the company has fine-print text. */
  hasCompanyTerms?: boolean
  /** Offer the Valid-until switch; only when the estimate carries a valid_until date. */
  hasValidUntil?: boolean
}

const SECTION_ORDER: SectionKey[] = [
  'summary',
  'sections',
  'payment_terms',
  'timeline',
  'warranty_terms',
  'notes',
  'photos',
  'estimate_terms',
  'valid_until',
]

export function PresentationSettingsPanel(
  props: PresentationSettingsPanelProps,
): JSX.Element {
  const isDesktop = useIsDesktop()
  const { t } = useTranslation()
  const body = <PanelBody {...props} />

  if (isDesktop) {
    return (
      <Popover open={props.open} onOpenChange={props.onOpenChange}>
        {props.anchorRef
          ? <PopoverAnchor virtualRef={props.anchorRef as RefObject<HTMLElement>} />
          : props.children ?? <span />}
        <PopoverContent
          align="center"
          side="top"
          sideOffset={12}
          collisionPadding={16}
          // Taller than most screens with every block listed: it scrolls inside.
          className="flex max-h-[min(680px,var(--radix-popover-content-available-height))] w-[380px] flex-col overflow-hidden p-0"
          onInteractOutside={(event) => {
            if (props.anchorRef?.current?.contains(event.target as Node)) event.preventDefault()
          }}
        >
          <p className="shrink-0 px-5 pt-4 pb-1 text-[17px] font-semibold tracking-tight">
            {t('Estimate options')}
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
        </PopoverContent>
      </Popover>
    )
  }

  // Phones and small tablets: the app's bottom sheet (drag the handle or the
  // header down to close).
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <BottomSheetContent data-testid="presentation-settings-sheet" desktopClassName="sm:max-w-[440px]">
        <DialogHeader
          data-sheet-drag=""
          className="flex shrink-0 touch-none flex-row items-center justify-between gap-3 pl-5 pr-3 pt-1 pb-1 text-left sm:pt-4"
        >
          <DialogTitle className="text-[19px] leading-tight font-semibold tracking-tight">
            {t('Estimate options')}
          </DialogTitle>
          <BottomSheetCloseButton label={t('Close')} />
          <DialogDescription className="sr-only">
            {t('Pricing and the blocks shown on this estimate.')}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{body}</div>
      </BottomSheetContent>
    </Dialog>
  )
}

/** A titled group: a small-caps legend over one rounded card with divided rows. */
function Group({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </legend>
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-muted/40">
        {children}
      </div>
    </fieldset>
  )
}

function PanelBody({
  settings,
  onChange,
  defaultTaxRate,
  estimateSentOrViewed,
  clientSlot,
  hasCompanyTerms,
  hasValidUntil,
}: PresentationSettingsPanelProps): JSX.Element {
  const { t } = useTranslation()
  const resolved = resolvePresentationSettings(settings)
  const raw = settings ?? {}
  // What the user is typing in the custom tax field. Rendering the stored rate
  // with toFixed(2) on every keystroke rewrote "7." to "7.00" mid-typing; the
  // formatted value only shows when the field is not being edited.
  const [taxDraft, setTaxDraft] = useState<string | null>(null)

  function patch(next: Partial<PresentationSettings>): void {
    onChange({ ...raw, ...next })
  }

  // Fine print and Valid-until only exist for companies / estimates that have them.
  const blockKeys = SECTION_ORDER.filter(
    (key) =>
      (key !== 'estimate_terms' || hasCompanyTerms) && (key !== 'valid_until' || hasValidUntil),
  )

  const sectionLabels: Record<SectionKey, string> = {
    summary: t('Summary'),
    sections: t('Line Sections'),
    payment_terms: t('Payment Terms'),
    timeline: t('Timeline'),
    warranty_terms: t('Warranty'),
    notes: t('Notes'),
    photos: t('Photos'),
    estimate_terms: t('Estimate Terms'),
    valid_until: t('Valid Until'),
  }

  return (
    <div className="flex flex-col gap-5 px-4 pt-2 pb-5">
      {estimateSentOrViewed && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <Eye className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {t(
              'This estimate has already been seen by the client. Changes here will affect the next view.',
            )}
          </span>
        </div>
      )}

      {/* --- Client (only while none is linked) --- */}
      {clientSlot && (
        <Group label={t('Client')}>
          <div className="p-1">{clientSlot}</div>
        </Group>
      )}

      {/* --- Pricing --- */}
      <Group label={t('Pricing')}>
        <div className="space-y-2 px-3.5 py-3">
          <Label className="text-sm font-medium">{t('Tax')}</Label>
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
            className={SEGMENTED_GROUP}
          >
            <RadioOption id="tax-default" value="default" label={t('Default')} />
            <RadioOption id="tax-custom" value="custom" label={t('Custom')} />
            <RadioOption id="tax-off" value="off" label={t('Off')} />
          </RadioGroup>
          {resolved.tax.mode === 'custom' && (
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              aria-label={t('Custom tax rate (%)')}
              value={taxDraft ?? ((resolved.tax.customRate ?? 0) * 100).toFixed(2)}
              onFocus={(e) => setTaxDraft(e.currentTarget.value)}
              onBlur={() => setTaxDraft(null)}
              onChange={(e) => {
                setTaxDraft(e.target.value)
                patch({
                  tax: {
                    ...resolved.tax,
                    mode: 'custom',
                    customRate: (parseFloat(e.target.value) || 0) / 100,
                  },
                })
              }}
              className="h-10"
            />
          )}
        </div>

        <div className="space-y-2 px-3.5 py-3">
          <Label className="text-sm font-medium">{t('Discount')}</Label>
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
            className={SEGMENTED_GROUP}
          >
            <RadioOption id="disc-none" value="none" label={t('None')} />
            <RadioOption id="disc-percent" value="percent" label={t('Percent')} />
            <RadioOption id="disc-amount" value="amount" label={t('Amount')} />
          </RadioGroup>
          {resolved.discount.enabled && (
            <Input
              type="number"
              inputMode="decimal"
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
              className="h-10"
            />
          )}
        </div>

        <div className="space-y-2 px-3.5 py-3">
          <Label className="text-sm font-medium">{t('Deposit')}</Label>
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
            className={SEGMENTED_GROUP}
          >
            <RadioOption id="dep-none" value="none" label={t('None')} />
            <RadioOption id="dep-percent" value="percent" label={t('Percent')} />
            <RadioOption id="dep-amount" value="amount" label={t('Amount')} />
          </RadioGroup>
          {resolved.deposit.enabled && (
            <Input
              type="number"
              inputMode="decimal"
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
              className="h-10"
            />
          )}
        </div>
      </Group>

      {/* --- Document blocks (SEED-056): one row per block; the switch is the state. --- */}
      <div className="flex flex-col gap-2">
        <Group label={t('Document blocks')}>
          {blockKeys.map((key) => (
            <div key={key} className="flex min-h-12 items-center justify-between gap-3 px-3.5 py-1.5">
              <Label
                htmlFor={`section-${key}`}
                className="min-w-0 flex-1 cursor-pointer py-2 text-[15px] font-normal"
              >
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
        </Group>
        <Link
          href="/settings/estimates"
          className="inline-flex items-center gap-0.5 self-start px-1 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {t('Change defaults for new estimates in Settings')}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  )
}

/**
 * Pricing choices render as a segmented control: a bare radio circle's
 * `border-input` all but disappears on the dark popover, so unselected
 * options read as plain text. Each segment is still a Radix radio item
 * (role="radio", arrow-key navigation) whose text is its accessible name.
 */
const SEGMENTED_GROUP = 'grid grid-flow-col auto-cols-fr gap-1 rounded-xl border border-border bg-background p-1'

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
    <RadioGroupPrimitive.Item
      id={id}
      value={value}
      className="h-9 cursor-pointer rounded-lg px-2 text-sm font-medium text-foreground/80 outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:shadow-sm"
    >
      {label}
    </RadioGroupPrimitive.Item>
  )
}
