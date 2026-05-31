'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ComponentType } from 'react'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import { formatCurrency } from '@/lib/utils/format'
import { useTranslation } from '@/lib/i18n/use-translation'
import { FlagUS, FlagBR, FlagES } from '@/components/app-shell/flags'
import { LANGUAGE_LABELS, type EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

const FLAG_MAP_LANG: Record<string, ComponentType<{ className?: string }>> = {
  en: FlagUS,
  pt: FlagBR,
  es: FlagES,
}

export function LanguageFlagChip({ lang }: { lang: string | null | undefined }) {
  if (!lang) return null
  const F = FLAG_MAP_LANG[lang] ?? FlagUS
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] text-xs text-foreground/80">
      <F className="h-3.5 w-3.5 rounded-[2px]" />
      {LANGUAGE_LABELS[lang as EstimateLanguage] ?? lang.toUpperCase()}
    </span>
  )
}

interface EstimatePreviewProps {
  estimate: EstimateWithSections
}

export function EstimatePreview({ estimate }: EstimatePreviewProps) {
  const { t } = useTranslation()
  const money = (value: number) => formatCurrency(value, estimate.currency_code)

  return (
    <Card variant="glass">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-lg">{t('Estimate Preview')}</CardTitle>
        <span className="text-2xl font-bold tabular-nums">{money(estimate.total)}</span>
      </CardHeader>
      <CardContent className="space-y-4">
        {estimate.summary && (
          <p className="text-sm text-muted-foreground">{estimate.summary}</p>
        )}

        <Separator />

        {/* Sections */}
        <ScrollArea className="max-h-72 pr-3">
          <div className="space-y-4">
            {estimate.sections.map((section) => (
              <div key={section.id} className="space-y-2">
                <h4 className="text-sm font-semibold">{t(section.title)}</h4>
                <div className="space-y-1">
                  {section.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {item.description || t('Untitled item')}
                        {item.quantity > 1 && (
                          <span className="ml-1">
                            ({item.quantity} {item.unit ?? 'x'})
                          </span>
                        )}
                      </span>
                      <span className="font-medium tabular-nums">
                        {money(item.total)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end text-sm font-medium">
                  {t('Section:')} {money(section.subtotal)}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <Separator />

        {/* Totals */}
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('Subtotal')}</span>
            <span className="tabular-nums">{money(estimate.subtotal)}</span>
          </div>
          {estimate.discount_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t('Discount')}
                {estimate.discount_type === 'percentage'
                  ? ` (${estimate.discount_value}%)`
                  : ''}
              </span>
              <span className="tabular-nums text-red-600">
                -{money(estimate.discount_amount)}
              </span>
            </div>
          )}
          {estimate.tax_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t('Tax')} ({(estimate.tax_rate * 100).toFixed(1)}%)
              </span>
              <span className="tabular-nums">{money(estimate.tax_amount)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between text-base font-bold">
            <span>{t('Total')}</span>
            <span className="tabular-nums">{money(estimate.total)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
