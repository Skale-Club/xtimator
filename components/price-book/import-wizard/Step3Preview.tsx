'use client'

import { useMemo, useState, type Dispatch } from 'react'
import { AlertTriangle, Check, Copy, Pencil, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/use-translation'
import { parseCurrency } from '@/lib/csv/locale-parser'
import type { ImportRow, ParsedRow } from '@/lib/csv/price-book-import'
import type {
  DedupeStrategy,
  WizardAction,
  WizardState,
} from '@/lib/csv/wizard-state'

const DEDUPE_OPTIONS: {
  value: DedupeStrategy
  titleKey: string
  bodyKey: string
}[] = [
  { value: 'skip', titleKey: 'Skip', bodyKey: 'Keep the existing item. Safe default.' },
  {
    value: 'update',
    titleKey: 'Update',
    bodyKey: 'Overwrite price, unit, and notes on the existing item.',
  },
  {
    value: 'new',
    titleKey: 'Import as new',
    bodyKey: 'Add as "Name (2)" alongside the existing one.',
  },
]

export interface Step3PreviewProps {
  state: WizardState
  dispatch: Dispatch<WizardAction>
  onCancel: () => void
}

type EditableField = 'name' | 'folder_name' | 'unit' | 'unit_price'

function mergeEdits(row: ParsedRow, edits: Partial<ImportRow> | undefined): ImportRow {
  if (!edits) return row.values
  return { ...row.values, ...edits } as ImportRow
}

export function Step3Preview({ state, dispatch, onCancel }: Step3PreviewProps) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState('')

  const mergedRows = useMemo(
    () =>
      state.rows.map((r) => ({
        original: r,
        merged: mergeEdits(r, state.cellEdits[r.rowNumber]),
      })),
    [state.rows, state.cellEdits],
  )

  const validCount = mergedRows.filter(
    (r) => r.original.errors.length === 0 && !r.original.isDuplicateInFile,
  ).length
  const errorCount = mergedRows.filter((r) => r.original.errors.length > 0).length
  const dupCount = mergedRows.filter((r) => r.original.isDuplicateInFile).length

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return mergedRows
    return mergedRows.filter((r) => (r.merged.name ?? '').toLowerCase().includes(q))
  }, [mergedRows, filter])

  const canContinue = validCount > 0

  function handleNext() {
    dispatch({ type: 'PREVIEW_COMPLETE' })
  }

  return (
    <div className="flex flex-col gap-4 min-h-0 flex-1">
      {/* Summary banner */}
      <Card variant="glass" className="p-4">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            <Check className="h-4 w-4" />
            {validCount} {t('ready')}
          </span>
          {errorCount > 0 && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {errorCount} {t('need fixing')}
            </span>
          )}
          {dupCount > 0 && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600 dark:text-amber-400">
              <Copy className="h-4 w-4" />
              {dupCount} {t('duplicates')}
            </span>
          )}
          <div className="flex-1" />
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('Filter rows…')}
              className="pl-8"
            />
          </div>
        </div>
      </Card>

      {/* Dedupe strategy bar */}
      <div className="space-y-2">
        <div className="text-sm font-medium">
          {t('When an item already exists in your Price Book')}
        </div>
        <RadioGroup
          value={state.dedupeStrategy}
          onValueChange={(v) =>
            dispatch({ type: 'DEDUPE_STRATEGY_SET', strategy: v as DedupeStrategy })
          }
          className="grid grid-cols-1 sm:grid-cols-3 gap-2"
        >
          {DEDUPE_OPTIONS.map((opt) => {
            const selected = state.dedupeStrategy === opt.value
            return (
              <Label
                key={opt.value}
                htmlFor={`dd-${opt.value}`}
                className={cn(
                  'flex flex-col items-start gap-1 p-3 rounded-[var(--radius-md)] border cursor-pointer',
                  'bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]',
                  selected
                    ? 'ring-2 ring-primary border-primary/40'
                    : 'border-[var(--glass-border)]',
                )}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value={opt.value} id={`dd-${opt.value}`} />
                  <span className="font-medium text-sm">{t(opt.titleKey)}</span>
                </div>
                <span className="text-xs text-muted-foreground pl-6">{t(opt.bodyKey)}</span>
              </Label>
            )
          })}
        </RadioGroup>
        <p className="text-xs text-muted-foreground">
          {t(
            'In-file duplicates are shown below. Duplicates against your existing Price Book are checked at import.',
          )}
        </p>
      </div>

      {/* Preview table */}
      <div className="overflow-auto flex-1 min-h-[200px] rounded-md border border-[var(--glass-border)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 sticky left-0 bg-background z-10">#</TableHead>
              <TableHead>{t('Folder')}</TableHead>
              <TableHead>{t('Name')}</TableHead>
              <TableHead>{t('Unit')}</TableHead>
              <TableHead>{t('Price')}</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  {filter
                    ? t('No rows match your filter.')
                    : t('No rows to preview yet.')}
                  {filter && (
                    <Button
                      variant="link"
                      size="sm"
                      className="ml-1"
                      onClick={() => setFilter('')}
                    >
                      {t('Clear filter')}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )}
            {filtered.map(({ original, merged }) => {
              const isInvalid = original.errors.length > 0
              const isDup = original.isDuplicateInFile
              const wasEdited = !!state.cellEdits[original.rowNumber]
              return (
                <TableRow
                  key={original.rowNumber}
                  data-testid={isInvalid ? 'invalid-row' : undefined}
                  aria-invalid={isInvalid ? 'true' : undefined}
                  className={cn(
                    isInvalid && 'bg-destructive/10',
                    isDup && !isInvalid && 'opacity-60',
                  )}
                >
                  <TableCell className="sticky left-0 bg-background text-xs text-muted-foreground">
                    {wasEdited && (
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full bg-primary mr-1"
                        aria-label={t('Edited')}
                      />
                    )}
                    {original.rowNumber}
                  </TableCell>
                  <EditableCell
                    value={merged.folder_name ?? ''}
                    field="folder_name"
                    rowNumber={original.rowNumber}
                    dispatch={dispatch}
                    placeholder={t('—')}
                  />
                  <EditableCell
                    value={merged.name ?? ''}
                    field="name"
                    rowNumber={original.rowNumber}
                    dispatch={dispatch}
                    error={original.errors.includes('missing_name')}
                  />
                  <EditableCell
                    value={merged.unit ?? ''}
                    field="unit"
                    rowNumber={original.rowNumber}
                    dispatch={dispatch}
                    placeholder={t('—')}
                  />
                  <EditablePriceCell
                    value={merged.unit_price}
                    rowNumber={original.rowNumber}
                    dispatch={dispatch}
                    locale={state.locale}
                    error={
                      original.errors.includes('missing_unit_price') ||
                      original.errors.includes('invalid_unit_price') ||
                      original.errors.includes('negative_unit_price')
                    }
                  />
                  <TableCell>
                    {isInvalid && (
                      <span
                        title={original.errors.join(', ')}
                        aria-label={original.errors.join(', ')}
                      >
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      </span>
                    )}
                    {isDup && !isInvalid && (
                      <span
                        className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400"
                        title={t('duplicate in file')}
                      >
                        {t('dup')}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {!canContinue && (
        <p className="text-xs text-destructive">
          {t('Fix at least one row to continue.')}
        </p>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-between items-stretch sm:items-center gap-2 pt-2">
        <Button variant="ghost" onClick={() => dispatch({ type: 'BACK' })}>
          {t('Back')}
        </Button>
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" onClick={handleNext} disabled={!canContinue}>
            {t('Next: confirm')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---- Editable cells ----

interface EditableCellProps {
  value: string
  field: EditableField
  rowNumber: number
  dispatch: Dispatch<WizardAction>
  placeholder?: string
  error?: boolean
}

function EditableCell({
  value,
  field,
  rowNumber,
  dispatch,
  placeholder,
  error,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  function commit() {
    if (draft !== value) {
      dispatch({ type: 'EDIT_CELL', rowNumber, field, value: draft })
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <TableCell className="p-1">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setDraft(value)
              setEditing(false)
            }
          }}
          className="h-8"
        />
      </TableCell>
    )
  }

  return (
    <TableCell
      role="button"
      tabIndex={0}
      onClick={() => {
        setDraft(value)
        setEditing(true)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setDraft(value)
          setEditing(true)
        }
      }}
      className={cn(
        'group cursor-text relative',
        error && 'text-destructive font-medium',
      )}
    >
      {value || <span className="text-muted-foreground italic">{placeholder ?? ''}</span>}
      <Pencil className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 opacity-0 group-hover:opacity-60" />
    </TableCell>
  )
}

interface EditablePriceCellProps {
  value: number
  rowNumber: number
  dispatch: Dispatch<WizardAction>
  locale: WizardState['locale']
  error?: boolean
}

function EditablePriceCell({
  value,
  rowNumber,
  dispatch,
  locale,
  error,
}: EditablePriceCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ''))

  function commit() {
    const parsed = parseCurrency(draft, locale)
    if (parsed !== null && parsed !== value) {
      dispatch({ type: 'EDIT_CELL', rowNumber, field: 'unit_price', value: parsed })
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <TableCell className="p-1">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setDraft(String(value))
              setEditing(false)
            }
          }}
          className="h-8"
        />
      </TableCell>
    )
  }

  return (
    <TableCell
      role="button"
      tabIndex={0}
      onClick={() => {
        setDraft(String(value ?? ''))
        setEditing(true)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setDraft(String(value ?? ''))
          setEditing(true)
        }
      }}
      className={cn(
        'group cursor-text relative tabular-nums',
        error && 'text-destructive font-medium',
      )}
    >
      {value === 0 || value == null ? (
        <span className="text-muted-foreground italic">—</span>
      ) : (
        value.toFixed(2)
      )}
      <Pencil className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 opacity-0 group-hover:opacity-60" />
    </TableCell>
  )
}
