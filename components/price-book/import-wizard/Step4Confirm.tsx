'use client'

import { useMemo, useRef, useState, type Dispatch } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useTranslation } from '@/lib/i18n/use-translation'
import { applyDedupeStrategy, type IncomingRow } from '@/lib/csv/dedupe'
import { buildErrorCsv, type FailedRow } from '@/lib/csv/error-csv'
import { commitImportChunk } from '@/lib/actions/price-book'
import type { ImportRow } from '@/lib/csv/price-book-import'
import type { WizardAction, WizardState } from '@/lib/csv/wizard-state'

const CHUNK_SIZE = 50

export interface Step4ConfirmProps {
  state: WizardState
  dispatch: Dispatch<WizardAction>
  onCancel: () => void
  onDone: () => void
}

type SubView =
  | { kind: 'pre' }
  | { kind: 'importing'; done: number; total: number }
  | {
      kind: 'success'
      inserted: number
      updated: number
      skipped: number
      importId: string
      failedRows: FailedRow[]
    }
  | {
      kind: 'failure'
      done: number
      message: string
      failedRows: FailedRow[]
    }

function mergeEdits(row: { values: ImportRow; rowNumber: number }, edits?: Partial<ImportRow>) {
  if (!edits) return row.values
  return { ...row.values, ...edits } as ImportRow
}

export function Step4Confirm({ state, dispatch, onCancel, onDone }: Step4ConfirmProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const [view, setView] = useState<SubView>({ kind: 'pre' })
  const cancelRef = useRef<{ aborted: boolean }>({ aborted: false })

  // Build the edited, dedupable row set once per state change.
  const { editedRows, summary } = useMemo(() => {
    const validRows = state.rows.filter(
      (r) => r.errors.length === 0 && !r.isDuplicateInFile,
    )
    const edited: ImportRow[] = validRows.map((r) =>
      mergeEdits(r, state.cellEdits[r.rowNumber]),
    )

    const incoming: IncomingRow[] = validRows.map((r, i) => {
      const v = edited[i]
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

    // Wave 4 still computes client-side preview against an empty existing
    // set — server `commitImportChunk` does the real dedupe against the DB.
    const result = applyDedupeStrategy({
      existing: [],
      incoming,
      global: state.dedupeStrategy,
    })

    const errorRows = state.rows.filter((r) => r.errors.length > 0).length
    const dupRows = state.rows.filter((r) => r.isDuplicateInFile).length

    return {
      editedRows: edited,
      summary: {
        insertCount: result.toInsert.length,
        updateCount: result.toUpdate.length,
        skippedCount: result.skippedCount + dupRows,
        errorCount: errorRows,
        total: edited.length, // server decides insert vs update; we send everything
      },
    }
  }, [state])

  const total = editedRows.length
  const chunkCount = Math.max(1, Math.ceil(total / CHUNK_SIZE))

  function downloadErrorCsv(failedRows: FailedRow[]) {
    const headers =
      state.headers.length > 0
        ? state.headers
        : ['name', 'unit_price', 'unit', 'folder', 'notes']
    const csv = buildErrorCsv(failedRows, headers)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `import-errors-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function startImport() {
    if (total === 0) return
    cancelRef.current.aborted = false
    setView({ kind: 'importing', done: 0, total })

    let importId: string | undefined
    let insertedTotal = 0
    let updatedTotal = 0
    let skippedTotal = 0
    const failedRowsAll: FailedRow[] = []

    for (let i = 0; i < chunkCount; i++) {
      if (cancelRef.current.aborted) {
        setView({
          kind: 'failure',
          done: i * CHUNK_SIZE,
          message: t('Canceled.'),
          failedRows: failedRowsAll,
        })
        return
      }
      const slice = editedRows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
      // perRowOverrides on the server are keyed 1..slice.length within the chunk.
      const sliceOverrides: Record<number, 'skip' | 'update' | 'new'> = {}
      slice.forEach((_row, idx) => {
        const original = state.rows.filter(
          (r) => r.errors.length === 0 && !r.isDuplicateInFile,
        )[i * CHUNK_SIZE + idx]
        const o = original ? state.perRowDedupeOverrides[original.rowNumber] : undefined
        if (o) sliceOverrides[idx + 1] = o
      })

      const res = await commitImportChunk({
        rows: slice,
        globalStrategy: state.dedupeStrategy,
        perRowOverrides: sliceOverrides,
        chunkIndex: i,
        totalChunks: chunkCount,
        importId,
        filename: state.fileName ?? 'import.csv',
        locale: state.locale,
      })

      if ('error' in res) {
        setView({
          kind: 'failure',
          done: i * CHUNK_SIZE,
          message: res.error,
          failedRows: failedRowsAll,
        })
        return
      }

      importId = res.data.importId
      insertedTotal += res.data.insertedCount
      updatedTotal += res.data.updatedCount
      skippedTotal += res.data.skippedCount
      for (const f of res.data.failedRows) {
        failedRowsAll.push({ values: f.values, reason: f.reason })
      }
      setView({
        kind: 'importing',
        done: Math.min(total, (i + 1) * CHUNK_SIZE),
        total,
      })
    }

    setView({
      kind: 'success',
      inserted: insertedTotal,
      updated: updatedTotal,
      skipped: skippedTotal,
      importId: importId ?? '',
      failedRows: failedRowsAll,
    })
  }

  // ── Render ────────────────────────────────────────────────────────────

  if (view.kind === 'importing') {
    const pct = view.total === 0 ? 0 : Math.round((view.done / view.total) * 100)
    return (
      <div className="max-w-md mx-auto space-y-4 py-2">
        <Card variant="glass" className="p-6 gap-3">
          <h3 className="font-semibold text-center">{t('Importing your items…')}</h3>
          <Progress value={pct} className="h-2" />
          <p className="text-sm text-center text-muted-foreground tabular-nums">
            {t('Importing')} {view.done} {t('of')} {view.total}
          </p>
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                cancelRef.current.aborted = true
              }}
            >
              {t('Cancel import')}
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  if (view.kind === 'success') {
    const totalAffected = view.inserted + view.updated
    return (
      <div className="max-w-md mx-auto text-center space-y-4 py-2" data-testid="import-success">
        <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/15 flex items-center justify-center">
          <Check className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-xl font-semibold">
          {totalAffected} {t('items imported')}
        </h2>
        <p className="text-muted-foreground">
          {view.inserted} {t('new')} · {view.updated} {t('updated')}
          {view.skipped > 0 ? ` · ${view.skipped} ${t('skipped')}` : ''}
        </p>
        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={() => {
              if (totalAffected > 0) {
                toast.success(`${totalAffected} ${t('items imported')}`)
              }
              router.refresh()
              onDone()
            }}
          >
            {t('View Price Book')}
          </Button>
          {view.failedRows.length > 0 && (
            <Button variant="outline" onClick={() => downloadErrorCsv(view.failedRows)}>
              <Download className="w-4 h-4 mr-2" />
              {t('Download error report')} ({view.failedRows.length})
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (view.kind === 'failure') {
    return (
      <div className="max-w-md mx-auto text-center space-y-4 py-2">
        <div className="w-12 h-12 mx-auto rounded-full bg-destructive/15 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold">{t('Import failed')}</h2>
        <Alert variant="destructive">
          <AlertDescription>
            {t('Imported')} {view.done} {t('rows before stopping.')} {view.message}
          </AlertDescription>
        </Alert>
        <div className="flex flex-col gap-2">
          <Button variant="primary" onClick={startImport}>
            {t('Try again')}
          </Button>
          {view.failedRows.length > 0 && (
            <Button variant="outline" onClick={() => downloadErrorCsv(view.failedRows)}>
              <Download className="w-4 h-4 mr-2" />
              {t('Download error report')} ({view.failedRows.length})
            </Button>
          )}
          <Button variant="ghost" onClick={onCancel}>
            {t('Close')}
          </Button>
        </div>
      </div>
    )
  }

  // view.kind === 'pre'
  return (
    <div className="max-w-md mx-auto space-y-6 py-2">
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
        <Button variant="ghost" onClick={() => dispatch({ type: 'BACK' })}>
          {t('Back')}
        </Button>
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {t('Cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={startImport}
            disabled={total === 0}
            data-testid="commit-import-btn"
          >
            <Check className="h-4 w-4 mr-1" />
            {t('Import')} {total} {t('items')}
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
