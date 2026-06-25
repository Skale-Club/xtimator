'use client'

import { useReducer } from 'react'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import { DEFAULT_CURRENCY_CODE } from '@/lib/money/currency'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EditorItem {
  id: string
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  total: number
  sort_order: number
  price_source: 'price_book' | 'ai_estimate' | 'researched' | null
  isManuallyEdited?: boolean
  // v4.11 advanced pricing — all OPTIONAL with no-op defaults (retrocompat).
  taxable?: boolean // default true
  tax_category?: 'labor' | 'materials' | 'other' | null
  discount?: number // line discount amount, default 0
  cost?: number | null
  markup_pct?: number | null
}

export interface EditorSection {
  id: string
  title: string
  sort_order: number
  subtotal: number
  items: EditorItem[]
}

export interface EstimateEditorState {
  id: string
  currency_code: string
  is_current: boolean
  version: number
  /** Per-company sequential identifier, auto-assigned, immutable. */
  estimate_seq: number
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
  sections: EditorSection[]
  estimate_date: string | null
  estimate_number: string | null
  isDirty: boolean
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type EstimateAction =
  | { type: 'INIT'; estimate: EstimateWithSections }
  | { type: 'UPDATE_FIELD'; field: 'summary' | 'notes' | 'timeline' | 'payment_terms' | 'warranty_terms' | 'estimate_date' | 'estimate_number'; value: string | null }
  | { type: 'UPDATE_SECTION_TITLE'; sectionId: string; title: string }
  | { type: 'UPDATE_ITEM'; sectionId: string; itemId: string; field: 'description' | 'quantity' | 'unit' | 'unit_price' | 'discount' | 'taxable'; value: string | number | boolean | null }
  | { type: 'APPLY_PRICE_BOOK_ITEM'; sectionId: string; itemId: string; item: { name: string; unit: string | null; unit_price: number } }
  | { type: 'ADD_ITEM'; sectionId: string }
  | { type: 'REMOVE_ITEM'; sectionId: string; itemId: string }
  | { type: 'ADD_SECTION' }
  | { type: 'REMOVE_SECTION'; sectionId: string }
  | { type: 'REORDER_ITEMS'; sectionId: string; itemIds: string[] }
  | { type: 'REORDER_SECTIONS'; sectionIds: string[] }
  | { type: 'UPDATE_DISCOUNT'; discount_type: string | null; discount_value: number }
  | { type: 'UPDATE_TAX_RATE'; tax_rate: number }
  | { type: 'MARK_SAVED' }
  | { type: 'APPLY_REFINEMENT'; refined: RefinementPayload }

/**
 * SEED-028 Phase C: shape returned by /api/estimates/[id]/refine (no DB write).
 * Wrapping field names to mirror the AI EstimateOutput.
 */
export interface RefinementPayload {
  summary: string
  notes?: string
  timeline?: string
  payment_terms?: string
  warranty_terms?: string
  sections: Array<{
    title: string
    items: Array<{
      description: string
      quantity: number
      unit?: string
      unit_price: number
      price_source: 'price_book' | 'ai_estimate' | 'researched'
    }>
  }>
}

// ---------------------------------------------------------------------------
// Recalculation helper
// ---------------------------------------------------------------------------

function recalculate(state: EstimateEditorState): EstimateEditorState {
  const sections = state.sections.map((s) => {
    const items = s.items.map((i) => ({
      ...i,
      // Client preview only — server (saveEstimate → computeEstimateTotals) is
      // authoritative; non-taxable lines are corrected server-side on save/reload.
      // Line net mirrors the engine's lineNet: round2(qty × unit_price) − discount.
      total: Math.round(i.quantity * i.unit_price * 100) / 100 - (i.discount ?? 0),
    }))
    return {
      ...s,
      items,
      subtotal: items.reduce((sum, i) => sum + i.total, 0),
    }
  })

  const subtotal = sections.reduce((sum, s) => sum + s.subtotal, 0)

  let discount_amount = 0
  if (state.discount_type === 'percentage') {
    discount_amount = Math.round((subtotal * state.discount_value) / 100 * 100) / 100
  } else if (state.discount_type === 'fixed') {
    discount_amount = state.discount_value
  }

  const tax_amount = Math.round((subtotal - discount_amount) * state.tax_rate * 100) / 100
  const total = Math.round((subtotal - discount_amount + tax_amount) * 100) / 100

  return { ...state, sections, subtotal, discount_amount, tax_amount, total }
}

// ---------------------------------------------------------------------------
// Init from server data
// ---------------------------------------------------------------------------

function initState(estimate: EstimateWithSections | null): EstimateEditorState {
  if (!estimate) {
    return {
      id: '',
      currency_code: DEFAULT_CURRENCY_CODE,
      is_current: true,
      version: 0,
      estimate_seq: 0,
      summary: null,
      notes: null,
      timeline: null,
      payment_terms: null,
      warranty_terms: null,
      discount_type: null,
      discount_value: 0,
      discount_amount: 0,
      tax_rate: 0,
      tax_amount: 0,
      subtotal: 0,
      total: 0,
      sections: [],
      estimate_date: null,
      estimate_number: null,
      isDirty: false,
    }
  }

  return {
    id: estimate.id,
    currency_code: estimate.currency_code ?? DEFAULT_CURRENCY_CODE,
    is_current: estimate.is_current,
    version: estimate.version,
    estimate_seq: estimate.estimate_seq,
    summary: estimate.summary,
    notes: estimate.notes,
    timeline: estimate.timeline,
    payment_terms: estimate.payment_terms,
    warranty_terms: estimate.warranty_terms,
    discount_type: estimate.discount_type,
    discount_value: estimate.discount_value,
    discount_amount: estimate.discount_amount,
    tax_rate: estimate.tax_rate,
    tax_amount: estimate.tax_amount,
    subtotal: estimate.subtotal,
    total: estimate.total,
    estimate_date: (estimate as { estimate_date?: string | null }).estimate_date ?? null,
    estimate_number: (estimate as { estimate_number?: string | null }).estimate_number ?? null,
    sections: estimate.sections
      .map((s) => ({
        id: s.id,
        title: s.title,
        sort_order: s.sort_order,
        subtotal: s.subtotal,
        items: s.items.map((i) => ({
          id: i.id,
          description: i.description,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unit_price,
          total: i.total,
          sort_order: i.sort_order,
          price_source: i.price_source ?? null,
          isManuallyEdited: false,
          // v4.11 advanced pricing — read off the server row with no-op defaults
          // (the query type may not yet surface these; cast like estimate_date).
          taxable: (i as { taxable?: boolean }).taxable ?? true,
          tax_category: (i as { tax_category?: 'labor' | 'materials' | 'other' | null }).tax_category ?? null,
          discount: (i as { discount?: number }).discount ?? 0,
          cost: (i as { cost?: number | null }).cost ?? null,
          markup_pct: (i as { markup_pct?: number | null }).markup_pct ?? null,
        })),
      }))
      .sort((a, b) => a.sort_order - b.sort_order),
    isDirty: false,
  }
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function estimateReducer(state: EstimateEditorState, action: EstimateAction): EstimateEditorState {
  switch (action.type) {
    case 'INIT':
      return initState(action.estimate)

    case 'UPDATE_FIELD':
      return { ...state, [action.field]: action.value, isDirty: true }

    case 'UPDATE_SECTION_TITLE':
      return {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.sectionId ? { ...s, title: action.title } : s
        ),
        isDirty: true,
      }

    case 'UPDATE_ITEM': {
      const updated = {
        ...state,
        sections: state.sections.map((s) => {
          if (s.id !== action.sectionId) return s
          return {
            ...s,
            items: s.items.map((i) => {
              if (i.id !== action.itemId) return i
              // Coerce per-field: discount → number (default 0), taxable → boolean.
              let value = action.value
              if (action.field === 'discount') {
                value = typeof value === 'number' ? value : Number(value) || 0
              } else if (action.field === 'taxable') {
                value = Boolean(value)
              }
              const updated = { ...i, [action.field]: value }
              // Only unit_price is a price-source override; discount/taxable are not.
              if (action.field === 'unit_price') {
                updated.isManuallyEdited = true
              }
              return updated
            }),
          }
        }),
        isDirty: true,
      }
      return recalculate(updated)
    }

    case 'ADD_ITEM': {
      const updated = {
        ...state,
        sections: state.sections.map((s) => {
          if (s.id !== action.sectionId) return s
          return {
            ...s,
            items: [
              ...s.items,
              {
                id: 'temp-' + crypto.randomUUID(),
                description: '',
                quantity: 1,
                unit: null,
                unit_price: 0,
                total: 0,
                sort_order: s.items.length,
                price_source: null,
                isManuallyEdited: false,
                taxable: true,
                discount: 0,
              },
            ],
          }
        }),
        isDirty: true,
      }
      return recalculate(updated)
    }

    case 'REMOVE_ITEM': {
      const updated = {
        ...state,
        sections: state.sections.map((s) => {
          if (s.id !== action.sectionId) return s
          return {
            ...s,
            items: s.items.filter((i) => i.id !== action.itemId),
          }
        }),
        isDirty: true,
      }
      return recalculate(updated)
    }

    case 'ADD_SECTION': {
      const newSectionId = 'temp-' + crypto.randomUUID()
      const updated = {
        ...state,
        sections: [
          ...state.sections,
          {
            id: newSectionId,
            title: 'New Section',
            sort_order: state.sections.length,
            subtotal: 0,
            items: [
              {
                id: 'temp-' + crypto.randomUUID(),
                description: '',
                quantity: 1,
                unit: null,
                unit_price: 0,
                total: 0,
                sort_order: 0,
                price_source: null,
                isManuallyEdited: false,
                taxable: true,
                discount: 0,
              },
            ],
          },
        ],
        isDirty: true,
      }
      return recalculate(updated)
    }

    case 'REMOVE_SECTION': {
      const updated = {
        ...state,
        sections: state.sections.filter((s) => s.id !== action.sectionId),
        isDirty: true,
      }
      return recalculate(updated)
    }

    case 'REORDER_ITEMS': {
      const updated = {
        ...state,
        sections: state.sections.map((s) => {
          if (s.id !== action.sectionId) return s
          const reordered = action.itemIds
            .map((id, idx) => {
              const item = s.items.find((i) => i.id === id)
              return item ? { ...item, sort_order: idx } : null
            })
            .filter(Boolean) as EditorItem[]
          return { ...s, items: reordered }
        }),
        isDirty: true,
      }
      return updated
    }

    case 'REORDER_SECTIONS': {
      const reordered = action.sectionIds
        .map((id, idx) => {
          const section = state.sections.find((s) => s.id === id)
          return section ? { ...section, sort_order: idx } : null
        })
        .filter(Boolean) as EditorSection[]
      return { ...state, sections: reordered, isDirty: true }
    }

    case 'UPDATE_DISCOUNT': {
      const updated = {
        ...state,
        discount_type: action.discount_type,
        discount_value: action.discount_value,
        isDirty: true,
      }
      return recalculate(updated)
    }

    case 'UPDATE_TAX_RATE': {
      const updated = {
        ...state,
        tax_rate: action.tax_rate,
        isDirty: true,
      }
      return recalculate(updated)
    }

    case 'MARK_SAVED':
      return { ...state, isDirty: false }

    case 'APPLY_REFINEMENT': {
      // Replace summary/notes/timeline/terms and the entire sections tree with
      // refined data. New section/item ids are temp- so saveEstimate will
      // insert fresh rows.
      const r = action.refined
      const refinedSections: EditorSection[] = r.sections.map((s, sIdx) => ({
        id: 'temp-' + crypto.randomUUID(),
        title: s.title,
        sort_order: sIdx,
        subtotal: 0,
        items: s.items.map((i, iIdx) => ({
          id: 'temp-' + crypto.randomUUID(),
          description: i.description,
          quantity: i.quantity,
          unit: i.unit ?? null,
          unit_price: i.unit_price,
          total: 0,
          sort_order: iIdx,
          price_source: i.price_source,
          isManuallyEdited: false,
          taxable: true,
          discount: 0,
        })),
      }))
      const updated: EstimateEditorState = {
        ...state,
        summary: r.summary,
        notes: r.notes ?? null,
        timeline: r.timeline ?? null,
        payment_terms: r.payment_terms ?? state.payment_terms,
        warranty_terms: r.warranty_terms ?? state.warranty_terms,
        sections: refinedSections,
        isDirty: true,
      }
      return recalculate(updated)
    }

    case 'APPLY_PRICE_BOOK_ITEM': {
      const updated = {
        ...state,
        sections: state.sections.map((s) => {
          if (s.id !== action.sectionId) return s
          return {
            ...s,
            items: s.items.map((i) => {
              if (i.id !== action.itemId) return i
              return {
                ...i,
                description: action.item.name,
                unit: action.item.unit,
                unit_price: action.item.unit_price,
                price_source: 'price_book' as const,
                isManuallyEdited: false,
              }
            }),
          }
        }),
        isDirty: true,
      }
      return recalculate(updated)
    }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEstimateReducer(initialEstimate: EstimateWithSections | null) {
  return useReducer(estimateReducer, initialEstimate, initState)
}
