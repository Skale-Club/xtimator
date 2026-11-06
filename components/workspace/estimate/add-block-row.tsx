'use client'

import { Plus } from 'lucide-react'
import {
  isSectionVisible,
  resolvePresentationSettings,
  type PresentationSettings,
  type SectionKey,
} from '@/lib/estimate/presentation-settings'
import { useTranslation } from '@/lib/i18n/use-translation'

// SEED-056 Phase D: the "+ Add block" row. A new estimate starts with only the
// blocks the company configured; every other block is one click away. A chip
// shows up for each block that is currently hidden, and clicking it turns that
// block on for THIS estimate only (the editor writes presentation_settings
// through the same single path the gear panel uses, so it also works on
// sent / locked estimates). Nothing is ever deleted by hiding a block.

export type AddableBlock = Exclude<SectionKey, 'sections'>

const CHIP_ORDER: AddableBlock[] = [
  'summary',
  'payment_terms',
  'warranty_terms',
  'timeline',
  'notes',
  'photos',
  'estimate_terms',
  'valid_until',
]

/** Hidden blocks the owner can add right now. Pure, exported for tests. */
export function addableBlocks(
  settings: PresentationSettings | null,
  opts: { hasCompanyTerms: boolean; hasValidUntil: boolean },
): AddableBlock[] {
  const resolved = resolvePresentationSettings(settings)
  return CHIP_ORDER.filter((key) => {
    if (key === 'estimate_terms' && !opts.hasCompanyTerms) return false
    if (key === 'valid_until' && !opts.hasValidUntil) return false
    return !isSectionVisible(resolved, key)
  })
}

export interface AddBlockRowProps {
  settings: PresentationSettings | null
  hasCompanyTerms: boolean
  hasValidUntil: boolean
  onAdd: (key: AddableBlock) => void
}

export function AddBlockRow({
  settings,
  hasCompanyTerms,
  hasValidUntil,
  onAdd,
}: AddBlockRowProps) {
  const { t } = useTranslation()
  const labels: Record<AddableBlock, string> = {
    summary: t('Summary'),
    payment_terms: t('Payment Terms'),
    warranty_terms: t('Warranty'),
    timeline: t('Timeline'),
    notes: t('Notes'),
    photos: t('Photos'),
    estimate_terms: t('Estimate Terms'),
    valid_until: t('Valid Until'),
  }
  const blocks = addableBlocks(settings, { hasCompanyTerms, hasValidUntil })
  if (blocks.length === 0) return null

  return (
    <div
      data-testid="add-block-row"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border/70 px-4 py-3"
    >
      <span className="text-sm text-muted-foreground">{t('Add block')}</span>
      {blocks.map((key) => (
        <button
          key={key}
          type="button"
          data-testid={`add-block-${key}`}
          onClick={() => onAdd(key)}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-sm hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {labels[key]}
        </button>
      ))}
    </div>
  )
}
