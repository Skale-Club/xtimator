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

export type TextBlock = 'summary' | 'payment_terms' | 'warranty_terms' | 'timeline' | 'notes'

const TEXT_BLOCKS: readonly TextBlock[] = ['summary', 'payment_terms', 'warranty_terms', 'timeline', 'notes']

export function isTextBlock(key: AddableBlock): key is TextBlock {
  return (TEXT_BLOCKS as readonly string[]).includes(key)
}

const hasContent = (v: string | null | undefined): boolean => typeof v === 'string' && v.trim() !== ''

export interface AddableOptions {
  hasCompanyTerms: boolean
  hasValidUntil: boolean
  /** Locked / sent estimate: content cannot be edited, only presentation can. */
  readOnly?: boolean
  /** Current text of each text block; on a read-only estimate a text chip is
   *  offered only when its column already has content (there is nothing to type
   *  into, so revealing an empty card would be a dead end). */
  content?: Partial<Record<TextBlock, string | null>>
}

/** Hidden blocks the owner can add right now. Pure, exported for tests. */
export function addableBlocks(
  settings: PresentationSettings | null,
  opts: AddableOptions,
): AddableBlock[] {
  const resolved = resolvePresentationSettings(settings)
  return CHIP_ORDER.filter((key) => {
    if (key === 'estimate_terms' && !opts.hasCompanyTerms) return false
    if (key === 'valid_until' && !opts.hasValidUntil) return false
    if (opts.readOnly && isTextBlock(key) && !hasContent(opts.content?.[key])) return false
    return !isSectionVisible(resolved, key)
  })
}

/**
 * The field write that accompanies adding a text block: the company default,
 * but only when the column is still empty, the estimate is editable and the
 * company really has a default. Never an empty string -- a blank default leaves
 * the column null.
 */
export function blockPrefill(
  key: AddableBlock,
  current: Partial<Record<TextBlock, string | null>>,
  companyDefaults: { payment_terms?: string | null; warranty_terms?: string | null } | null | undefined,
  readOnly: boolean,
): { field: TextBlock; value: string } | null {
  if (readOnly || !isTextBlock(key)) return null
  if (current[key] != null) return null
  const fromCompany =
    key === 'payment_terms' ? companyDefaults?.payment_terms
    : key === 'warranty_terms' ? companyDefaults?.warranty_terms
    : null
  return hasContent(fromCompany) ? { field: key, value: fromCompany as string } : null
}

export interface AddBlockRowProps {
  settings: PresentationSettings | null
  hasCompanyTerms: boolean
  hasValidUntil: boolean
  readOnly?: boolean
  content?: Partial<Record<TextBlock, string | null>>
  onAdd: (key: AddableBlock) => void
}

export function AddBlockRow({
  settings,
  hasCompanyTerms,
  hasValidUntil,
  readOnly,
  content,
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
  const blocks = addableBlocks(settings, { hasCompanyTerms, hasValidUntil, readOnly, content })
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
