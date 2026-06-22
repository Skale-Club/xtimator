'use client'

import { Info } from 'lucide-react'

import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'

interface NeedsDetailsBannerProps {
  onAddDetails: () => void
}

/**
 * HARD-06 (web recourse UI) — recourse banner for a project stuck in
 * `awaiting_details` (a vague estimate that survived the auto-refine cap).
 *
 * Today the web adapter writes `projects.status='awaiting_details'` but nothing
 * surfaces it — a dead-end. This banner explains the estimate came out too vague
 * and offers an "Add details & regenerate" CTA that re-enters the EXISTING
 * capture/generate trigger via `onAddDetails` (the host wires it to
 * `setModePickerOpen(true)` — the same path the Record action uses). No new
 * generation path, no editor redesign — reuses the `Alert` primitive + `Button`.
 *
 * Copy is wrapped in `t()` (the English literal IS the key) so the existing
 * translation pipeline produces pt/es per the UI-SPEC.
 */
export function NeedsDetailsBanner({ onAddDetails }: NeedsDetailsBannerProps) {
  const { t } = useTranslation()

  return (
    <Alert>
      <Info />
      <AlertTitle>{t('We need a bit more detail')}</AlertTitle>
      <AlertDescription>
        <p>
          {t(
            "The estimate came out too vague. Add more about the job — materials, measurements, scope — and we'll rebuild it."
          )}
        </p>
        <Button size="sm" className="mt-2" onClick={onAddDetails}>
          {t('Add details & regenerate')}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
