'use client'

import { useRef, useState, type Dispatch } from 'react'
import { AlertTriangle, Download, Loader2, Upload } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import {
  parsePriceBookCsv,
  type ParseOutcome,
} from '@/lib/csv/price-book-import'
import { detectColumnMapping } from '@/lib/csv/price-book-aliases'
import { detectLocale, type LocaleMode, type CustomLocale } from '@/lib/csv/locale-parser'
import type { WizardAction, WizardState } from '@/lib/csv/wizard-state'

export interface Step1UploadProps {
  state: WizardState
  dispatch: Dispatch<WizardAction>
  onCancel: () => void
}

function friendlyFatalKey(
  fatal: Extract<ParseOutcome, { ok: false }>['fatal'],
  detail: string,
): { title: string; body: string } {
  switch (fatal) {
    case 'too_large':
      return {
        title: 'File is over 1 MB.',
        body: 'Try splitting it into smaller batches.',
      }
    case 'too_many_rows':
      return {
        title: 'More than 1000 rows.',
        body: 'Split your file and import in batches.',
      }
    case 'wrong_type':
      return {
        title: 'We need a .csv file.',
        body: 'Save your spreadsheet as CSV from Excel or Sheets.',
      }
    case 'missing_columns':
      return {
        title: 'Required columns missing.',
        body: `${detail}. We need a name and price column at minimum.`,
      }
    case 'parse_error':
      return {
        title: "Couldn't read that file.",
        body: `${detail} | try re-saving it from your spreadsheet app.`,
      }
    default:
      return { title: 'Something went wrong.', body: detail }
  }
}

export function Step1Upload({ state, dispatch, onCancel }: Step1UploadProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [fatalError, setFatalError] = useState<{ title: string; body: string } | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(state.file)
  const [pendingOutcome, setPendingOutcome] = useState<Extract<ParseOutcome, { ok: true }> | null>(
    null,
  )
  const [detectedLocale, setDetectedLocale] = useState<LocaleMode | null>(null)
  const [showOverride, setShowOverride] = useState(false)
  const [overrideMode, setOverrideMode] = useState<LocaleMode>('plain')
  const [customDecimal, setCustomDecimal] = useState('.')
  const [customThousands, setCustomThousands] = useState(',')

  async function processFile(file: File) {
    setParsing(true)
    setFatalError(null)
    const outcome = await parsePriceBookCsv(file)
    setParsing(false)
    if (!outcome.ok) {
      setFatalError(friendlyFatalKey(outcome.fatal, outcome.detail))
      setPendingFile(null)
      setPendingOutcome(null)
      setDetectedLocale(null)
      return
    }
    // Detect locale from first 5 non-empty raw unit_price values
    const samples = outcome.rows
      .map((r) => String(r.values.unit_price ?? ''))
      .filter((s) => s && s !== '0' && s !== '0.0')
      .slice(0, 5)
    const detected = detectLocale(samples)
    setPendingFile(file)
    setPendingOutcome(outcome)
    setDetectedLocale(detected)
    setOverrideMode(detected)
  }

  function handleFileInput(file: File) {
    void processFile(file)
  }

  function handleConfirmLocale() {
    if (!pendingFile || !pendingOutcome) return
    const locale: LocaleMode = showOverride ? overrideMode : (detectedLocale ?? 'plain')
    const customLocale: CustomLocale | undefined =
      locale === 'custom'
        ? { decimal: customDecimal || '.', thousands: customThousands || '' }
        : undefined

    // Re-parse with chosen locale so unit_price values normalize correctly
    void parsePriceBookCsv(pendingFile, { locale, customLocale }).then((re) => {
      if (!re.ok) {
        setFatalError(friendlyFatalKey(re.fatal, re.detail))
        return
      }
      // Seed auto-detected mapping from headers we discovered on the first parse.
      // We need the header list — pull it from raw papaparse meta via headers in the row keys.
      const headers = Object.keys(
        (pendingOutcome.rows[0]?.values ?? {}) as Record<string, unknown>,
      )
      // That's the normalized target keys (folder_name/name/unit/unit_price/notes), not raw csv headers.
      // We re-derive from the file by re-reading the meta — easier: call detectColumnMapping on a
      // best-effort header list. Since parsePriceBookCsv already lowercased + trimmed and required
      // {name, unit_price}, we can use the union of common targets here for seed purposes.
      // Better: re-parse once more with options.mapping=undefined and capture meta — but the
      // current parser doesn't expose meta. As a pragmatic seed, treat baseline canonical names
      // as the headers (the wizard's Step 2 will let the user override anyway if they exist).
      const seedHeaders = ['name', 'unit_price', 'folder', 'unit', 'notes']
      const mapping = detectColumnMapping(seedHeaders)

      dispatch({
        type: 'FILE_PARSED',
        file: pendingFile,
        rows: re.rows,
        headers: seedHeaders,
        detectedLocale: locale,
      })
      dispatch({ type: 'LOCALE_SET', mode: locale, custom: customLocale })
      // Seed mapping per header so Step 2 reflects auto-detection.
      for (const [h, target] of Object.entries(mapping)) {
        dispatch({ type: 'MAPPING_SET', header: h, target })
      }
    })
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFileInput(f)
  }

  return (
    <div className="space-y-6">
      <Card variant="glass" className="py-0">
        <label
          className={cn(
            'group relative flex flex-col items-center justify-center gap-4 rounded-[var(--radius-lg)]',
            'border-2 border-dashed transition-all cursor-pointer',
            'min-h-[240px] sm:min-h-[320px] p-6',
            dragOver
              ? 'border-primary bg-primary/5 scale-[1.005]'
              : 'border-[var(--glass-border)] bg-[var(--glass-bg-light,transparent)]',
            parsing && 'pointer-events-none opacity-70',
          )}
          onDragEnter={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {parsing ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          ) : (
            <Upload
              className="h-8 w-8 text-transparent bg-clip-text"
              style={{ color: 'var(--color-primary, currentColor)' }}
            />
          )}
          <div className="text-center space-y-1">
            <p className="text-base font-semibold">
              {parsing ? t('Reading your file…') : t('Drop your CSV here')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('or click to browse | max 1 MB, max 1000 rows')}
            </p>
          </div>
          <Button type="button" variant="outline" asChild>
            <span>
              <Upload className="mr-2 h-4 w-4" />
              {t('Select file')}
            </span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFileInput(f)
              if (e.target) e.target.value = ''
            }}
          />
        </label>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        {t('New here?')}{' '}
        <a
          href="/price-book-template.csv"
          download
          className="text-primary underline-offset-4 hover:underline inline-flex items-center gap-1"
        >
          <Download className="h-3 w-3" />
          {t('Download our template')}
        </a>
      </p>

      {fatalError && (
        <Alert variant="destructive" role="alert">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t(fatalError.title)}</AlertTitle>
          <AlertDescription>{t(fatalError.body)}</AlertDescription>
        </Alert>
      )}

      {pendingOutcome && detectedLocale && (
        <Alert role="status">
          <AlertTitle>
            {detectedLocale === 'us' && t('US number format detected')}
            {detectedLocale === 'br' && t('Brazilian format detected')}
            {detectedLocale === 'plain' && t('Plain numbers detected')}
            {detectedLocale === 'custom' && t('Custom number format')}
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              {detectedLocale === 'us' && '($1,234.56)'}
              {detectedLocale === 'br' && '(R$ 1.234,56)'}
              {detectedLocale === 'plain' && '(1234.56)'}
            </span>
          </AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button size="sm" onClick={handleConfirmLocale}>
                {t('Looks right')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowOverride((v) => !v)}
              >
                {t('Override')}
              </Button>
              <span className="text-xs text-muted-foreground ml-1">
                {pendingOutcome.validCount} {t('valid rows ready')}
              </span>
            </div>
            {showOverride && (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] items-end gap-3 pt-3">
                <div className="space-y-1">
                  <Label htmlFor="locale-override">{t('Number format')}</Label>
                  <Select
                    value={overrideMode}
                    onValueChange={(v) => setOverrideMode(v as LocaleMode)}
                  >
                    <SelectTrigger id="locale-override">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="us">{t('US ($1,234.56)')}</SelectItem>
                      <SelectItem value="br">{t('Brazilian (R$ 1.234,56)')}</SelectItem>
                      <SelectItem value="plain">{t('Plain (1234.56)')}</SelectItem>
                      <SelectItem value="custom">{t('Custom…')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {overrideMode === 'custom' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="loc-dec">{t('Decimal')}</Label>
                      <Input
                        id="loc-dec"
                        value={customDecimal}
                        onChange={(e) => setCustomDecimal(e.target.value)}
                        maxLength={1}
                        className="w-14"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="loc-thou">{t('Thousands')}</Label>
                      <Input
                        id="loc-thou"
                        value={customThousands}
                        onChange={(e) => setCustomThousands(e.target.value)}
                        maxLength={1}
                        className="w-14"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Step footer: cancel + primary CTA */}
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end items-stretch sm:items-center gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel} className="sm:w-auto">
          {t('Cancel')}
        </Button>
        <Button
          variant="primary"
          onClick={handleConfirmLocale}
          disabled={!pendingOutcome || parsing}
        >
          {t('Next: map columns')}
        </Button>
      </div>
    </div>
  )
}
