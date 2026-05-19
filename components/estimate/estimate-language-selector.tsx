'use client'

/**
 * Phase 73-02: Estimate language selector.
 *
 * A compact Select that lets the user choose the target language for a new
 * estimate. Pre-selects based on cascade resolution (app language → 'en').
 *
 * Design decisions:
 * - Stays small (size="sm") to sit beside "Generate Estimate" without dominating
 * - Shows globe icon for discoverability
 * - Defaulted from the caller's resolved language so it reflects the cascade
 */

import { Globe } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LANGUAGE_LABELS, type EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import { useTranslation } from '@/lib/i18n/use-translation'

interface EstimateLanguageSelectorProps {
  value: EstimateLanguage
  onChange: (lang: EstimateLanguage) => void
  /** Small helper text indicating where the default came from (optional) */
  hint?: string
}

export function EstimateLanguageSelector({
  value,
  onChange,
  hint,
}: EstimateLanguageSelectorProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">{t('Estimate language')}:</span>
        <Select value={value} onValueChange={(v) => onChange(v as EstimateLanguage)}>
          <SelectTrigger size="sm" className="h-7 min-w-[160px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(LANGUAGE_LABELS) as [EstimateLanguage, string][]).map(
              ([lang, label]) => (
                <SelectItem key={lang} value={lang} className="text-xs">
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </div>
      {hint && (
        <p className="text-xs text-muted-foreground/70 pl-5">{hint}</p>
      )}
    </div>
  )
}
