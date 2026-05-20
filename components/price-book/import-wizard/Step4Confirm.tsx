'use client'

import { useMemo, useState, type Dispatch } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n/use-translation'
import { applyDedupeStrategy, type IncomingRow } from '@/lib/csv/dedupe'
import type { ImportRow } from '@/lib/csv/price-book-import'
import type { WizardAction, WizardState } from '@/lib/csv/wizard-state'

export interface Step4ConfirmProps {
  state: WizardState
  dispatch: Dispatch<WizardAction>
  onCancel: () => void
  onDone: () => void
}

function mergeEdits(row: { values: ImportRow; rowNumber: number }, edits?: Partial<ImportRow>) {
  if (!edits) return row.values
  return { ...row.values, ...edits } as ImportRow
}

export function Step4Confirm({ state, dispatch, onCancel, onDone }: Step4ConfirmProps) {
  const { t } = useTranslation()
  const [importing, setImporting] = useState(false)

  const summary = useMemo(() => {
    const validRows = state.rows.filter(
      (r) => r.errors.length === 0 && !r.isDuplicateInFile,
    )
    const incoming: IncomingRow[] = validRows.map((r) => {
      const v = mergeEdits(r, state.cellEdits[r.rowNumber])
      const override = state.perRowDedupeOverrides[r.rowNumber]
      return {
        folder_name: v.folder_name ?? null,
        name: v.name,
        unit: v.unit ?? null,
        unit_price: v.unit_price,
        notes: v.notes ?? null,
        strategyOverride: override,
      }
    })

    // For Wave 3: we don't have server-side existing rows yet — pass empty.
    // 76-04 will swap this for a real dry-run.
    const result = applyDedupeStrategy({
      existing: [],
      incoming,
      global: state.dedupeStrategy,
    })

    const errorRows = state.rows.filter((r) => r.errors.length > 0).length
    const dupRows = state.rows.filter((r) => r.isDuplicateInFile).length

    return {
      insertCount: result.toInsert.length,
      updateCount: result.toUpdate.length,
      skippedCount: result.skippedCount + dupRows,
      errorCount: errorRows,
      total: result.toInsert.length + result.toUpdate.length,
    }
  }, [state])

  function handleCommit() {
    // TODO(76-04): replace stub with commitImportChunk loop + progress state
    // TODO(76-04): on result, render success/failure subview + wire error CSV download
    setImporting(true)
    setTimeout(() => {
      toast.success(t('Import action wired in 76-04 — this is a stub.'))
      setImporting(false)
      onDone()
    }, 1000)
  }

  return (
    <div className="max-w-md mx-auto space-y-6 py-2">
      {/* Hero stat */}
      <Card variant="stat" className="text-center px-6">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          {t('Total items')}
        </div>
        <div className="text-4xl font-semibold tracking-tight tabular-nums">{summary.total}</div>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="text-emerald-600 dark:text-emerald-400">
            +{summary.insertCount} {t('new')}
          </span>
          <span>·</span>
          <span>
            {summary.updateCount} {t('updates')}
          </span>
          <span>·</span>
          <span>
            {summary.skippedCount} {t('skipped')}
          </span>
        </div>
      </Card>

      {/* Breakdown */}
      <Card variant="glass" className="p-4 gap-3">
        <BreakdownRow label={t('New items')} value={summary.insertCount} />
        <BreakdownRow label={t('Updates to existing items')} value={summary.updateCount} />
        <BreakdownRow label={t('Duplicates skipped')} value={summary.skippedCount} />
        <BreakdownRow
          label={t('Rows with errors (will be skipped)')}
          value={summary.errorCount}
          warn={summary.errorCount > 0}
        />
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        {t('From:')} <span className="font-mono">{state.fileName ?? '—'}</span> ·{' '}
        {state.locale.toUpperCase()} {t('format')}
      </p>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-between items-stretch sm:items-center gap-2 pt-2">
        <Button
          variant="ghost"
          onClick={() => dispatch({ type: 'BACK' })}
          disabled={importing}
        >
          {t('Back')}
        </Button>
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={importing}>
            {t('Cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleCommit}
            disabled={summary.total === 0 || importing}
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t('Importing…')}
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-1" />
                {t('Import')} {summary.total} {t('items')}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function BreakdownRow({
  label,
  value,
  warn,
}: {
  label: string
  value: number
  warn?: boolean
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={warn && value > 0 ? 'font-semibold text-destructive' : 'font-semibold'}>
        {value}
      </span>
    </div>
  )
}
