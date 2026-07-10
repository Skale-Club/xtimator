'use client'

import { Loader2 } from 'lucide-react'
import { useTranslationPendingCount } from '@/lib/i18n/language-context'

export function TranslationLoadingOverlay() {
  const pendingCount = useTranslationPendingCount()

  if (pendingCount === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Translating content"
      className="fixed bottom-20 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] bg-[hsl(var(--card))] border border-[hsl(var(--border))] shadow-md md:bottom-4"
    >
      <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--muted-foreground))]" />
      <span className="text-sm text-[hsl(var(--muted-foreground))]">Translating...</span>
    </div>
  )
}
