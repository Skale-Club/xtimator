'use client'

import { useMemo, type Dispatch } from 'react'
import { AlertTriangle, EyeOff } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { TargetField } from '@/lib/csv/price-book-aliases'
import type { WizardAction, WizardState, MappingValue } from '@/lib/csv/wizard-state'

const TARGET_OPTIONS: { value: MappingValue; labelKey: string; required?: boolean }[] = [
  { value: 'name', labelKey: 'Item name (required)', required: true },
  { value: 'unit_price', labelKey: 'Unit price (required)', required: true },
  { value: 'folder', labelKey: 'Folder / category' },
  { value: 'unit', labelKey: 'Unit of measure (ea, hr, sqft…)' },
  { value: 'notes', labelKey: 'Notes' },
  { value: '_skip', labelKey: '— Skip this column —' },
]

export interface Step2MapProps {
  state: WizardState
  dispatch: Dispatch<WizardAction>
  onCancel: () => void
}

export function Step2Map({ state, dispatch, onCancel }: Step2MapProps) {
  const { t } = useTranslation()
  const mapping = state.mapping ?? {}

  // Pull sample preview (first 3 row values per target field)
  const samplesByTarget = useMemo(() => {
    const out: Record<string, string[]> = {}
    const sample = state.rows.slice(0, 3)
    for (const tgt of ['name', 'unit_price', 'folder', 'unit', 'notes'] as TargetField[]) {
      out[tgt] = sample
        .map((r) => {
          const v = (r.values as Record<string, unknown>)[
            tgt === 'folder' ? 'folder_name' : tgt
          ]
          return v == null || v === '' ? '—' : String(v)
        })
        .map((s) => (s.length > 40 ? s.slice(0, 40) + '…' : s))
    }
    return out
  }, [state.rows])

  const headers = state.headers

  // Compute target → header[] map to find duplicates
  const targetToHeaders = useMemo(() => {
    const m = new Map<MappingValue, string[]>()
    for (const h of headers) {
      const v = (mapping[h] ?? '_skip') as MappingValue
      if (!m.has(v)) m.set(v, [])
      m.get(v)!.push(h)
    }
    return m
  }, [headers, mapping])

  const matched = headers.filter((h) => mapping[h] && mapping[h] !== '_skip').length
  const total = headers.length

  const hasName = (targetToHeaders.get('name')?.length ?? 0) === 1
  const hasPrice = (targetToHeaders.get('unit_price')?.length ?? 0) === 1
  const hasDuplicateTarget = Array.from(targetToHeaders.entries()).some(
    ([k, v]) => k !== '_skip' && v.length > 1,
  )
  const canContinue = hasName && hasPrice && !hasDuplicateTarget

  function handleNext() {
    dispatch({ type: 'MAPPING_COMPLETE' })
  }

  return (
    <div className="space-y-6">
      <Card variant="glass" className="p-4">
        <p className="text-sm">
          <span className="font-semibold">
            {matched} {t('of')} {total} {t('columns auto-matched.')}
          </span>{' '}
          <span className="text-muted-foreground">{t('Adjust below if anything looks off.')}</span>
        </p>
      </Card>

      {(!hasName || !hasPrice) && (
        <Alert variant="destructive" role="alert">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('Name and price are required.')}</AlertTitle>
          <AlertDescription>
            {t('Map them or fix your file before continuing.')}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid sm:grid-cols-[1fr_1fr] gap-x-6 gap-y-4">
        {headers.map((header) => {
          const value = (mapping[header] ?? '_skip') as MappingValue
          const isSkip = value === '_skip'
          const conflictHeaders =
            value !== '_skip' ? targetToHeaders.get(value)?.filter((h) => h !== header) ?? [] : []
          const hasConflict = conflictHeaders.length > 0
          const samples = value !== '_skip' ? samplesByTarget[value] ?? [] : []

          return (
            <div key={header} className="space-y-2">
              <div>
                <div className="font-mono text-[13px] font-medium">{header}</div>
                {samples.length > 0 && (
                  <div className="text-xs text-muted-foreground truncate">
                    {t('Sample:')} {samples.join(', ')}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor={`map-${header}`} className="sr-only">
                  {t('Map column')} {header}
                </Label>
                <Select
                  value={value}
                  onValueChange={(v) =>
                    dispatch({ type: 'MAPPING_SET', header, target: v as MappingValue })
                  }
                >
                  <SelectTrigger
                    id={`map-${header}`}
                    className={cn(
                      'w-full',
                      isSkip && 'text-muted-foreground',
                      hasConflict && 'border-destructive',
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TARGET_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.value === '_skip' && <EyeOff className="inline h-3 w-3 mr-1" />}
                        {t(opt.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isSkip && <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden />}
              </div>
              {hasConflict && (
                <p className="text-xs text-destructive">
                  {t('Already mapped to')} <span className="font-mono">{conflictHeaders[0]}</span>.{' '}
                  {t('Pick a different field or skip one.')}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-between items-stretch sm:items-center gap-2 pt-2">
        <Button variant="ghost" onClick={() => dispatch({ type: 'BACK' })}>
          {t('Back')}
        </Button>
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" onClick={handleNext} disabled={!canContinue}>
            {t('Next: preview')}
          </Button>
        </div>
      </div>
    </div>
  )
}
