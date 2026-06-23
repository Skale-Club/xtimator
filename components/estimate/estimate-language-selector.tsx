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

/**
 * Inline SVG flags per estimate language (en → US, pt → Brazil, es → Mexico).
 * Kept inline (no extra dependency / no network) and simplified for crisp
 * rendering at ~14px. Decorative — the language label carries the meaning.
 */
function LanguageFlag({ lang }: { lang: EstimateLanguage }) {
  const cls = 'h-3.5 w-5 rounded-[2px] shrink-0 ring-1 ring-black/10'
  if (lang === 'pt') {
    return (
      <svg viewBox="0 0 24 16" className={cls} aria-hidden="true">
        <rect width="24" height="16" fill="#009b3a" />
        <path d="M12 2.2 21.4 8 12 13.8 2.6 8Z" fill="#fedf00" />
        <circle cx="12" cy="8" r="3.1" fill="#002776" />
      </svg>
    )
  }
  if (lang === 'es') {
    return (
      <svg viewBox="0 0 24 16" className={cls} aria-hidden="true">
        <rect width="8" height="16" fill="#006847" />
        <rect x="8" width="8" height="16" fill="#fff" />
        <rect x="16" width="8" height="16" fill="#ce1126" />
        <circle cx="12" cy="8" r="1.5" fill="#8a5a2b" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 16" className={cls} aria-hidden="true">
      <rect width="24" height="16" fill="#fff" />
      <rect width="24" height="1.85" y="0" fill="#b22234" />
      <rect width="24" height="1.85" y="3.7" fill="#b22234" />
      <rect width="24" height="1.85" y="7.4" fill="#b22234" />
      <rect width="24" height="1.85" y="11.1" fill="#b22234" />
      <rect width="24" height="1.85" y="14.15" fill="#b22234" />
      <rect width="10" height="8.5" fill="#3c3b6e" />
      <g fill="#fff">
        <circle cx="2.2" cy="2.2" r="0.7" />
        <circle cx="5" cy="2.2" r="0.7" />
        <circle cx="7.8" cy="2.2" r="0.7" />
        <circle cx="3.6" cy="4.3" r="0.7" />
        <circle cx="6.4" cy="4.3" r="0.7" />
        <circle cx="2.2" cy="6.4" r="0.7" />
        <circle cx="5" cy="6.4" r="0.7" />
        <circle cx="7.8" cy="6.4" r="0.7" />
      </g>
    </svg>
  )
}

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
                  <span className="flex items-center gap-2">
                    <LanguageFlag lang={lang} />
                    {label}
                  </span>
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
