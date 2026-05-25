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
import { GripVertical, Plus, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { MoneyInput } from '@/components/ui/money-input'
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
import { formatMoney } from '@/lib/money/currency'
import { formatPhoneForDisplay } from '@/lib/phone/format'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { linkProjectToClient } from '@/lib/actions/project'
import { ItemCardMobile } from './item-card-mobile'
import type { EstimateAction, EditorItem } from './use-estimate-reducer'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

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
    total: 'Total',
    sectionSubtotal: 'Section Subtotal',
    subtotal: 'Subtotal',
    discount: 'Discount',
    discountNone: 'None',
    discountPct: '% off',
    discountFixed: 'Fixed',
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
    summaryPlaceholder: 'Estimate summary…',
    termsPlaceholder: 'Enter details…',
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
    total: 'Total',
    sectionSubtotal: 'Subtotal da Seção',
    subtotal: 'Subtotal',
    discount: 'Desconto',
    discountNone: 'Nenhum',
    discountPct: '% off',
    discountFixed: 'Fixo',
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
    summaryPlaceholder: 'Resumo do orçamento…',
    termsPlaceholder: 'Insira os detalhes…',
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
    total: 'Total',
    sectionSubtotal: 'Subtotal de Sección',
    subtotal: 'Subtotal',
    discount: 'Descuento',
    discountNone: 'Ninguno',
    discountPct: '% off',
    discountFixed: 'Fijo',
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
    summaryPlaceholder: 'Resumen del presupuesto…',
    termsPlaceholder: 'Ingrese los detalles…',
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
  total: string
  sectionSubtotal: string
  subtotal: string
  discount: string
  discountNone: string
  discountPct: string
  discountFixed: string
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
  summaryPlaceholder: string
  termsPlaceholder: string
}

const DATE_LOCALE: Record<EstimateLanguage, string> = {
  en: 'en-US',
  pt: 'pt-BR',
  es: 'es-MX',
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
  price_source?: 'price_book' | 'ai_estimate' | null
  isManuallyEdited?: boolean
}

export interface DocumentSection {
  id: string
  title: string
  subtotal: number
  items: DocumentItem[]
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
  currency_code: string
  sections: DocumentSection[]
  estimate_date: string | null
  estimate_number: string | null
}

interface EstimateDocumentProps {
  mode: 'view' | 'edit'
  data: EstimateDocumentData
  /** Full company header — required in view/share mode, omit in edit mode */
  company?: DocumentCompany
  /** Override brand color (used in edit mode when company object isn't available) */
  brandColor?: string
  client: DocumentClient | null
  projectName: string
  projectType: string | null
  language?: EstimateLanguage | null
  estimateVersion: number
  estimateCreatedAt: string
  /** Required when mode="edit" */
  dispatch?: React.Dispatch<EstimateAction>
  /** edit mode: locks fields when consolidated or old version */
  isReadOnly?: boolean
  /** Enables inline project-name editing and "No client linked" click-to-link */
  projectId?: string
  onRenameProject?: (name: string) => Promise<void>
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
  'w-full bg-transparent text-sm p-1 focus:outline-none focus:bg-muted/30 focus:rounded-sm hover:bg-muted/20 hover:rounded-sm transition-colors'
const INLINE_TEXTAREA_CLS =
  'w-full bg-transparent text-sm text-muted-foreground whitespace-pre-line resize-none leading-relaxed p-1 focus:outline-none focus:bg-muted/30 focus:rounded-sm hover:bg-muted/20 hover:rounded-sm transition-colors'

// ---------------------------------------------------------------------------
// SortableDocumentItemRow — edit mode only, must live inside DndContext
// ---------------------------------------------------------------------------

function SortableDocumentItemRow({
  item,
  sectionId,
  dispatch,
  currencyCode,
}: {
  item: DocumentItem
  sectionId: string
  dispatch: React.Dispatch<EstimateAction>
  currencyCode: string
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
        <input
          value={item.description}
          onChange={(e) =>
            dispatch({
              type: 'UPDATE_ITEM',
              sectionId,
              itemId: item.id,
              field: 'description',
              value: e.target.value,
            })
          }
          placeholder="Item description"
          className={INLINE_INPUT_CLS}
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
      <td className="py-1 px-1 w-16 align-middle">
        <input
          value={item.unit ?? ''}
          onChange={(e) =>
            dispatch({
              type: 'UPDATE_ITEM',
              sectionId,
              itemId: item.id,
              field: 'unit',
              value: e.target.value || null,
            })
          }
          placeholder="—"
          className={`${INLINE_INPUT_CLS} text-center`}
        />
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
          className="h-8 bg-transparent border-0 shadow-none text-right text-sm tabular-nums p-1 focus:ring-1 focus:ring-primary/30 hover:bg-muted/20 hover:rounded-sm"
        />
      </td>
      {/* total */}
      <td className="py-1 pr-3 pl-1 w-28 text-right text-sm tabular-nums font-medium align-middle">
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
  currencyCode,
  L,
  dragHandleProps,
}: {
  section: DocumentSection
  dispatch?: React.Dispatch<EstimateAction>
  isEditable: boolean
  brandColor: string
  currencyCode: string
  L: DocLabels
  dragHandleProps?: Record<string, unknown>
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
            className="flex-1 bg-transparent text-white font-semibold text-sm focus:outline-none placeholder:text-white/50 focus:bg-white/10 rounded px-1 min-w-0"
          />
        ) : (
          <span className="flex-1 text-white font-semibold text-sm">{section.title}</span>
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
            />
          ) : (
            <div
              key={item.id}
              className="px-3 py-2.5 border-b border-border/50 last:border-b-0 even:bg-muted/20"
            >
              <p className="text-sm font-medium">{item.description}</p>
              <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
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
                  <tr className="bg-muted/50 text-xs text-muted-foreground border-b border-border/50">
                    <th className="py-1.5 px-1 w-6" />
                    <th className="py-1.5 px-2 text-left font-medium">{L.description}</th>
                    <th className="py-1.5 px-2 w-16 text-center font-medium">{L.qty}</th>
                    <th className="py-1.5 px-2 w-16 text-center font-medium">{L.unit}</th>
                    <th className="py-1.5 px-2 w-28 text-right font-medium">{L.unitPrice}</th>
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
                  <td className="py-2 px-3 text-sm">{item.description}</td>
                  <td className="py-2 px-2 text-sm text-center tabular-nums">{item.quantity}</td>
                  <td className="py-2 px-2 text-sm text-center">{item.unit ?? '—'}</td>
                  <td className="py-2 px-2 text-sm text-right tabular-nums">
                    {formatMoney(item.unit_price, currencyCode)}
                  </td>
                  <td className="py-2 px-3 text-sm text-right tabular-nums font-medium">
                    {formatMoney(item.total, currencyCode)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Section subtotal */}
      <div className="flex justify-end items-center gap-3 px-3 py-2 border-t border-border/50 bg-muted/10">
        <span className="text-xs text-muted-foreground">{L.sectionSubtotal}</span>
        <span className="text-xs font-semibold tabular-nums">
          {formatMoney(section.subtotal, currencyCode)}
        </span>
      </div>

      {/* Add item — edit mode only */}
      {isEditable && dispatch && (
        <div className="px-3 py-1.5 border-t border-dashed border-border/50">
          <button
            onClick={() => dispatch({ type: 'ADD_ITEM', sectionId: section.id })}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <Plus className="h-3 w-3" />
            {L.addItem}
          </button>
        </div>
      )}
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
  currencyCode,
  L,
}: {
  section: DocumentSection
  dispatch: React.Dispatch<EstimateAction>
  isEditable: boolean
  brandColor: string
  currencyCode: string
  L: DocLabels
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
        currencyCode={currencyCode}
        L={L}
        dragHandleProps={listeners}
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
  brandColor,
  L,
}: {
  data: EstimateDocumentData
  dispatch?: React.Dispatch<EstimateAction>
  isEditable: boolean
  brandColor: string
  L: DocLabels
}) {
  const fmt = (v: number) => formatMoney(v, data.currency_code)
  const taxPercent = Math.round(data.tax_rate * 10000) / 100
  const discountTypeVal = data.discount_type ?? 'none'

  return (
    <div className="flex justify-end px-6 sm:px-10 py-5 border-t border-border/50">
      <div className="w-full max-w-xs space-y-2">
        {/* Subtotal */}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{L.subtotal}</span>
          <span className="tabular-nums font-medium">{fmt(data.subtotal)}</span>
        </div>

        {/* Discount */}
        {isEditable && dispatch ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-muted-foreground whitespace-nowrap shrink-0">{L.discount}</span>
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
                <SelectTrigger className="h-7 text-xs w-[90px] shrink-0">
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
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
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
          <div className="flex items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground shrink-0">{L.tax}</span>
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
        ) : data.tax_amount > 0 ? (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {L.tax} ({(data.tax_rate * 100).toFixed(2)}%)
            </span>
            <span className="tabular-nums font-medium">{fmt(data.tax_amount)}</span>
          </div>
        ) : null}

        {/* Grand total */}
        <div className="flex justify-between items-baseline pt-3 border-t-2 border-foreground">
          <span className="text-xl font-bold">{L.grandTotal}</span>
          <span className="text-xl font-bold tabular-nums" style={{ color: brandColor }}>
            {fmt(data.total)}
          </span>
        </div>
      </div>
    </div>
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
  placeholder,
}: {
  label: string
  value: string | null
  field: 'notes' | 'timeline' | 'payment_terms' | 'warranty_terms'
  dispatch?: React.Dispatch<EstimateAction>
  isEditable: boolean
  placeholder: string
}) {
  if (!isEditable && !value) return null

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
      </p>
      {isEditable && dispatch ? (
        <textarea
          value={value ?? ''}
          onChange={(e) =>
            dispatch({ type: 'UPDATE_FIELD', field, value: e.target.value || null })
          }
          placeholder={placeholder}
          rows={2}
          className={INLINE_TEXTAREA_CLS}
        />
      ) : (
        <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
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
        <button className="flex items-center gap-1.5 text-sm text-muted-foreground italic hover:text-foreground transition-colors group">
          <UserPlus className="h-3.5 w-3.5 invisible group-hover:visible flex-shrink-0" />
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
        className="text-sm font-semibold bg-transparent border-b border-primary focus:outline-none w-full disabled:opacity-60"
      />
    )
  }

  return (
    <p
      className="text-sm font-semibold cursor-pointer hover:underline decoration-dotted underline-offset-2"
      onClick={() => { setDraft(name); setEditing(true) }}
    >
      {name}
    </p>
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
  client,
  projectName,
  projectType,
  language,
  estimateVersion,
  estimateCreatedAt,
  dispatch,
  isReadOnly = false,
  projectId,
  onRenameProject,
}: EstimateDocumentProps) {
  const lang = (language ?? 'en') as EstimateLanguage
  const L = DOC_LABELS[lang] ?? DOC_LABELS.en
  const brandColor = brandColorProp ?? company?.brand_primary_color ?? SYSTEM_COLORS.primary
  const isEditable = mode === 'edit' && !isReadOnly

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
  const hasTerms = !!(
    data.payment_terms ||
    data.timeline ||
    data.warranty_terms ||
    data.notes
  )

  return (
    <div
      className="rounded-lg border shadow-sm overflow-hidden"
      style={{
        backgroundColor: '#ffffff',
        colorScheme: 'light',
        '--foreground': '240 10% 3.9%',
        '--muted-foreground': '240 3.8% 46.1%',
        '--muted': '240 4.8% 95.9%',
        '--border': '240 5.9% 90%',
        '--card': '0 0% 100%',
        '--card-foreground': '240 10% 3.9%',
        color: 'hsl(240 10% 3.9%)',
      } as React.CSSProperties}
    >
      {/* Company header — only when company provided (share/view mode) */}
      {company && (
        <div
          className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 p-4 sm:p-6 border-b border-border"
          style={{ borderTopWidth: 3, borderTopStyle: 'solid', borderTopColor: brandColor }}
        >
          <div className="flex items-start gap-3">
            {company.logo_url && (
              <Image
                src={company.logo_url}
                alt={company.name}
                width={64}
                height={64}
                className="rounded object-contain flex-shrink-0"
              />
            )}
            <div>
              <p className="font-bold text-lg leading-tight" style={{ color: brandColor }}>
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
          </div>
        </div>
      )}

      {/* ESTIMATE title */}
      <div className="pt-10 pb-5 px-6 sm:px-10 text-center">
        <h1
          className="text-2xl sm:text-3xl font-bold tracking-wide"
          style={{ color: brandColor }}
        >
          {L.estimate}
        </h1>
      </div>

      {/* Info grid: PROJECT | BILL TO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 px-6 sm:px-10 pb-5 border-b border-border/50">
        {/* PROJECT */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
            {L.project}
          </p>
          {isEditable && onRenameProject ? (
            <InlineProjectName name={projectName} onRename={onRenameProject} />
          ) : (
            <p className="text-sm font-semibold">{projectName}</p>
          )}
          {projectType && (
            <p className="text-xs text-muted-foreground mt-0.5 capitalize">
              {projectType.replace(/_/g, ' ')}
            </p>
          )}
          {isEditable && dispatch ? (
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <span className="shrink-0">{L.date}:</span>
              <input
                type="date"
                value={data.estimate_date ?? estimateCreatedAt.slice(0, 10)}
                onChange={(e) =>
                  dispatch({ type: 'UPDATE_FIELD', field: 'estimate_date', value: e.target.value || null })
                }
                className="bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none text-xs w-32"
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              {L.date}: {formatDate(data.estimate_date ?? estimateCreatedAt, lang)}
            </p>
          )}
          {isEditable && dispatch ? (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="shrink-0">{L.estimateNum}</span>
              <input
                value={data.estimate_number ?? String(estimateVersion)}
                onChange={(e) =>
                  dispatch({ type: 'UPDATE_FIELD', field: 'estimate_number', value: e.target.value || null })
                }
                className="bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none text-xs w-20"
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {L.estimateNum}{data.estimate_number ?? estimateVersion}
            </p>
          )}
        </div>

        {/* BILL TO */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
            {L.billTo}
          </p>
          {client ? (
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">{client.name}</p>
              {client.email && (
                <p className="text-xs text-muted-foreground">{client.email}</p>
              )}
              {client.phone && (
                <p className="text-xs text-muted-foreground">
                  {formatPhoneForDisplay(client.phone)}
                </p>
              )}
              {clientAddr && (
                <p className="text-xs text-muted-foreground whitespace-pre-line">{clientAddr}</p>
              )}
            </div>
          ) : isEditable && projectId ? (
            <LinkClientInline projectId={projectId} />
          ) : (
            <p className="text-sm text-muted-foreground italic">{L.noClient}</p>
          )}
        </div>
      </div>

      {/* Summary */}
      {(isEditable || data.summary) && (
        <div className="px-6 sm:px-10 py-4 border-b border-border/50">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
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
              placeholder={L.summaryPlaceholder}
              rows={3}
              className={INLINE_TEXTAREA_CLS}
            />
          ) : (
            <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
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
                  currencyCode={data.currency_code}
                  L={L}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          data.sections.map((section) => (
            <DocumentSectionBlock
              key={section.id}
              section={section}
              isEditable={false}
              brandColor={brandColor}
              currencyCode={data.currency_code}
              L={L}
            />
          ))
        )}
      </div>

      {/* Add section — edit mode only */}
      {isEditable && dispatch && (
        <div className="px-6 sm:px-10 py-2 border-t border-dashed border-border/50">
          <button
            onClick={() => dispatch({ type: 'ADD_SECTION' })}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <Plus className="h-3 w-3" />
            {L.addSection}
          </button>
        </div>
      )}

      {/* Totals */}
      <DocumentTotals
        data={data}
        dispatch={dispatch}
        isEditable={isEditable}
        brandColor={brandColor}
        L={L}
      />

      {/* Terms */}
      {(isEditable || hasTerms) && (
        <div className="px-6 sm:px-10 pb-6 pt-4 border-t border-border/50 space-y-4">
          <TermsBlock
            label={L.paymentTerms}
            value={data.payment_terms}
            field="payment_terms"
            dispatch={dispatch}
            isEditable={isEditable}
            placeholder={L.termsPlaceholder}
          />
          <TermsBlock
            label={L.timeline}
            value={data.timeline}
            field="timeline"
            dispatch={dispatch}
            isEditable={isEditable}
            placeholder={L.termsPlaceholder}
          />
          <TermsBlock
            label={L.warranty}
            value={data.warranty_terms}
            field="warranty_terms"
            dispatch={dispatch}
            isEditable={isEditable}
            placeholder={L.termsPlaceholder}
          />
          <TermsBlock
            label={L.notes}
            value={data.notes}
            field="notes"
            dispatch={dispatch}
            isEditable={isEditable}
            placeholder={L.termsPlaceholder}
          />
        </div>
      )}
    </div>
  )
}
