'use client'

import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TOOLBAR_CONTROL } from '@/components/ui/list-toolbar'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'

/** "Opened, no answer yet" filter button for the Projects list toolbar and phone filter sheet. */
export function AwaitingAnswerToggle({
  active,
  onToggle,
  fullWidth,
}: {
  active: boolean
  onToggle: () => void
  fullWidth?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        TOOLBAR_CONTROL,
        'justify-start gap-2 font-normal',
        fullWidth ? 'w-full' : 'max-w-[220px]',
        active && 'border-primary/40 text-primary',
      )}
    >
      <Eye className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 truncate">{t('Opened, no answer yet')}</span>
    </Button>
  )
}
