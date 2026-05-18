'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  parsePriceBookCsv,
  type ParseOutcome,
  type ParsedRow,
} from '@/lib/csv/price-book-import'
import { importPriceBookItems, resolveOrCreateFolders } from '@/lib/actions/price-book'
import type { ImportRow } from '@/lib/csv/price-book-import'

export interface PriceBookImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Stage =
  | { kind: 'pick'; fatalError: string | null }
  | { kind: 'preview'; outcome: Extract<ParseOutcome, { ok: true }> }

function friendlyMessage(fatal: string, detail: string): string {
  switch (fatal) {
    case 'too_large':
      return 'Your file is over 1 MB. Try removing rows or splitting into multiple files.'
    case 'too_many_rows':
      return 'Your file has too many rows. Max is 1000 — split it into smaller batches.'
    case 'wrong_type':
      return 'We need a .csv file. Save your spreadsheet as CSV and try again.'
    case 'missing_columns':
      return `${detail}. Check the template — header row needs: category, name, unit, unit_price.`
    case 'parse_error':
      return `Could not read your file: ${detail}. Try saving it again from Excel/Sheets.`
    default:
      return detail
  }
}

function rowErrorLabel(error: ParsedRow['errors'][number]): string {
  switch (error) {
    case 'missing_name': return 'missing name'
    case 'missing_unit_price': return 'missing price'
    case 'invalid_unit_price': return 'invalid price (remove commas/symbols)'
    case 'negative_unit_price': return 'negative price'
    default: return error
  }
}

export function PriceBookImportDialog({ open, onOpenChange }: PriceBookImportDialogProps) {
  const [stage, setStage] = useState<Stage>({ kind: 'pick', fatalError: null })
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset stage when dialog reopens (Pitfall 3 — Phase 20 D-06)
  useEffect(() => {
    if (open) {
      setStage({ kind: 'pick', fatalError: null })
      // Clear the file input so the same file can be re-selected after an error
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [open])

  async function handleFile(file: File) {
    const outcome = await parsePriceBookCsv(file)
    if (!outcome.ok) {
      setStage({ kind: 'pick', fatalError: friendlyMessage(outcome.fatal, outcome.detail) })
      return
    }
    setStage({ kind: 'preview', outcome })
  }

  function handleConfirm() {
    if (stage.kind !== 'preview') return
    const validRows = stage.outcome.rows
      .filter((r) => r.errors.length === 0 && !r.isDuplicateInFile)
      .map((r) => r.values as ImportRow)

    startTransition(async () => {
      // Collect unique folder names from valid rows
      const folderNames = [
        ...new Set(
          validRows
            .map((r) => r.folder_name)
            .filter(Boolean) as string[]
        ),
      ]

      // Resolve or create folders, build folderNameMap
      let folderNameMap: Map<string, string> | undefined
      if (folderNames.length > 0) {
        const folderResult = await resolveOrCreateFolders(folderNames)
        if ('error' in folderResult) {
          toast.error(folderResult.error)
          return
        }
        folderNameMap = folderResult.data
      }

      const result = await importPriceBookItems(validRows, folderNameMap)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      const { imported, skipped } = result.data
      const msg =
        skipped > 0
          ? `Imported ${imported} items, skipped ${skipped} duplicates.`
          : `Imported ${imported} items.`
      toast.success(msg)
      // Pitfall 5: close dialog FIRST, then refresh (Phase 20 D-06)
      onOpenChange(false)
      router.refresh()
    })
  }

  const validCount = stage.kind === 'preview' ? stage.outcome.validCount : 0
  const invalidCount = stage.kind === 'preview' ? stage.outcome.invalidCount : 0
  const inFileDuplicateCount = stage.kind === 'preview' ? stage.outcome.inFileDuplicateCount : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
        </DialogHeader>

        {stage.kind === 'pick' && (
          <div className="space-y-4 py-2">
            {/* File picker — native input styled as button (D-16, Pitfall 1) */}
            <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/25 px-6 py-8">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">Choose a CSV file</p>
                <p className="text-xs text-muted-foreground">
                  Required columns: category, name, unit, unit_price · max 1 MB · max 1000 rows
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Select file
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFile(file)
                }}
              />
            </div>

            {/* Template download link (D-07) */}
            <p className="text-center text-xs text-muted-foreground">
              Not sure about the format?{' '}
              <a
                href="/price-book-template.csv"
                download
                className="text-primary underline-offset-4 hover:underline"
              >
                <Download className="inline h-3 w-3 mr-0.5" />
                Download template
              </a>
            </p>

            {/* Fatal error inline (D-14) */}
            {stage.fatalError && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{stage.fatalError}</span>
              </div>
            )}
          </div>
        )}

        {stage.kind === 'preview' && (
          <div className="flex flex-col gap-3 min-h-0 flex-1">
            {/* Summary banner (D-12) */}
            <div className="flex items-center gap-3 rounded-md bg-muted px-4 py-2 text-sm">
              <span className="text-green-700 dark:text-green-400 font-medium">
                {validCount} valid
              </span>
              <span className="text-muted-foreground">·</span>
              <span className={invalidCount > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                {invalidCount} invalid
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {inFileDuplicateCount} duplicates
              </span>
            </div>

            {/* Scrollable preview table (D-11) */}
            <div className="overflow-auto flex-1 rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stage.outcome.rows.map((row) => {
                    const isInvalid = row.errors.length > 0
                    const isDup = row.isDuplicateInFile
                    return (
                      <TableRow
                        key={row.rowNumber}
                        data-testid={isInvalid ? 'invalid-row' : undefined}
                        aria-invalid={isInvalid ? 'true' : undefined}
                        className={
                          isInvalid
                            ? 'bg-destructive/10'
                            : isDup
                              ? 'opacity-50'
                              : undefined
                        }
                      >
                        <TableCell className="text-xs text-muted-foreground">
                          {row.rowNumber}
                        </TableCell>
                        <TableCell>{row.values.category || <span className="text-muted-foreground italic">—</span>}</TableCell>
                        <TableCell>{row.values.name || <span className="text-muted-foreground italic">—</span>}</TableCell>
                        <TableCell>{row.values.unit || <span className="text-muted-foreground italic">—</span>}</TableCell>
                        <TableCell>
                          {isInvalid && row.errors.some(e => e !== 'missing_unit_price')
                            ? row.values.unit_price
                            : row.values.unit_price}
                        </TableCell>
                        <TableCell>
                          {isInvalid && (
                            <span
                              title={row.errors.map(rowErrorLabel).join(', ')}
                              aria-label={row.errors.map(rowErrorLabel).join(', ')}
                            >
                              <AlertTriangle className="h-4 w-4 text-destructive" />
                            </span>
                          )}
                          {isDup && !isInvalid && (
                            <span className="text-xs text-muted-foreground" title="Duplicate row in file">dup</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Error detail for invalid rows */}
            {invalidCount > 0 && (
              <p className="text-xs text-destructive">
                {invalidCount} row{invalidCount !== 1 ? 's' : ''} with errors will be skipped on import.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {stage.kind === 'preview' && (
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={validCount === 0 || isPending}
            >
              {isPending ? 'Importing...' : `Import ${validCount} items`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
