'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'
import { getRecentUndoableImport, undoLastImport } from '@/lib/actions/price-book'

interface RecentImport {
  id: string
  createdAt: string
  summary: Record<string, unknown>
}

/**
 * Phase 76 PB-CSV-07: Floating banner on /price-book that surfaces the last
 * 5-minute undoable import. Self-hides when:
 *   - No recent import exists
 *   - User clicks Undo (and it succeeds)
 *   - The 5-minute window elapses while the page is open
 */
export function UndoImportBanner() {
  const { t } = useTranslation()
  const router = useRouter()
  const [imp, setImp] = useState<RecentImport | null>(null)
  const [undoing, setUndoing] = useState(false)

  useEffect(() => {
    let cancelled = false
    getRecentUndoableImport()
      .then((res) => {
        if (cancelled) return
        if ('data' in res && res.data) setImp(res.data)
      })
      .catch(() => {
        /* ignore — banner just won't show */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Auto-dismiss when the 5-minute window expires.
  useEffect(() => {
    if (!imp) return
    const elapsed = Date.now() - new Date(imp.createdAt).getTime()
    const remaining = 5 * 60 * 1000 - elapsed
    if (remaining <= 0) {
      setImp(null)
      return
    }
    const tId = setTimeout(() => setImp(null), remaining)
    return () => clearTimeout(tId)
  }, [imp])

  if (!imp) return null

  const summary = imp.summary as { inserted?: number; updated?: number }
  const n = (summary.inserted ?? 0) + (summary.updated ?? 0)

  async function handleUndo() {
    if (!imp || undoing) return
    setUndoing(true)
    try {
      const res = await undoLastImport(imp.id)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success(
        `${t('Removed')} ${res.data.removedItems} ${t('items')}, ${t('reverted')} ${res.data.revertedItems}.`,
      )
      setImp(null)
      router.refresh()
    } finally {
      setUndoing(false)
    }
  }

  return (
    <Alert className="flex items-center justify-between gap-3" data-testid="undo-import-banner">
      <AlertDescription>
        {n} {t('items imported')} ·{' '}
        <span className="text-muted-foreground">{t('You can undo for 5 minutes.')}</span>
      </AlertDescription>
      <Button size="sm" variant="outline" onClick={handleUndo} disabled={undoing}>
        <Undo2 className="w-4 h-4 mr-2" />
        {t('Undo')}
      </Button>
    </Alert>
  )
}
