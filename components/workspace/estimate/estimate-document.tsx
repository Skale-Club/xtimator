'use client'

import Image from 'next/image'
import { useState, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
import { Check, GripVertical, Plus, RotateCcw, Trash2, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Calendar } from '@/components/ui/calendar'
import { formatMoney } from '@/lib/money/currency'
import { deriveDepositDisplay } from '@/lib/estimate/deposit-display'
import { formatPhoneForDisplay } from '@/lib/phone/format'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { ensureReadableOnWhite, readableTextColor } from '@/lib/color/contrast'
import { linkProjectToClient } from '@/lib/actions/project'
import { ItemCardMobile } from './item-card-mobile'
import { PriceBookCombobox } from './price-book-combobox'
import type { EstimateAction, EditorItem } from './use-estimate-reducer'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import type { PriceBookItem } from '@/lib/queries/price-book'

// ---------------------------------------------------------------------------
// i18n label map (mirrors PDF labels)
// ---------------------------------------------------------------------------

const DOC_LABELS = {
  en: {
    estimate: 'ESTIMATE',
    project: 'Project',
    billTo: 'Bill To',
    summary: 'Summary',
    description: 'Description',
    qty: 'Qty',
    unit: 'Unit',
    unitPrice: 'Unit Price',
    lineDiscount: 'Disc.',
    taxable: 'Tax',
    total: 'Total',
    sectionSubtotal: 'Section Subtotal',
    subtotal: 'Subtotal',
    discount: 'Discount',
    discountNone: 'None',
    discountPct: '% off',
    discountFixed: 'Fixed',
    deposit: 'Deposit',
    depositNone: 'None',
    depositPct: '%',
    depositAmount: 'Amount',
    balanceDue: 'Balance Due',
    tax: 'Tax',
    grandTotal: 'Total',
    paymentTerms: 'Payment Terms',
    timeline: 'Timeline',
    warranty: 'Warranty',
    notes: 'Notes',
    date: 'Date',
    estimateNum: 'Estimate #',
    noClient: 'No client linked',
    addItem: 'Add item',
    addSection: 'Add section',
    addDetails: 'Add details',
    summaryPlaceholder: 'Estimate summary…',
    termsPlaceholder: 'Enter details…',
    searchPriceBook: 'Search price book…',
    noMatches: 'No matches',
    customized: 'Customized',
    usingDefault: 'Default',
    resetToDefault: 'Reset to default',
    photos: 'Photos',
  },
  pt: {
    estimate: 'ORÇAMENTO',
    project: 'Projeto',
    billTo: 'Faturar Para',
    summary: 'Resumo',
    description: 'Descrição',
    qty: 'Qtd',
    unit: 'Unidade',
    unitPrice: 'Preço Unitário',
    lineDiscount: 'Desc.',
    taxable: 'Imposto',
    total: 'Total',
    sectionSubtotal: 'Subtotal da Seção',
    subtotal: 'Subtotal',
    discount: 'Desconto',
    discountNone: 'Nenhum',
    discountPct: '% off',
    discountFixed: 'Fixo',
    deposit: 'Entrada',
    depositNone: 'Nenhum',
    depositPct: '%',
    depositAmount: 'Valor',
    balanceDue: 'Saldo Devedor',
    tax: 'Imposto',
    grandTotal: 'Total',
    paymentTerms: 'Condições de Pagamento',
    timeline: 'Prazo',
    warranty: 'Garantia',
    notes: 'Observações',
    date: 'Data',
    estimateNum: 'Orçamento Nº',
    noClient: 'Nenhum cliente vinculado',
    addItem: 'Adicionar item',
    addSection: 'Adicionar seção',
    addDetails: 'Adicionar detalhes',
    summaryPlaceholder: 'Resumo do orçamento…',
    termsPlaceholder: 'Insira os detalhes…',
    searchPriceBook: 'Buscar no catálogo…',
    noMatches: 'Sem resultados',
    customized: 'Personalizado',
    usingDefault: 'Padrão',
    resetToDefault: 'Restaurar padrão',
    photos: 'Fotos',
  },
  es: {
    estimate: 'PRESUPUESTO',
    project: 'Proyecto',
    billTo: 'Facturar A',
    summary: 'Resumen',
    description: 'Descripción',
    qty: 'Cant',
    unit: 'Unidad',
    unitPrice: 'Precio Unitario',
    lineDiscount: 'Desc.',
    taxable: 'Impuesto',
    total: 'Total',
    sectionSubtotal: 'Subtotal de Sección',
    subtotal: 'Subtotal',
    discount: 'Descuento',
    discountNone: 'Ninguno',
    discountPct: '% off',
    discountFixed: 'Fijo',
    deposit: 'Depósito',
    depositNone: 'Ninguno',
    depositPct: '%',
    depositAmount: 'Monto',
    balanceDue: 'Saldo Pendiente',
    tax: 'Impuesto',
    grandTotal: 'Total',
    paymentTerms: 'Términos de Pago',
    timeline: 'Plazo',
    warranty: 'Garantía',
    notes: 'Notas',
    date: 'Fecha',
    estimateNum: 'Presupuesto Nº',
    noClient: 'Sin cliente vinculado',
    addItem: 'Agregar ítem',
    addSection: 'Agregar sección',
    addDetails: 'Agregar detalles',
    summaryPlaceholder: 'Resumen del presupuesto…',
    termsPlaceholder: 'Ingrese los detalles…',
    searchPriceBook: 'Buscar en catálogo…',
    noMatches: 'Sin resultados',
    customized: 'Personalizado',
    usingDefault: 'Predeterminado',
    resetToDefault: 'Restablecer',
    photos: 'Fotos',
  },
}

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

const DATE_LOCALE: Record<EstimateLanguage, string> = {
  en: 'en-US',
  pt: 'pt-BR',
  es: 'es-MX',
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

export interface DocumentCompany {
  name: string
  owner_name: string | null
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  logo_url: string | null
  brand_primary_color: string | null
}

/**
 * R4 — company-level defaults the document compares against to surface an
 * "override vs default" indicator on inherited fields. Optional: omitted in
 * view/share/PDF mode where no edit affordances are shown.
 */
export interface CompanyDefaults {
  payment_terms: string | null
  warranty_terms: string | null
  tax_rate: number
}

export interface DocumentClient {
  name: string
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
}

export interface DocumentItem {
  id: string
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  total: number
  sort_order?: number
  price_source?: 'price_book' | 'ai_estimate' | 'researched' | null
  isManuallyEdited?: boolean
  // v4.11 advanced pricing — optional, no-op defaults (taxable on, discount 0).
  taxable?: boolean
  tax_category?: 'labor' | 'materials' | 'other' | null
  discount?: number
  cost?: number | null
  markup_pct?: number | null
}

export interface DocumentSection {
  id: string
  title: string
  subtotal: number
  items: DocumentItem[]
}

/**
 * Deliberately NOT the full lib/queries/photo.ts Photo type — the document
 * surface only needs these fields and shouldn't couple to the photos query
 * module. `url`, when present, is a pre-resolved signed URL (view/share mode,
 * resolved server-side); when absent (edit mode), AttachedPhotoThumb resolves
 * one client-side the same way PhotoCard does.
 */
export interface DocumentPhoto {
  id: string
  storage_path: string
  caption: string | null
  url?: string
}

export interface EstimateDocumentData {
  summary: string | null
  notes: string | null
  timeline: string | null
  payment_terms: string | null
  warranty_terms: string | null
  discount_type: string | null
  discount_value: number
  discount_amount: number
  tax_rate: number
  tax_amount: number
  subtotal: number
  total: number
  // v4.11 deposit — preview values (server recompute is authoritative). With
  // deposit_type 'none' the deposit is 0 and balance_due === total → panel
  // renders byte-identical to today (no deposit row, no Balance Due line).
  deposit_type: string
  deposit_value: number | null
  deposit: number
  balance_due: number
  currency_code: string
  sections: DocumentSection[]
  estimate_date: string | null
  estimate_number: string | null
  attachedPhotos?: DocumentPhoto[]
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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAddress(obj: {
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
}): string | null {
  const parts: string[] = []
  if (obj.address) parts.push(obj.address)
  const cityState = [obj.city, obj.state].filter(Boolean).join(', ')
  if (cityState && obj.zip) parts.push(`${cityState} ${obj.zip}`)
  else if (cityState) parts.push(cityState)
  else if (obj.zip) parts.push(obj.zip)
  return parts.length > 0 ? parts.join('\n') : null
}

function formatDate(dateStr: string, lang: EstimateLanguage = 'en'): string {
  const locale = DATE_LOCALE[lang] ?? 'en-US'
  return new Date(dateStr).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// Common class string for inline editable fields (looks like plain text, activates on focus/hover)
const INLINE_INPUT_CLS =
  'w-full bg-transparent text-base p-1 focus:outline-none focus:bg-muted/30 focus:rounded-sm hover:bg-muted/20 hover:rounded-sm transition-colors'
const INLINE_TEXTAREA_CLS =
  'w-full bg-transparent text-base text-muted-foreground whitespace-pre-line resize-none leading-relaxed p-1 focus:outline-none focus:bg-muted/30 focus:rounded-sm hover:bg-muted/20 hover:rounded-sm transition-colors'

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
}: {
  item: DocumentItem
  sectionId: string
  dispatch: React.Dispatch<EstimateAction>
  currencyCode: string
  lang: EstimateLanguage
  priceBookItems: PriceBookItem[]
  L: DocLabels
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
      className="border-b border-border/50 group even:bg-muted/20"
    >
      {/* drag handle */}
      <td className="py-1 px-1 w-6 align-middle">
        <span
          className="cursor-grab text-muted-foreground/30 group-hover:text-muted-foreground/60 inline-flex items-center"
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
      </td>
      {/* description */}
      <td className="py-1 px-1 align-middle">
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
          className={INLINE_INPUT_CLS}
          noMatchesLabel={L.noMatches}
        />
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
      {/* line discount */}
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
      {/* taxable */}
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
    <div>
      {/* Section header bar */}
      <div
        className="flex items-center gap-2 px-3 py-2 group/header"
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
            className="flex-1 bg-transparent font-semibold text-base focus:outline-none placeholder:text-white/50 focus:bg-white/10 rounded px-1 min-w-0"
          />
        ) : (
          <span className="flex-1 font-semibold text-base select-none" style={{ color: brandOnFill }}>{section.title}</span>
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
              className="px-3 py-2.5 border-b border-border/50 last:border-b-0 even:bg-muted/20"
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
                    <th className="py-1.5 px-2 w-20 text-right font-medium">{L.lineDiscount}</th>
                    <th className="py-1.5 px-2 w-12 text-center font-medium">{L.taxable}</th>
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
                  className={`border-b border-border/50 last:border-0 ${idx % 2 === 1 ? 'bg-muted/20' : ''}`}
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

      {/* Add item — edit mode only, placed right after the last item */}
      {isEditable && dispatch && (
        <div className="px-3 py-1.5 border-t border-dashed border-border/50">
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
      <div className="flex justify-end items-center gap-3 px-3 py-2 border-t border-border/50 bg-muted/10">
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
    <div className="flex justify-end px-6 sm:px-10 py-5 border-t border-border/50">
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
              {data.discount_type === 'percentage' ? ` (${data.discount_value}%)` : ''}
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
        <div className="flex justify-between items-baseline pt-3 border-t-2 border-foreground">
          <span className="text-2xl font-bold select-none">{L.grandTotal}</span>
          <span className="text-2xl font-bold tabular-nums" style={{ color: brandText }}>
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
}: {
  label: string
  value: string | null
  field: 'notes' | 'timeline' | 'payment_terms' | 'warranty_terms'
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
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground select-none">
          {label}
        </p>
        {isEditable && hasDefault && dispatch ? (
          <DefaultStateIndicator
            isOverridden={isOverridden}
            onReset={() =>
              dispatch({ type: 'UPDATE_FIELD', field, value: defaultValue || null })
            }
            L={L}
          />
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
// LinkClientInline — "No client linked" → popover search (edit mode)
// ---------------------------------------------------------------------------

interface ClientSearchItem {
  id: string
  name: string
  email: string | null
}

function ClientSearchList({ search, onSelect }: { search: string; onSelect: (id: string) => void }) {
  const [clients, setClients] = useState<ClientSearchItem[] | null>(null)
  const [loaded, setLoaded] = useState(false)

  if (!loaded && clients === null) {
    setLoaded(true)
    fetch('/api/clients')
      .then((r) => r.json())
      .then((data) => setClients(Array.isArray(data) ? data : []))
      .catch(() => setClients([]))
  }

  if (clients === null) return <CommandEmpty>Loading…</CommandEmpty>

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  if (filtered.length === 0) return <CommandEmpty>No clients found.</CommandEmpty>

  return (
    <CommandList>
      <CommandGroup>
        {filtered.map((c) => (
          <CommandItem key={c.id} value={c.id} onSelect={() => onSelect(c.id)}>
            <div className="flex flex-col">
              <span>{c.name}</span>
              {c.email && <span className="text-xs text-muted-foreground">{c.email}</span>}
            </div>
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandList>
  )
}

function LinkClientInline({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  function handleSelect(clientId: string) {
    startTransition(async () => {
      const result = await linkProjectToClient(projectId, clientId)
      if ('error' in result) { toast.error(result.error); return }
      toast.success('Client linked')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 text-lg text-muted-foreground italic hover:text-foreground transition-colors group">
          <UserPlus className="h-4 w-4 flex-shrink-0" />
          <span>No client linked</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search clients…" value={search} onValueChange={setSearch} />
          <ClientSearchList search={search} onSelect={handleSelect} />
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// InlineProjectName — click-to-edit project name inside document
// ---------------------------------------------------------------------------

function InlineProjectName({
  name,
  onRename,
}: {
  name: string
  onRename: (v: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  async function commit() {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === name) { setEditing(false); return }
    setPending(true)
    try { await onRename(trimmed) } finally { setPending(false); setEditing(false) }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void commit() }
          if (e.key === 'Escape') { setEditing(false); setDraft(name) }
        }}
        disabled={pending}
        className="text-2xl font-bold bg-transparent border-b border-primary focus:outline-none w-full disabled:opacity-60"
      />
    )
  }

  return (
    <p
      className="text-2xl font-bold cursor-pointer hover:underline decoration-dotted underline-offset-2"
      onClick={() => { setDraft(name); setEditing(true) }}
    >
      {name}
    </p>
  )
}

// ---------------------------------------------------------------------------
// AddDetailsPopover — toggles optional sections on/off in the editor
// ---------------------------------------------------------------------------

type OptionalFieldKey = 'summary' | 'payment_terms' | 'timeline' | 'warranty_terms' | 'notes'

function AddDetailsPopover({
  L,
  isFieldVisible,
  onToggle,
}: {
  L: DocLabels
  isFieldVisible: (f: OptionalFieldKey) => boolean
  onToggle: (f: OptionalFieldKey) => void
}) {
  const [open, setOpen] = useState(false)
  const items: { field: OptionalFieldKey; label: string }[] = [
    { field: 'summary', label: L.summary },
    { field: 'payment_terms', label: L.paymentTerms },
    { field: 'timeline', label: L.timeline },
    { field: 'warranty_terms', label: L.warranty },
    { field: 'notes', label: L.notes },
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-sm font-medium flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors select-none text-muted-foreground hover:text-foreground hover:bg-muted/50"
        >
          <Plus className="h-4 w-4" />
          {L.addDetails}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {items.map(({ field, label }) => {
          const visible = isFieldVisible(field)
          return (
            <button
              key={field}
              type="button"
              onClick={() => onToggle(field)}
              className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent hover:text-accent-foreground transition-colors text-left"
            >
              <span>{label}</span>
              {visible && <Check className="h-4 w-4 text-muted-foreground" />}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

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
    <div className="aspect-square overflow-hidden rounded-lg relative group">
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
}: EstimateDocumentProps) {
  const lang = (language ?? 'en') as EstimateLanguage
  const L = DOC_LABELS[lang] ?? DOC_LABELS.en
  const brandColor = brandColorProp ?? company?.brand_primary_color ?? SYSTEM_COLORS.primary
  // Render-time WCAG adaptation (stored brand color never mutated):
  const brandText = ensureReadableOnWhite(brandColor) // brand color as text on white
  const brandOnFill = readableTextColor(brandColor) // fixed foreground over a brand fill
  const isEditable = mode === 'edit' && !isReadOnly

  type OptionalField = 'summary' | 'payment_terms' | 'timeline' | 'warranty_terms' | 'notes'
  const [revealed, setRevealed] = useState<Set<OptionalField>>(new Set())

  const isFieldVisible = (field: OptionalField): boolean =>
    data[field] != null || revealed.has(field)

  const toggleField = (field: OptionalField) => {
    setRevealed((prev) => {
      const next = new Set(prev)
      if (next.has(field) || data[field] != null) {
        next.delete(field)
        if (dispatch && data[field] != null) {
          dispatch({ type: 'UPDATE_FIELD', field, value: null })
        }
      } else {
        next.add(field)
      }
      return next
    })
  }

  // Default displayed estimate number: zero-padded per-company sequence when available,
  // otherwise falls back to the per-project version (legacy behavior).
  const defaultEstimateNumber =
    estimateSeq && estimateSeq > 0
      ? String(estimateSeq).padStart(4, '0')
      : String(estimateVersion)

  // View/PDF: skip items with empty descriptions and sections that end up empty.
  const visibleSections = isEditable
    ? data.sections
    : data.sections
        .map((s) => ({ ...s, items: s.items.filter((i) => i.description.trim() !== '') }))
        .filter((s) => s.items.length > 0)

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
  const hasTerms =
    isFieldVisible('payment_terms') ||
    isFieldVisible('timeline') ||
    isFieldVisible('warranty_terms') ||
    isFieldVisible('notes')

  return (
    <div
      className="rounded-3xl border-4 shadow-lg overflow-hidden"
      style={{
        backgroundColor: '#ffffff',
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
        borderColor: '#3f3f46',
      } as React.CSSProperties}
    >
      {/* Company header — only when company provided (share/view mode + editor) */}
      {company && (
        <div
          className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 p-4 sm:p-6 border-b border-border"
          style={{ borderTopWidth: 3, borderTopStyle: 'solid', borderTopColor: brandColor }}
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
              <Image
                src={company.logo_url}
                alt={company.name}
                width={64}
                height={64}
                className="rounded object-contain"
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
          className="text-3xl sm:text-4xl font-bold tracking-wide select-none"
          style={{ color: brandOnFill }}
        >
          {L.estimate}
        </h1>
      </div>

      {/* Info grid: PROJECT | BILL TO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 px-6 sm:px-10 pt-8 sm:pt-10 pb-5 border-b border-border/50">
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

        {/* BILL TO — only renders when client is linked */}
        {client && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 select-none">
              {L.billTo}
            </p>
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

      {/* Summary — only renders when filled or explicitly revealed in editor */}
      {isFieldVisible('summary') && (
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
              autoFocus={revealed.has('summary') && data.summary == null}
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
          <AddDetailsPopover
            L={L}
            isFieldVisible={isFieldVisible}
            onToggle={toggleField}
          />
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

      {/* Terms — each block renders only when filled or explicitly revealed */}
      {hasTerms && (
        <div className="px-6 sm:px-10 pb-6 pt-4 border-t border-border/50 space-y-4">
          {isFieldVisible('payment_terms') && (
            <TermsBlock
              label={L.paymentTerms}
              value={data.payment_terms}
              field="payment_terms"
              dispatch={dispatch}
              isEditable={isEditable}
              autoFocus={revealed.has('payment_terms') && data.payment_terms == null}
              defaultValue={companyDefaults?.payment_terms}
              L={L}
            />
          )}
          {isFieldVisible('timeline') && (
            <TermsBlock
              label={L.timeline}
              value={data.timeline}
              field="timeline"
              dispatch={dispatch}
              isEditable={isEditable}
              autoFocus={revealed.has('timeline') && data.timeline == null}
              L={L}
            />
          )}
          {isFieldVisible('warranty_terms') && (
            <TermsBlock
              label={L.warranty}
              value={data.warranty_terms}
              field="warranty_terms"
              dispatch={dispatch}
              isEditable={isEditable}
              autoFocus={revealed.has('warranty_terms') && data.warranty_terms == null}
              defaultValue={companyDefaults?.warranty_terms}
              L={L}
            />
          )}
          {isFieldVisible('notes') && (
            <TermsBlock
              label={L.notes}
              value={data.notes}
              field="notes"
              dispatch={dispatch}
              isEditable={isEditable}
              autoFocus={revealed.has('notes') && data.notes == null}
              L={L}
            />
          )}
        </div>
      )}

      {/* Attached photos — only when at least one photo is attached (zero-attached = no section anywhere) */}
      {data.attachedPhotos && data.attachedPhotos.length > 0 && (
        <div className="px-6 sm:px-10 pb-6 pt-4 border-t border-border/50">
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
    </div>
  )
}
