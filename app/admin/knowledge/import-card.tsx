'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { INDUSTRIES } from '@/lib/industries'
import {
  parseKnowledgeCsv,
  type KnowledgeParseOutcome,
} from '@/lib/csv/knowledge-import'
import { bulkImportEntries } from './actions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { T } from '@/components/i18n/t'
import { useTranslation } from '@/lib/i18n/use-translation'

/**
 * Pure confirm-enable gate for the bulk-import card. Confirm is allowed only when
 * an industry is chosen AND the parse succeeded with at least one valid row. Kept
 * a pure exported helper so the gate is unit-provable without rendering the file
 * input.
 */
export function canConfirmImport(
  industryId: string,
  outcome: KnowledgeParseOutcome | null
): boolean {
  return Boolean(industryId) && Boolean(outcome?.ok && outcome.validCount > 0)
}

export function ImportCard() {
  const { t } = useTranslation()
  const router = useRouter()
  const [industryId, setIndustryId] = useState('')
  const [outcome, setOutcome] = useState<KnowledgeParseOutcome | null>(null)
  const [isPending, startTransition] = useTransition()

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await parseKnowledgeCsv(file)
    setOutcome(result)
    if (!result.ok) {
      toast.error(result.detail)
    }
  }

  function onConfirm() {
    const rows =
      outcome?.ok
        ? outcome.rows
            .filter((r) => r.errors.length === 0 && !r.isDuplicateInFile)
            .map((r) => r.values)
        : []
    startTransition(async () => {
      const res = await bulkImportEntries(industryId, rows)
      if (res.ok) {
        toast.success(
          t('Imported {n} entries').replace('{n}', String(res.imported ?? rows.length))
        )
        setOutcome(null)
        router.refresh()
      } else {
        toast.error(res.message)
      }
    })
  }

  return (
    <Card variant="glass" className="p-6 space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">
          <T>Bulk import</T>
        </h2>
        <p className="text-sm text-muted-foreground">
          <T>Upload a CSV (title, body, source) to seed an industry&apos;s knowledge base.</T>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="import-industry">{t('Industry')}</Label>
          <Select value={industryId} onValueChange={setIndustryId}>
            <SelectTrigger id="import-industry">
              <SelectValue placeholder={t('Select industry')} />
            </SelectTrigger>
            <SelectContent>
              {INDUSTRIES.map((ind) => (
                <SelectItem key={ind.id} value={ind.id}>
                  {ind.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="import-file">{t('CSV file')}</Label>
          <input
            id="import-file"
            type="file"
            accept=".csv"
            onChange={onFile}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--glass-bg-light)] file:px-3 file:py-1.5 file:text-sm file:text-foreground"
          />
        </div>
      </div>

      {outcome?.ok && (
        <p className="text-sm text-muted-foreground">
          {t('{valid} valid, {invalid} invalid, {dup} duplicate')
            .replace('{valid}', String(outcome.validCount))
            .replace('{invalid}', String(outcome.invalidCount))
            .replace('{dup}', String(outcome.inFileDuplicateCount))}
        </p>
      )}

      {outcome?.ok === false && (
        <p className="text-sm text-destructive">{outcome.detail}</p>
      )}

      <Button
        onClick={onConfirm}
        disabled={!canConfirmImport(industryId, outcome) || isPending}
      >
        <T>Confirm import</T>
      </Button>
    </Card>
  )
}
