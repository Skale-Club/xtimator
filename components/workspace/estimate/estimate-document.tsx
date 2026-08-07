'use client'

import Image from 'next/image'
import { useState, useRef, useEffect, useTransition } from 'react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n/use-translation'
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { createStorage } from '@/lib/storage'
import { MoneyInput } from '@/components/ui/money-input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { formatMoney } from '@/lib/money/currency'
import { deriveDepositDisplay } from '@/lib/estimate/deposit-display'
import { isPercentageDiscount } from '@/lib/estimate/discount-display'
import { formatPhoneForDisplay } from '@/lib/phone/format'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { ensureReadableOnWhite, readableTextColor } from '@/lib/color/contrast'
import { ClientPicker } from '@/components/clients/client-picker'
import {
  resolvePresentationSettings,
  isSectionVisible,
  type PresentationSettings,
} from '@/lib/estimate/presentation-settings'
import { LABELS as DOC_LABELS } from '@/lib/estimate/document/labels'
import { formatAddress, formatDate } from '@/lib/estimate/document/format'
import { LETTER_HEIGHT_PX, cardTintFill } from '@/lib/estimate/document/tokens'
import type {
  DocumentCompany,
  CompanyDefaults,
  DocumentClient,
  DocumentItem,
  DocumentSection,
  DocumentPhoto,
  EstimateDocumentData,
} from '@/lib/estimate/document/model'
import { ItemCardMobile } from './item-card-mobile'
import { PriceBookCombobox } from './price-book-combobox'
import type { EstimateAction, EditorItem } from './use-estimate-reducer'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import type { PriceBookItem } from '@/lib/queries/price-book'

interface DocLabels {
  estimate: string
  project: string
  billTo: string
  summary: string
  description: string
  qty: string
  unit: string
  unitPrice: string
  lineDiscount: string
  taxable: string
  total: string
  sectionSubtotal: string
  subtotal: string
  discount: string
  discountNone: string
  discountPct: string
  discountFixed: string
  deposit: string
  depositNone: string
  depositPct: string
  depositAmount: string
  balanceDue: string
  tax: string
  grandTotal: string
  paymentTerms: string
  timeline: string
  warranty: string
  notes: string
  date: string
  estimateNum: string
  noClient: string
  addItem: string
  addSection: string
  addDetails: string
  summaryPlaceholder: string
  termsPlaceholder: string
  searchPriceBook: string
  noMatches: string
  customized: string
  usingDefault: string
  resetToDefault: string
  photos: string
}

const UNIT_OPTIONS_BY_LANG: Record<EstimateLanguage, string[]> = {
  en: ['each', 'hour', 'day', 'sq ft', 'linear ft', 'cubic yd', 'gallon', 'lb', 'ton', 'lot'],
  pt: ['unidade', 'hora', 'dia', 'm²', 'm', 'm³', 'litro', 'kg', 'tonelada', 'lote'],
  es: ['unidad', 'hora', 'día', 'm²', 'm', 'm³', 'litro', 'kg', 'tonelada', 'lote'],
}

/** Returns the language unit list, prepending the current value if it's not in the list. */
function resolveUnitOptions(lang: EstimateLanguage, currentValue: string | null): string[] {
  const base = UNIT_OPTIONS_BY_LANG[lang] ?? UNIT_OPTIONS_BY_LANG.en
  if (currentValue && !base.includes(currentValue)) return [currentValue, ...base]
  return base
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

// Re-export (not just import) so the 13 existing external import sites of
// these names from '@/components/workspace/estimate/estimate-document'
// keep resolving unchanged.
export type {
  DocumentCompany,
  CompanyDefaults,
  DocumentClient,
  DocumentItem,
  DocumentSection,
  DocumentPhoto,
  EstimateDocumentData,
}

interface EstimateDocumentProps {
  mode: 'view' | 'edit'
  data: EstimateDocumentData
  /** Full company header — required in view/share mode, omit in edit mode */
  company?: DocumentCompany
  /** Override brand color (used in edit mode when company object isn't available) */
  brandColor?: string
  /** R4 — company defaults for the override-vs-default indicator (edit mode only) */
  companyDefaults?: CompanyDefaults
  client: DocumentClient | null
  projectName: string
  projectType: string | null
  language?: EstimateLanguage | null
  estimateVersion: number
  /** Per-company sequential identifier, used as the default displayed estimate number when no override is set. */
  estimateSeq?: number
  estimateCreatedAt: string
  /** Required when mode="edit" */
  dispatch?: React.Dispatch<EstimateAction>
  /** edit mode: locks fields when consolidated or old version */
  isReadOnly?: boolean
  /** Enables inline project-name editing and "No client linked" click-to-link */
  projectId?: string
  onRenameProject?: (name: string) => Promise<void>
  /** Quick-260525-qbc: price book for description autocomplete (defaults to []) */
  priceBookItems?: PriceBookItem[]
  /** Edit mode only — renders a remove "x" on each attached-photo thumbnail. Never passed in view/share mode. */
  onDetachPhoto?: (photoId: string) => void
  /** Quick-260718-p3v — 'Full page' view mode: renders the document as a
   *  print-preview letter sheet (square corners, hairline border, paper
   *  shadow, US-Letter min-height) instead of the rounded app card. */
  pageView?: boolean
  /** Phase 185 (PGMODE-02/03) — rendered ONLY when provided. The editor's TWO
   *  call sites (full-width AND paginated) always pass both; the public share
   *  webview (components/share/estimate-view.tsx) passes NEITHER and stays
   *  byte-compatible (PGMODE-05 — a dedicated test proves this explicitly). */
  preparedBy?: string | null
  companyTerms?: { enabled: boolean; text: string | null } | null
}

// Common class string for inline editable fields (looks like plain text, activates on focus/hover)
const INLINE_INPUT_CLS =
  'w-full bg-transparent text-base p-1 focus:outline-none focus:bg-muted/30 focus:rounded-sm hover:bg-muted/20 hover:rounded-sm transition-colors'
const INLINE_TEXTAREA_CLS =
  'w-full bg-transparent text-base text-muted-foreground whitespace-pre-line resize-none leading-relaxed p-1 focus:outline-none focus:bg-muted/30 focus:rounded-sm hover:bg-muted/20 hover:rounded-sm transition-colors'

// Section-scoped horizontal padding — every doc surface below the ESTIMATE
// title band aligns to `px-6 sm:px-10` (Phase 162-03 3a alignment pass,
// DOCUX-05). Applied to:
//   - DocumentSectionBlock section header bar
//   - Read-only mobile stacked row
//   - Section subtotal footer
//   - Add-item row
//   - Info grid, DocumentTotals, Add-section row, Terms, Attached Photos
//     already use this literal string via px-6 sm:px-10; SECTION_PX is
//     the future-proof extraction so any drift is one-line-fixable.
const SECTION_PX = 'px-6 sm:px-10'

// ---------------------------------------------------------------------------
// DatePopover — inline-styled date trigger that opens a calendar popover
// ---------------------------------------------------------------------------

function DatePopover({
  value,
  onChange,
  lang,
}: {
  value: string
  onChange: (iso: string | null) => void
  lang: EstimateLanguage
}) {
  const [open, setOpen] = useState(false)
  const parsed = value ? new Date(`${value}T00:00:00`) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-base text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors tabular-nums"
        >
          {parsed ? formatDate(value, lang) : '—'}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-0 rounded-xl border shadow-xl"
      >
        <Calendar
          mode="single"
          selected={parsed}
          defaultMonth={parsed}
          captionLayout="dropdown"
          onSelect={(d) => {
            if (d) {
              const yyyy = d.getFullYear()
              const mm = String(d.getMonth() + 1).padStart(2, '0')
              const dd = String(d.getDate()).padStart(2, '0')
              onChange(`${yyyy}-${mm}-${dd}`)
            } else {
              onChange(null)
            }
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// SortableDocumentItemRow — edit mode only, must live inside DndContext
// ---------------------------------------------------------------------------

function SortableDocumentItemRow({
  item,
  sectionId,
  dispatch,
  currencyCode,
  lang,
  priceBookItems,
  L,
  pageView = false,
}: {
  item: DocumentItem
  sectionId: string
  dispatch: React.Dispatch<EstimateAction>
  currencyCode: string
  lang: EstimateLanguage
  priceBookItems: PriceBookItem[]
  L: DocLabels
  /** 260728 rework — paginated mode renders rows PDF-like at rest (wrapped
   *  description text, no Disc./Tax columns, chrome revealed on interaction). */
  pageView?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      {...attributes}
      data-page-block-id={`${sectionId}-rows-${item.id}`}
      data-item-id={item.id}
      className="border-b border-border/50 group even:bg-muted/40"
    >
      {/* drag handle — pageView: invisible at rest (PDF-like), revealed on row hover */}
      <td className="py-1 px-1 w-6 align-middle">
        <span
          className={`cursor-grab inline-flex items-center ${
            pageView
              ? 'opacity-0 group-hover:opacity-100 text-muted-foreground/60 transition-opacity'
              : 'text-muted-foreground/30 group-hover:text-muted-foreground/60'
          }`}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
      </td>
      {/* description — pageView: wrapped text at rest (mirrors the PDF's
          multi-line cell, killing truncation); the combobox input sits
          invisible on top and appears on click/focus, so price-book
          autocomplete keeps working unchanged. */}
      <td className="py-1 px-1 align-middle">
        <div className={pageView ? 'group/desc relative cursor-text' : undefined}>
          {pageView && (
            <div
              aria-hidden
              className="whitespace-pre-wrap break-words text-base px-1 py-1 min-h-8 group-focus-within/desc:invisible"
            >
              {item.description || <span className="text-muted-foreground">Item description</span>}
            </div>
          )}
          <div className={pageView ? 'absolute inset-0 opacity-0 focus-within:opacity-100 focus-within:bg-white' : undefined}>
            <PriceBookCombobox
              value={item.description}
              onChange={(next) =>
                dispatch({
                  type: 'UPDATE_ITEM',
                  sectionId,
                  itemId: item.id,
                  field: 'description',
                  value: next,
                })
              }
              onSelectPriceBookItem={(pb) =>
                dispatch({
                  type: 'APPLY_PRICE_BOOK_ITEM',
                  sectionId,
                  itemId: item.id,
                  item: { name: pb.name, unit: pb.unit, unit_price: pb.unit_price },
                })
              }
              items={priceBookItems}
              currencyCode={currencyCode}
              placeholder="Item description"
              className={pageView ? `${INLINE_INPUT_CLS} h-full` : INLINE_INPUT_CLS}
              noMatchesLabel={L.noMatches}
            />
          </div>
        </div>
      </td>
      {/* qty */}
      <td className="py-1 px-1 w-16 align-middle">
        <input
          type="number"
          step="any"
          min="0"
          value={item.quantity}
          onChange={(e) =>
            dispatch({
              type: 'UPDATE_ITEM',
              sectionId,
              itemId: item.id,
              field: 'quantity',
              value: parseFloat(e.target.value) || 0,
            })
          }
          className={`${INLINE_INPUT_CLS} text-center tabular-nums`}
        />
      </td>
      {/* unit */}
      <td className="py-1 px-1 w-24 align-middle">
        <Select
          value={item.unit ?? ''}
          onValueChange={(value) =>
            dispatch({
              type: 'UPDATE_ITEM',
              sectionId,
              itemId: item.id,
              field: 'unit',
              value: value || null,
            })
          }
        >
          <SelectTrigger className="h-8 bg-transparent border-0 shadow-none text-base px-1 hover:bg-muted/20 focus:ring-1 focus:ring-primary/30">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {resolveUnitOptions(lang, item.unit).map((u) => (
              <SelectItem key={u} value={u}>{u}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      {/* unit price */}
      <td className="py-1 px-1 w-28 align-middle">
        <MoneyInput
          value={item.unit_price}
          currencyCode={currencyCode}
          onValueChange={(value) =>
            dispatch({
              type: 'UPDATE_ITEM',
              sectionId,
              itemId: item.id,
              field: 'unit_price',
              value,
            })
          }
          className="h-8 bg-transparent border-0 shadow-none text-right text-base tabular-nums p-1 focus:ring-1 focus:ring-primary/30 hover:bg-muted/20 hover:rounded-sm"
        />
      </td>
      {/* line discount + taxable — hidden in pageView (not part of the PDF's
          column set; the paginated sheet mirrors the customer document).
          Full-width mode keeps them exactly as before. */}
      {!pageView && (
        <td className="py-1 px-1 w-20 align-middle">
          <MoneyInput
            value={item.discount ?? 0}
            currencyCode={currencyCode}
            onValueChange={(value) =>
              dispatch({
                type: 'UPDATE_ITEM',
                sectionId,
                itemId: item.id,
                field: 'discount',
                value,
              })
            }
            className="h-8 bg-transparent border-0 shadow-none text-right text-base tabular-nums p-1 focus:ring-1 focus:ring-primary/30 hover:bg-muted/20 hover:rounded-sm"
          />
        </td>
      )}
      {!pageView && (
        <td className="py-1 px-1 w-12 text-center align-middle">
          <Switch
            checked={item.taxable ?? true}
            onCheckedChange={(checked) =>
              dispatch({
                type: 'UPDATE_ITEM',
                sectionId,
                itemId: item.id,
                field: 'taxable',
                value: checked,
              })
            }
            aria-label={L.taxable}
          />
        </td>
      )}
      {/* total */}
      <td className="py-1 pr-3 pl-1 w-28 text-right text-base tabular-nums font-medium align-middle">
        {formatMoney(item.total, currencyCode)}
      </td>
      {/* remove */}
      <td className="py-1 px-1 w-8 align-middle">
        <button
          onClick={() =>
            dispatch({ type: 'REMOVE_ITEM', sectionId, itemId: item.id })
          }
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1 min-h-[32px] min-w-[32px] flex items-center justify-center"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// DocumentSectionBlock
// ---------------------------------------------------------------------------

function DocumentSectionBlock({
  section,
  dispatch,
  isEditable,
  brandColor,
  brandOnFill,
  currencyCode,
  L,
  lang,
  dragHandleProps,
  priceBookItems = [],
  pageView = false,
}: {
  section: DocumentSection
  dispatch?: React.Dispatch<EstimateAction>
  isEditable: boolean
  brandColor: string
  brandOnFill: string
  currencyCode: string
  L: DocLabels
  lang: EstimateLanguage
  dragHandleProps?: Record<string, unknown>
  priceBookItems?: PriceBookItem[]
  /** 260728 rework — see SortableDocumentItemRow. */
  pageView?: boolean
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  const itemDndId = `dnd-items-${section.id}`

  function handleItemDragEnd(event: DragEndEvent) {
    if (!dispatch) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = section.items.findIndex((i) => i.id === active.id)
    const newIdx = section.items.findIndex((i) => i.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(
      section.items.map((i) => i.id),
      oldIdx,
      newIdx
    )
    dispatch({ type: 'REORDER_ITEMS', sectionId: section.id, itemIds: reordered })
  }

  return (
    <div className={pageView ? 'group/section' : undefined}>
      {/* Section header bar */}
      <div
        data-page-block-id={`${section.id}-header`}
        className={`flex items-center gap-2 ${SECTION_PX} py-2 group/header`}
        style={{ backgroundColor: brandColor }}
      >
        {isEditable && (
          <span
            className="cursor-grab text-white/40 group-hover/header:text-white/70 flex-shrink-0 transition-colors"
            {...dragHandleProps}
          >
            <GripVertical className="h-4 w-4" />
          </span>
        )}

        {isEditable && dispatch ? (
          <input
            value={section.title}
            onChange={(e) =>
              dispatch({
                type: 'UPDATE_SECTION_TITLE',
                sectionId: section.id,
                title: e.target.value,
              })
            }
            style={{ color: brandOnFill }}
            className="flex-1 bg-transparent font-semibold text-base tracking-wide focus:outline-none placeholder:text-white/50 focus:bg-white/10 rounded px-1 min-w-0"
          />
        ) : (
          <span className="flex-1 font-semibold text-base tracking-wide select-none" style={{ color: brandOnFill }}>{section.title}</span>
        )}

        {isEditable && dispatch && (
          <button
            onClick={() =>
              dispatch({ type: 'REMOVE_SECTION', sectionId: section.id })
            }
            className="text-white/40 hover:text-white opacity-0 group-hover/header:opacity-100 transition-all flex-shrink-0 p-1"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Mobile: stacked cards */}
      <div className="sm:hidden">
        {section.items.map((item) =>
          isEditable && dispatch ? (
            <ItemCardMobile
              key={item.id}
              item={item as unknown as EditorItem}
              onUpdate={(field, value) =>
                dispatch({
                  type: 'UPDATE_ITEM',
                  sectionId: section.id,
                  itemId: item.id,
                  field,
                  value,
                })
              }
              onRemove={() =>
                dispatch({ type: 'REMOVE_ITEM', sectionId: section.id, itemId: item.id })
              }
              isReadOnly={false}
              currencyCode={currencyCode}
              unitOptions={resolveUnitOptions(lang, item.unit ?? null)}
            />
          ) : (
            <div
              key={item.id}
              className={`${SECTION_PX} py-2.5 mx-4 my-1.5 rounded-lg border border-border/40`}
            >
              <p className="text-base font-medium">{item.description}</p>
              <div className="flex justify-between text-sm text-muted-foreground mt-0.5">
                <span>
                  {item.quantity} {item.unit ? item.unit : ''} ×{' '}
                  {formatMoney(item.unit_price, currencyCode)}
                </span>
                <span className="font-medium text-foreground tabular-nums">
                  {formatMoney(item.total, currencyCode)}
                </span>
              </div>
            </div>
          )
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden sm:block overflow-x-auto">
        {isEditable && dispatch ? (
          <DndContext
            id={itemDndId}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleItemDragEnd}
          >
            <SortableContext
              items={section.items.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50 text-sm text-muted-foreground border-b border-border/50 select-none">
                    <th className="py-1.5 px-1 w-6" />
                    <th className="py-1.5 px-2 text-left font-medium">{L.description}</th>
                    <th className="py-1.5 px-2 w-16 text-center font-medium">{L.qty}</th>
                    <th className="py-1.5 px-2 w-16 text-center font-medium">{L.unit}</th>
                    <th className="py-1.5 px-2 w-28 text-right font-medium">{L.unitPrice}</th>
                    {/* 260728 rework — Disc./Tax are editor metadata, not PDF columns;
                        the paginated sheet hides them (rows do the same below). */}
                    {!pageView && <th className="py-1.5 px-2 w-20 text-right font-medium">{L.lineDiscount}</th>}
                    {!pageView && <th className="py-1.5 px-2 w-12 text-center font-medium">{L.taxable}</th>}
                    <th className="py-1.5 px-2 w-28 text-right font-medium">{L.total}</th>
                    <th className="py-1.5 px-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item) => (
                    <SortableDocumentItemRow
                      key={item.id}
                      item={item}
                      sectionId={section.id}
                      dispatch={dispatch}
                      currencyCode={currencyCode}
                      lang={lang}
                      priceBookItems={priceBookItems}
                      L={L}
                      pageView={pageView}
                    />
                  ))}
                </tbody>
              </table>
            </SortableContext>
          </DndContext>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50 text-xs text-muted-foreground border-b border-border/50">
                <th className="py-1.5 px-3 text-left font-medium w-[40%]">{L.description}</th>
                <th className="py-1.5 px-2 w-[12%] text-center font-medium">{L.qty}</th>
                <th className="py-1.5 px-2 w-[13%] text-center font-medium">{L.unit}</th>
                <th className="py-1.5 px-2 w-[17%] text-right font-medium">{L.unitPrice}</th>
                <th className="py-1.5 px-3 w-[18%] text-right font-medium">{L.total}</th>
              </tr>
            </thead>
            <tbody>
              {section.items.map((item, idx) => (
                <tr
                  key={item.id}
                  className={`border-b border-border/50 last:border-0 ${idx % 2 === 1 ? 'bg-muted/40' : ''}`}
                >
                  <td className="py-2 px-3 text-base">{item.description}</td>
                  <td className="py-2 px-2 text-base text-center tabular-nums">{item.quantity}</td>
                  <td className="py-2 px-2 text-base text-center">{item.unit ?? ''}</td>
                  <td className="py-2 px-2 text-base text-right tabular-nums">
                    {formatMoney(item.unit_price, currencyCode)}
                  </td>
                  <td className="py-2 px-3 text-base text-right tabular-nums font-medium">
                    {formatMoney(item.total, currencyCode)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add item — edit mode only, placed right after the last item.
          pageView: invisible at rest (not part of the PDF page), revealed on
          section hover/focus — opacity keeps its layout space so revealing it
          never reflows the page. */}
      {isEditable && dispatch && (
        <div
          className={`${SECTION_PX} py-1.5 border-t border-dashed border-border/50 ${
            pageView ? 'opacity-0 group-hover/section:opacity-100 focus-within:opacity-100 transition-opacity' : ''
          }`}
        >
          <button
            onClick={() => dispatch({ type: 'ADD_ITEM', sectionId: section.id })}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors select-none"
          >
            <Plus className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
            {L.addItem}
          </button>
        </div>
      )}

      {/* Section subtotal */}
      <div
        data-page-block-id={`${section.id}-subtotal`}
        className={`flex justify-end items-center gap-3 ${SECTION_PX} py-2 border-t border-border/50 bg-muted/10`}
      >
        <span className="text-sm text-muted-foreground select-none">{L.sectionSubtotal}</span>
        <span className="text-sm font-semibold tabular-nums">
          {formatMoney(section.subtotal, currencyCode)}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SortableDocumentSection — wraps DocumentSectionBlock with dnd-kit sortable
// ---------------------------------------------------------------------------

function SortableDocumentSection({
  section,
  dispatch,
  isEditable,
  brandColor,
  brandOnFill,
  currencyCode,
  L,
  lang,
  priceBookItems,
  pageView = false,
}: {
  section: DocumentSection
  dispatch: React.Dispatch<EstimateAction>
  isEditable: boolean
  brandColor: string
  brandOnFill: string
  currencyCode: string
  L: DocLabels
  lang: EstimateLanguage
  priceBookItems: PriceBookItem[]
  pageView?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <DocumentSectionBlock
        section={section}
        dispatch={dispatch}
        isEditable={isEditable}
        brandColor={brandColor}
        brandOnFill={brandOnFill}
        currencyCode={currencyCode}
        L={L}
        lang={lang}
        dragHandleProps={listeners}
        priceBookItems={priceBookItems}
        pageView={pageView}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// DocumentTotals
// ---------------------------------------------------------------------------

function DocumentTotals({
  data,
  dispatch,
  isEditable,
  brandText,
  L,
  defaultTaxRate,
}: {
  data: EstimateDocumentData
  dispatch?: React.Dispatch<EstimateAction>
  isEditable: boolean
  brandText: string
  L: DocLabels
  /** R4 — company default tax rate (fraction); undefined when no default applies. */
  defaultTaxRate?: number
}) {
  const fmt = (v: number) => formatMoney(v, data.currency_code)
  const taxPercent = Math.round(data.tax_rate * 10000) / 100
  const hasTaxDefault = defaultTaxRate !== undefined
  // Compare at 4-decimal precision (DB stores NUMERIC(5,4)) to avoid float noise.
  const isTaxOverridden =
    Math.round(data.tax_rate * 10000) !== Math.round((defaultTaxRate ?? 0) * 10000)
  const discountTypeVal = data.discount_type ?? 'none'
  const depositTypeVal = data.deposit_type ?? 'none'
  // PUI-02 (GUARD-03): view-mode deposit/balance-due READ the persisted server row
  // (total, balance_due, deposit_type) through the shared seam — never recompute.
  const dep = deriveDepositDisplay({
    total: data.total,
    deposit_type: data.deposit_type ?? 'none',
    deposit_value: data.deposit_value,
    balance_due: data.balance_due,
  })

  return (
    <div data-page-block-id="totals" className="flex justify-end px-6 sm:px-10 py-6 border-t border-border/50">
      <div className="w-full max-w-xs space-y-2">
        {/* Subtotal */}
        <div className="flex justify-between text-base">
          <span className="text-muted-foreground select-none">{L.subtotal}</span>
          <span className="tabular-nums font-medium">{fmt(data.subtotal)}</span>
        </div>

        {/* Discount */}
        {isEditable && dispatch ? (
          <div className="flex items-center justify-between gap-2 text-base">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-muted-foreground whitespace-nowrap shrink-0 select-none">{L.discount}</span>
              <Select
                value={discountTypeVal}
                onValueChange={(val) => {
                  const type = val === 'none' ? null : val
                  dispatch({
                    type: 'UPDATE_DISCOUNT',
                    discount_type: type,
                    discount_value: type ? data.discount_value : 0,
                  })
                }}
              >
                <SelectTrigger className="h-7 text-xs w-[90px] shrink-0 border-zinc-300 focus:ring-zinc-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{L.discountNone}</SelectItem>
                  <SelectItem value="percentage">{L.discountPct}</SelectItem>
                  <SelectItem value="fixed">{L.discountFixed}</SelectItem>
                </SelectContent>
              </Select>
              {data.discount_type && (
                data.discount_type === 'fixed' ? (
                  <MoneyInput
                    value={data.discount_value}
                    currencyCode={data.currency_code}
                    onValueChange={(value) =>
                      dispatch({
                        type: 'UPDATE_DISCOUNT',
                        discount_type: data.discount_type,
                        discount_value: value,
                      })
                    }
                    className="h-7 w-20 text-xs"
                  />
                ) : (
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={data.discount_value}
                      onChange={(e) =>
                        dispatch({
                          type: 'UPDATE_DISCOUNT',
                          discount_type: data.discount_type,
                          discount_value: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="h-7 w-16 text-right text-xs bg-muted/30 rounded px-1 pr-4 focus:outline-none focus:ring-1 focus:ring-primary/30"
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      %
                    </span>
                  </div>
                )
              )}
            </div>
            {data.discount_amount > 0 && (
              <span className="tabular-nums text-destructive font-medium shrink-0">
                -{fmt(data.discount_amount)}
              </span>
            )}
          </div>
        ) : data.discount_amount > 0 ? (
          <div className="flex justify-between text-base">
            <span className="text-muted-foreground select-none">
              {L.discount}
              {isPercentageDiscount(data.discount_type) ? ` (${data.discount_value}%)` : ''}
            </span>
            <span className="tabular-nums text-destructive font-medium">
              -{fmt(data.discount_amount)}
            </span>
          </div>
        ) : null}

        {/* Tax */}
        {isEditable && dispatch ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-base">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground shrink-0 select-none">{L.tax}</span>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={taxPercent}
                    onChange={(e) => {
                      const pct = parseFloat(e.target.value) || 0
                      dispatch({ type: 'UPDATE_TAX_RATE', tax_rate: pct / 100 })
                    }}
                    className="h-7 w-16 text-right text-xs bg-muted/30 rounded px-1 pr-4 focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
              <span className="tabular-nums font-medium">{fmt(data.tax_amount)}</span>
            </div>
            {hasTaxDefault && (
              <div className="flex justify-start">
                <DefaultStateIndicator
                  isOverridden={isTaxOverridden}
                  onReset={() =>
                    dispatch({ type: 'UPDATE_TAX_RATE', tax_rate: defaultTaxRate ?? 0 })
                  }
                  L={L}
                />
              </div>
            )}
          </div>
        ) : data.tax_amount > 0 ? (
          <div className="flex justify-between text-base">
            <span className="text-muted-foreground select-none">
              {L.tax} ({(data.tax_rate * 100).toFixed(2)}%)
            </span>
            <span className="tabular-nums font-medium">{fmt(data.tax_amount)}</span>
          </div>
        ) : null}

        {/* Grand total */}
        <div
          className="flex justify-between items-baseline pt-3 border-t-2"
          style={{ borderTopColor: brandText }}
        >
          <span className="text-3xl font-extrabold select-none">{L.grandTotal}</span>
          <span className="text-3xl font-extrabold tabular-nums" style={{ color: brandText }}>
            {fmt(data.total)}
          </span>
        </div>

        {/* Deposit — none/percent/amount. Preview only; server recomputes on save (GUARD-03). */}
        {isEditable && dispatch ? (
          <div className="flex items-center justify-between gap-2 text-base pt-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-muted-foreground whitespace-nowrap shrink-0 select-none">{L.deposit}</span>
              <Select
                value={depositTypeVal}
                onValueChange={(val) =>
                  dispatch({
                    type: 'UPDATE_DEPOSIT',
                    deposit_type: val,
                    deposit_value: val === 'none' ? null : (data.deposit_value ?? 0),
                  })
                }
              >
                <SelectTrigger className="h-9 text-xs w-[90px] shrink-0 border-zinc-300 focus:ring-zinc-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{L.depositNone}</SelectItem>
                  <SelectItem value="percent">{L.depositPct}</SelectItem>
                  <SelectItem value="amount">{L.depositAmount}</SelectItem>
                </SelectContent>
              </Select>
              {depositTypeVal !== 'none' && (
                depositTypeVal === 'amount' ? (
                  <MoneyInput
                    value={data.deposit_value ?? 0}
                    currencyCode={data.currency_code}
                    onValueChange={(value) =>
                      dispatch({
                        type: 'UPDATE_DEPOSIT',
                        deposit_type: 'amount',
                        deposit_value: value,
                      })
                    }
                    className="h-9 w-20 text-xs"
                  />
                ) : (
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="numeric"
                      step="0.01"
                      min="0"
                      value={data.deposit_value ?? 0}
                      onChange={(e) =>
                        dispatch({
                          type: 'UPDATE_DEPOSIT',
                          deposit_type: 'percent',
                          deposit_value: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="h-9 w-16 text-right text-xs bg-muted/30 rounded px-1 pr-4 focus:outline-none focus:ring-1 focus:ring-primary/30"
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      %
                    </span>
                  </div>
                )
              )}
            </div>
            {data.deposit > 0 && (
              <span className="tabular-nums text-muted-foreground font-medium shrink-0">
                -{fmt(data.deposit)}
              </span>
            )}
          </div>
        ) : dep.showDeposit ? (
          /* VIEW-MODE deposit row (PUI-02) — persisted-read, never recompute. */
          <div className="flex justify-between text-base pt-2">
            <span className="text-muted-foreground select-none">{L.deposit}</span>
            <span className="tabular-nums text-muted-foreground font-medium">-{fmt(dep.depositAmount)}</span>
          </div>
        ) : null}

        {/* Balance Due — only when a deposit is set (edit: type !== none; view: persisted deposit via deriveDepositDisplay). */}
        {(isEditable && dispatch ? depositTypeVal !== 'none' : dep.showDeposit) && (
          <div className="flex justify-between items-baseline">
            <span className="text-base font-semibold text-muted-foreground select-none">{L.balanceDue}</span>
            <span className="text-base font-semibold tabular-nums">
              {fmt(isEditable && dispatch ? data.balance_due : dep.balanceDue)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DefaultStateIndicator — R4: shows whether an inherited field still matches
// the company default ("Default") or has been customized ("Customized" + a
// one-click reset). Only meaningful in edit mode, and only when a company
// default is known for the field.
// ---------------------------------------------------------------------------

function DefaultStateIndicator({
  isOverridden,
  onReset,
  L,
}: {
  isOverridden: boolean
  onReset: () => void
  L: DocLabels
}) {
  if (!isOverridden) {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground select-none">
        {L.usingDefault}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 select-none dark:bg-amber-500/15 dark:text-amber-400">
        {L.customized}
      </span>
      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <RotateCcw className="size-3" />
        {L.resetToDefault}
      </button>
    </span>
  )
}

// ---------------------------------------------------------------------------
// TermsBlock — a single labeled text block (view or inline edit)
// ---------------------------------------------------------------------------

function TermsBlock({
  label,
  value,
  field,
  dispatch,
  isEditable,
  autoFocus = false,
  defaultValue,
  L,
  hideChrome = false,
}: {
  label: string
  value: string | null
  field: 'notes' | 'timeline' | 'payment_terms' | 'warranty_terms'
  /** 260728 rework — pageView hides the Default/Customized editor chrome at
   *  rest (not part of the customer document), revealing it on hover/focus. */
  hideChrome?: boolean
  dispatch?: React.Dispatch<EstimateAction>
  isEditable: boolean
  autoFocus?: boolean
  /** R4 — company default for this field; undefined when no default applies. */
  defaultValue?: string | null
  L: DocLabels
}) {
  if (!isEditable && !value) return null

  const hasDefault = defaultValue !== undefined
  const isOverridden = (value ?? '').trim() !== (defaultValue ?? '').trim()

  return (
    <div className={hideChrome ? 'group/terms' : undefined}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground select-none">
          {label}
        </p>
        {isEditable && hasDefault && dispatch ? (
          <span className={hideChrome ? 'opacity-0 group-hover/terms:opacity-100 focus-within:opacity-100 transition-opacity' : undefined}>
          <DefaultStateIndicator
            isOverridden={isOverridden}
            onReset={() =>
              dispatch({ type: 'UPDATE_FIELD', field, value: defaultValue || null })
            }
            L={L}
          />
          </span>
        ) : null}
      </div>
      {isEditable && dispatch ? (
        <textarea
          value={value ?? ''}
          onChange={(e) =>
            dispatch({ type: 'UPDATE_FIELD', field, value: e.target.value || null })
          }
          rows={2}
          autoFocus={autoFocus}
          className={INLINE_TEXTAREA_CLS}
        />
      ) : (
        <p className="text-base text-muted-foreground whitespace-pre-line leading-relaxed">
          {value}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Phase 162-02 (DOCUX-03): the inline "no client linked" popover implementation
// that used to live here is gone — the consolidated ClientPicker
// (`components/clients/client-picker.tsx`) covers the inline variant via
// `variant="inline"`, and the DOCUX-03 grep gate enforces that nothing
// references the retired symbols.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// InlineProjectName — click-to-edit project name inside document
// ---------------------------------------------------------------------------

// Phase 162-03 (DOCUX-04) — reconciled with ProjectTitle's validation contract:
//   - empty draft → toast.error + stay editing (no server call)
//   - >200 char draft → toast.error + stay editing (no server call)
//   - no-op (trimmed === name) → close editing, no server call
//   - server error (onRename rejects) → revert draft to name, KEEP edit mode
//     open so user can retry. InlineProjectName does NOT re-toast — the
//     caller (handleRenameProject in estimate-editor.tsx) owns the single
//     user-visible error surface.
//   - Escape cancels + reverts draft
//   - autofocus + select-all on enter-edit
//   - maxLength=200 + aria-label="Project name"
//   - double-submit guard when isPending
// Underline is a thin solid border-b (transparent by default,
// foreground/40 on hover/focus-visible) — replaces the previous
// dotted hover-underline affordance.
// Exported so tests can render it in isolation.
export function InlineProjectName({
  name,
  onRename,
}: {
  name: string
  onRename: (v: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function enterEdit() {
    setDraft(name)
    setEditing(true)
  }

  function handleCancel() {
    setEditing(false)
    setDraft(name)
  }

  function handleSubmit() {
    // Double-submit guard (mirrors ProjectTitle L45)
    if (isPending) return

    const trimmed = draft.trim()

    // No-op if unchanged (mirrors ProjectTitle L48-53)
    if (trimmed === name) {
      setEditing(false)
      return
    }

    // Empty validation (mirrors ProjectTitle L56-59)
    if (trimmed.length === 0) {
      toast.error(t('Project name is required'))
      return
    }
    // 200-char limit (mirrors ProjectTitle L60-63)
    if (trimmed.length > 200) {
      toast.error(t('Name must be 200 characters or less'))
      return
    }

    startTransition(async () => {
      try {
        await onRename(trimmed)
        setEditing(false)
      } catch {
        // Error retry: revert draft, KEEP editing open so user can retry
        // (mirrors ProjectTitle L67-72 semantics). onRename's caller
        // (handleRenameProject in estimate-editor.tsx) surfaces the toast
        // — single-toast rule; InlineProjectName's catch only reverts.
        setDraft(name)
      }
    })
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleSubmit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            handleCancel()
          }
        }}
        onBlur={handleSubmit}
        disabled={isPending}
        maxLength={200}
        aria-label={t('Project name')}
        className="text-2xl font-bold bg-transparent border-b border-primary focus:outline-none w-full disabled:opacity-60"
      />
    )
  }

  return (
    <p
      className="text-2xl font-bold cursor-pointer transition-colors border-b border-transparent hover:border-foreground/40 focus-visible:border-foreground/40 outline-none"
      tabIndex={0}
      onClick={enterEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          enterEdit()
        }
      }}
    >
      {name}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Phase 162-04 (DOCUX-01, PITFALLS.md #1 + #8) — the legacy Add-Details
// popover component and the local ephemeral visibility mechanism were
// retired atomically here. Section visibility is now driven end-to-end by
// the gear-panel-persisted overrides on presentation_settings.sections,
// resolved via the Phase 161 pure resolver
// (resolvePresentationSettings + isSectionVisible).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AttachedPhotoThumb — static (non-drag-sort) thumbnail for the attached-
// photos strip. Uses photo.url directly if pre-resolved (view/share mode);
// otherwise resolves a signed URL client-side (edit mode), mirroring the
// exact call PhotoCard already makes today.
// ---------------------------------------------------------------------------

function AttachedPhotoThumb({
  photo,
  onRemove,
}: {
  photo: DocumentPhoto
  onRemove?: () => void
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(photo.url ?? null)

  useEffect(() => {
    if (photo.url) {
      setImageUrl(photo.url)
      return
    }
    const supabase = createClient()
    createStorage(supabase)
      .getSignedUrl('photos', photo.storage_path, 3600)
      .then((signedUrl) => {
        setImageUrl(signedUrl)
      })
      .catch(() => {
        // signed URL failed — leave skeleton in place
      })
  }, [photo.url, photo.storage_path])

  return (
    <div>
      <div className="aspect-square overflow-hidden rounded-lg relative group ring-1 ring-border/50">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={photo.caption ?? ''}
            className="object-cover w-full h-full"
          />
        ) : (
          <Skeleton className="w-full h-full" />
        )}
        {onRemove && (
          <button
            onClick={onRemove}
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90"
            aria-label="Remove photo"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {photo.caption && (
        <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{photo.caption}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// EstimateDocument — main export
// ---------------------------------------------------------------------------

export function EstimateDocument({
  mode,
  data,
  company,
  brandColor: brandColorProp,
  companyDefaults,
  client,
  projectName,
  projectType,
  language,
  estimateVersion,
  estimateSeq,
  estimateCreatedAt,
  dispatch,
  isReadOnly = false,
  projectId,
  onRenameProject,
  priceBookItems = [],
  onDetachPhoto,
  pageView = false,
  preparedBy,
  companyTerms,
}: EstimateDocumentProps) {
  const lang = (language ?? 'en') as EstimateLanguage
  const L = DOC_LABELS[lang] ?? DOC_LABELS.en
  const brandColor = brandColorProp ?? company?.brand_primary_color ?? SYSTEM_COLORS.primary
  // Render-time WCAG adaptation (stored brand color never mutated):
  const brandText = ensureReadableOnWhite(brandColor) // brand color as text on white
  const brandOnFill = readableTextColor(brandColor) // fixed foreground over a brand fill
  const isEditable = mode === 'edit' && !isReadOnly

  // Phase 162-04 (DOCUX-01) — section visibility is now driven by the
  // presentation_settings JSONB (persisted via the gear panel), resolved
  // through the Phase 161 pure resolver. Non-destructive: hiding a section
  // via the panel leaves data[field] intact so re-showing restores content.
  const resolvedSettings = resolvePresentationSettings(data.presentation_settings)

  // Default displayed estimate number: zero-padded per-company sequence when available,
  // otherwise falls back to the per-project version (legacy behavior).
  const defaultEstimateNumber =
    estimateSeq && estimateSeq > 0
      ? String(estimateSeq).padStart(4, '0')
      : String(estimateVersion)

  // View/PDF: skip items with empty descriptions and sections that end up empty.
  // SENDHUB-04 (Phase 163): close the Phase 162 gap — gate the line-items block on
  // the resolver's 'sections' toggle. WRAP the existing empty-item filter (do NOT
  // replace it — editor-mode content-nullability preservation still lives here).
  // The isEditable branch stays unwrapped because Phase 162 established that
  // hiding sections in the editor makes the toggle unusable; only VIEW-mode
  // (share page + PDF) applies the resolver gate.
  const visibleSections = isEditable
    ? data.sections
    : isSectionVisible(resolvedSettings, 'sections')
      ? data.sections
          .map((s) => ({ ...s, items: s.items.filter((i) => i.description.trim() !== '') }))
          .filter((s) => s.items.length > 0)
      : []

  const sectionSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  function handleSectionDragEnd(event: DragEndEvent) {
    if (!dispatch) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = data.sections.findIndex((s) => s.id === active.id)
    const newIdx = data.sections.findIndex((s) => s.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(
      data.sections.map((s) => s.id),
      oldIdx,
      newIdx
    )
    dispatch({ type: 'REORDER_SECTIONS', sectionIds: reordered })
  }

  const companyAddr = company ? formatAddress(company) : null
  const clientAddr = client ? formatAddress(client) : null
  // hasTerms wraps the terms container; each individual TermsBlock also
  // gates on `(isEditable || data[field] != null)` below. In view mode with
  // all null terms this still evaluates true iff at least one has content,
  // which prevents an empty bordered wrapper from rendering.
  const isTermVisible = (field: 'payment_terms' | 'timeline' | 'warranty_terms' | 'notes') =>
    isSectionVisible(resolvedSettings, field) &&
    (isEditable || data[field] != null)
  // Phase 185 (PGMODE-02/03) — a company with ONLY estimate-terms enabled
  // (all 4 other terms fields empty) must still render the wrapping
  // container, so this is a 5th OR-branch alongside the 4 existing checks.
  const hasCompanyTerms = !!(companyTerms?.enabled && companyTerms.text)
  const hasTerms =
    hasCompanyTerms ||
    isTermVisible('payment_terms') ||
    isTermVisible('timeline') ||
    isTermVisible('warranty_terms') ||
    isTermVisible('notes')

  return (
    <div
      // 260728 rework — in pageView the PaginatedDocumentOverlay's decorative
      // sheets ARE the paper (white fill, hairline edge, shadow). The content
      // layer renders chrome-free and TRANSPARENT on top of them, so the
      // inter-page gaps show the canvas instead of one continuous white strip,
      // and overflow stays visible for hover affordances near page edges.
      className={pageView ? '' : 'rounded-3xl border-4 shadow-lg overflow-hidden'}
      style={{
        ...(pageView ? {} : { backgroundColor: '#ffffff' }),
        colorScheme: 'light',
        '--foreground': '240 10% 3.9%',
        '--muted-foreground': '240 3.8% 46.1%',
        '--muted': '240 4.8% 95.9%',
        '--border': '240 5.9% 90%',
        '--card': '0 0% 100%',
        '--card-foreground': '240 10% 3.9%',
        // The document forces a light "paper" surface. The glass tokens must be
        // overridden too, otherwise glass cards nested in the paper (e.g. the
        // mobile ItemCardMobile) inherit the app's DARK glass fill and render as
        // dark-grey slabs with near-invisible labels on white. Pin them light.
        '--glass-bg': 'rgba(255, 255, 255, 0.65)',
        '--glass-bg-strong': 'rgba(255, 255, 255, 0.97)',
        '--glass-border': 'rgba(15, 23, 42, 0.08)',
        color: 'hsl(240 10% 3.9%)',
        ...(pageView ? {} : { borderColor: '#3f3f46' }),
      } as React.CSSProperties}
    >
      {/* Company header — only when company provided (share/view mode + editor) */}
      {company && (
        <div
          className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 p-4 sm:p-6 border-b border-border"
          // 260728 rework — the 3px brand top-rule belongs to the full-width
          // card chrome; on a paginated sheet it read as a stray line floating
          // at the paper's top edge (the sheet itself is the page boundary).
          style={pageView ? undefined : { borderTopWidth: 3, borderTopStyle: 'solid', borderTopColor: brandColor }}
        >
          {/* LEFT — company info (Quick-260526-jo4) */}
          <div className="min-w-0">
            <p className="font-bold text-lg leading-tight" style={{ color: brandText }}>
              {company.name}
            </p>
            {company.owner_name && (
              <p className="text-xs text-muted-foreground mt-0.5">{company.owner_name}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              {[
                company.phone && formatPhoneForDisplay(company.phone),
                company.email,
                company.website,
              ]
                .filter(Boolean)
                .join('  ·  ')}
            </p>
            {companyAddr && (
              <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">
                {companyAddr}
              </p>
            )}
          </div>

          {/* RIGHT — logo (Quick-260526-jo4) */}
          {company.logo_url && (
            <div className="flex-shrink-0">
              {/* Phase 190 (URL-03/W2): skip /_next/image — same rationale as
                  components/share/estimate-document-modern.tsx. The logo is now
                  a same-origin /storage/logos/... path whose proxy response is
                  already correctly cached (max-age=300, stale-while-revalidate);
                  the optimizer's 31-day minimumCacheTTL would pin a stale logo,
                  and the editor is where a just-uploaded logo must appear. */}
              <Image
                src={company.logo_url}
                alt={company.name}
                width={64}
                height={64}
                className="rounded object-contain"
                unoptimized
              />
            </div>
          )}
        </div>
      )}

      {/* ESTIMATE title */}
      <div
        className="py-6 px-6 sm:px-10 text-center"
        style={{ backgroundColor: brandColor }}
      >
        <h1
          className="text-3xl sm:text-4xl font-bold tracking-widest select-none"
          style={{ color: brandOnFill }}
        >
          {L.estimate}
        </h1>
      </div>

      {/* Info grid: PROJECT | BILL TO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 px-6 sm:px-10 py-6 sm:py-8 border-b border-border/50">
        {/* PROJECT */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 select-none">
            {L.project}
          </p>
          {isEditable && onRenameProject ? (
            <InlineProjectName name={projectName} onRename={onRenameProject} />
          ) : (
            <p className="text-2xl font-bold">{projectName}</p>
          )}
          {projectType && (
            <p className="text-base text-muted-foreground mt-2 capitalize">
              {projectType.replace(/_/g, ' ')}
            </p>
          )}
          {isEditable && dispatch ? (
            <div className="mt-3 flex items-center gap-1.5 text-base text-muted-foreground">
              <span className="shrink-0 select-none">{L.date}:</span>
              <DatePopover
                value={data.estimate_date ?? estimateCreatedAt.slice(0, 10)}
                lang={lang}
                onChange={(v) =>
                  dispatch({ type: 'UPDATE_FIELD', field: 'estimate_date', value: v })
                }
              />
            </div>
          ) : (
            <p className="text-base text-muted-foreground mt-3">
              {L.date}: {formatDate(data.estimate_date ?? estimateCreatedAt, lang)}
            </p>
          )}
          {isEditable && dispatch ? (
            <div className="mt-2 flex items-center gap-1 text-base text-muted-foreground">
              <span className="shrink-0 select-none">{L.estimateNum}</span>
              <input
                value={data.estimate_number ?? defaultEstimateNumber}
                onChange={(e) =>
                  dispatch({ type: 'UPDATE_FIELD', field: 'estimate_number', value: e.target.value || null })
                }
                className="bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none text-base w-28 tabular-nums"
              />
            </div>
          ) : (
            <p className="text-base text-muted-foreground mt-2 tabular-nums">
              {L.estimateNum}{data.estimate_number ?? defaultEstimateNumber}
            </p>
          )}
        </div>

        {/* BILL TO — only renders when client is linked.
            Phase 162-03 (DOCUX-02): `group` wrapper enables the pencil
            affordance's `group-hover:opacity-100` reveal. The pencil
            renders via the ClientPicker component's billTo variant (the consolidated
            picker from Phase 162-02, edit-mode-only + projectId-guarded
            so mode="view" (share page) never sees an edit affordance. */}
        {client && (
          <div className="group">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground select-none">
                {L.billTo}
              </p>
              {isEditable && projectId && (
                <ClientPicker
                  projectId={projectId}
                  currentClientId={client.id ?? null}
                  variant="billTo"
                  align="end"
                />
              )}
            </div>
            <div className="space-y-0.5">
              <p className="text-2xl font-bold">{client.name}</p>
              {client.email && (
                <p className="text-base text-muted-foreground mt-1">{client.email}</p>
              )}
              {client.phone && (
                <p className="text-base text-muted-foreground">
                  {formatPhoneForDisplay(client.phone)}
                </p>
              )}
              {clientAddr && (
                <p className="text-base text-muted-foreground whitespace-pre-line">{clientAddr}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Summary — visibility driven by presentation_settings.sections.summary.
          View mode additionally auto-suppresses empty content (preserves the
          pre-Phase-162 share-page behavior for legacy estimates whose
          presentation_settings is null → resolver returns all visible). Edit
          mode always renders when visible so the owner can type into it. */}
      {isSectionVisible(resolvedSettings, 'summary') &&
        (isEditable || data.summary != null) && (
        <div className="px-6 sm:px-10 py-4 border-b border-border/50">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 select-none">
            {L.summary}
          </p>
          {isEditable && dispatch ? (
            <textarea
              value={data.summary ?? ''}
              onChange={(e) =>
                dispatch({
                  type: 'UPDATE_FIELD',
                  field: 'summary',
                  value: e.target.value || null,
                })
              }
              rows={3}
              autoFocus={false}
              className={INLINE_TEXTAREA_CLS}
            />
          ) : (
            <p className="text-base text-muted-foreground whitespace-pre-line leading-relaxed">
              {data.summary}
            </p>
          )}
        </div>
      )}

      {/* Sections */}
      <div className="divide-y divide-border">
        {isEditable && dispatch ? (
          <DndContext
            id="dnd-sections"
            sensors={sectionSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSectionDragEnd}
          >
            <SortableContext
              items={data.sections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {data.sections.map((section) => (
                <SortableDocumentSection
                  key={section.id}
                  section={section}
                  dispatch={dispatch}
                  isEditable={isEditable}
                  brandColor={brandColor}
                  brandOnFill={brandOnFill}
                  currencyCode={data.currency_code}
                  L={L}
                  lang={lang}
                  priceBookItems={priceBookItems}
                  pageView={pageView}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          visibleSections.map((section) => (
            <DocumentSectionBlock
              key={section.id}
              section={section}
              isEditable={false}
              brandColor={brandColor}
              brandOnFill={brandOnFill}
              currencyCode={data.currency_code}
              L={L}
              lang={lang}
            />
          ))
        )}
      </div>

      {/* Add section / details — edit mode only */}
      {isEditable && dispatch && (
        <div className="px-6 sm:px-10 py-3 border-t border-dashed border-border/50 flex items-center gap-2">
          <button
            onClick={() => dispatch({ type: 'ADD_SECTION' })}
            className="text-sm font-medium flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors select-none"
            style={{
              color: brandText,
              backgroundColor: `${brandColor}1A`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = `${brandColor}33`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = `${brandColor}1A`
            }}
          >
            <Plus className="h-4 w-4" />
            {L.addSection}
          </button>
          {/* Phase 162-04 (DOCUX-01) — the Add-details popover trigger is
              gone; section show/hide is now the gear panel's Document
              Sections toggles (presentation_settings.sections via
              resolvePresentationSettings). Non-destructive: hiding a
              section leaves data[field] intact for a later un-hide. */}
        </div>
      )}

      {/* Totals */}
      <DocumentTotals
        data={data}
        dispatch={dispatch}
        isEditable={isEditable}
        brandText={brandText}
        L={L}
        defaultTaxRate={companyDefaults?.tax_rate}
      />

      {/* Terms — visibility driven by presentation_settings.sections. View mode
          additionally auto-suppresses null content (byte-identical to today
          for legacy estimates). Edit mode always renders visible sections
          so the owner has a textarea to type into. */}
      {hasTerms && (
        <div className="px-6 sm:px-10 py-6 border-t border-border/50 space-y-4">
          {/* Phase 185 (PGMODE-02/03) — company-level "Estimate Terms" card,
              read-only (no dispatch — company-level data, not editable
              through this surface). Rendered FIRST, matching the PDF's
              content order (estimate-terms -> payment/timeline/warranty/
              notes). Absent when companyTerms is omitted (share webview). */}
          {hasCompanyTerms && (
            <div
              data-page-block-id="terms-estimate"
              className="rounded-lg border border-border/50 p-4"
              style={{ backgroundColor: cardTintFill(brandColor) }}
            >
              <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground select-none mb-1.5">
                {L.estimateTerms}
              </p>
              <p className="text-base text-muted-foreground whitespace-pre-line leading-relaxed">
                {companyTerms!.text}
              </p>
            </div>
          )}
          {isSectionVisible(resolvedSettings, 'payment_terms') &&
            (isEditable || data.payment_terms != null) && (
            <div
              data-page-block-id="terms-payment"
              className="rounded-lg border border-border/50 p-4"
              style={{ backgroundColor: cardTintFill(brandColor) }}
            >
              <TermsBlock
                hideChrome={pageView}
                label={L.paymentTerms}
                value={data.payment_terms}
                field="payment_terms"
                dispatch={dispatch}
                isEditable={isEditable}
                autoFocus={false}
                defaultValue={companyDefaults?.payment_terms}
                L={L}
              />
            </div>
          )}
          {isSectionVisible(resolvedSettings, 'timeline') &&
            (isEditable || data.timeline != null) && (
            <div
              data-page-block-id="terms-timeline"
              className="rounded-lg border border-border/50 p-4"
              style={{ backgroundColor: cardTintFill(brandColor) }}
            >
              <TermsBlock
                hideChrome={pageView}
                label={L.timeline}
                value={data.timeline}
                field="timeline"
                dispatch={dispatch}
                isEditable={isEditable}
                autoFocus={false}
                L={L}
              />
            </div>
          )}
          {isSectionVisible(resolvedSettings, 'warranty_terms') &&
            (isEditable || data.warranty_terms != null) && (
            <div
              data-page-block-id="terms-warranty"
              className="rounded-lg border border-border/50 p-4"
              style={{ backgroundColor: cardTintFill(brandColor) }}
            >
              <TermsBlock
                hideChrome={pageView}
                label={L.warranty}
                value={data.warranty_terms}
                field="warranty_terms"
                dispatch={dispatch}
                isEditable={isEditable}
                autoFocus={false}
                defaultValue={companyDefaults?.warranty_terms}
                L={L}
              />
            </div>
          )}
          {isSectionVisible(resolvedSettings, 'notes') &&
            (isEditable || data.notes != null) && (
            <div
              data-page-block-id="terms-notes"
              className="rounded-lg border border-border/50 p-4"
              style={{ backgroundColor: cardTintFill(brandColor) }}
            >
              <TermsBlock
                hideChrome={pageView}
                label={L.notes}
                value={data.notes}
                field="notes"
                dispatch={dispatch}
                isEditable={isEditable}
                autoFocus={false}
                L={L}
              />
            </div>
          )}
        </div>
      )}

      {/* Signature — PDFPAR-02, net-new. Data-presence gated only (no
          presentation_settings key exists for it per CONTEXT.md's locked
          rule — Pitfall 3). Position: Terms -> Signature -> Photos. */}
      {data.signature && (
        <div data-page-block-id="signature" className="px-6 sm:px-10 py-6 border-t border-border/50">
          <div
            className="rounded-lg border border-border/50 p-4"
            style={{ backgroundColor: cardTintFill(brandColor) }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 select-none">
              {L.signedBy}
            </p>
            <div className="flex items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.signature.signatureDataUrl}
                alt={L.signedBy}
                className="h-16 w-auto max-w-[240px] object-contain"
              />
              <div>
                <p className="text-base font-semibold">{data.signature.signerName}</p>
                <p className="text-sm text-muted-foreground">{formatDate(data.signature.signedAt, lang)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Attached photos — gated on presentation_settings.sections.photos AND
          non-empty list. Anchor scope note (Phase 185, 185-03-PLAN.md): only
          the FIRST photo-row (photo-row-0) is anchored — per-row internal
          anchors for photo-row-N (N>0, matching blocksFromModel's
          photosPerRow chunking) are out of scope this phase: the editor's
          responsive CSS grid has no equivalent to the PDF's fixed-width row
          chunking, so an estimate whose photos alone span an internal page
          break shows an approximate (not exact) sheet boundary there — a
          documented, accepted gap. */}
      {isSectionVisible(resolvedSettings, 'photos') && data.attachedPhotos && data.attachedPhotos.length > 0 && (
        <div data-page-block-id="photo-row-0" className="px-6 sm:px-10 py-6 border-t border-border/50">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 select-none">
            {L.photos}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {data.attachedPhotos.map((photo) => (
              <AttachedPhotoThumb
                key={photo.id}
                photo={photo}
                onRemove={
                  isEditable && onDetachPhoto
                    ? () => onDetachPhoto(photo.id)
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Prepared-by — Phase 185 (PGMODE-02/03), net-new. Rendered ONLY when
          the caller supplies `preparedBy` (the editor's two call sites do;
          the public share webview passes neither prop and never renders
          this). Position matches the PDF's content order: Terms -> Signature
          -> Photos -> Prepared-by. */}
      {preparedBy && (
        <div data-page-block-id="prepared-by" className="px-6 sm:px-10 py-6 border-t border-border/50">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 select-none">
            {L.preparedBy}
          </p>
          <p className="text-base text-muted-foreground">{preparedBy}</p>
        </div>
      )}
    </div>
  )
}
