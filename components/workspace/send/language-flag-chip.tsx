// Phase 163 (SENDHUB-06): re-homed from the retired
// components/workspace/send/estimate-preview.tsx. Displays a country-flag chip
// for the estimate's language (en/pt/es). Display-only -- there is NO picker
// anywhere in the send surface (per RESEARCH Q5: language is set at generation
// time in lib/services/generate-estimate.ts and cannot be changed post-hoc).
//
// The customer-facing share surface has its OWN LanguageFlagChip in
// components/share/estimate-view.tsx with different styling; do not consolidate
// here.
//
// Two definitions coexisting for one plan is fine -- estimate-preview.tsx still
// exports LanguageFlagChip until the deletion sweep in 163-06. Every consumer
// (send-dialog / hub) is being flipped to this file so nothing breaks.

'use client'

import type { ComponentType } from 'react'
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
    <span
      data-testid="language-flag-chip"
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] text-xs text-foreground/80"
    >
      <F className="h-3.5 w-3.5 rounded-[2px]" />
      {LANGUAGE_LABELS[lang as EstimateLanguage] ?? lang.toUpperCase()}
    </span>
  )
}
