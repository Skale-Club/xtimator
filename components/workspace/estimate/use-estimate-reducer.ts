'use client'

import { useReducer } from 'react'
import type { EstimateWithSections } from '@/lib/queries/estimate'

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
  isDirty: boolean
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type EstimateAction =
  | { type: 'INIT'; estimate: EstimateWithSections }
  | { type: 'UPDATE_FIELD'; field: 'summary' | 'notes' | 'timeline' | 'payment_terms' | 'warranty_terms'; value: string | null }
  | { type: 'UPDATE_SECTION_TITLE'; sectionId: string; title: string }
  | { type: 'UPDATE_ITEM'; sectionId: string; itemId: string; field: 'description' | 'quantity' | 'unit' | 'unit_price'; value: string | number | null }
  | { type: 'ADD_ITEM'; sectionId: string }
  | { type: 'REMOVE_ITEM'; sectionId: string; itemId: string }
  | { type: 'ADD_SECTION' }
  | { type: 'REMOVE_SECTION'; sectionId: string }
  | { type: 'REORDER_ITEMS'; sectionId: string; itemIds: string[] }
  | { type: 'REORDER_SECTIONS'; sectionIds: string[] }
  | { type: 'UPDATE_DISCOUNT'; discount_type: string | null; discount_value: number }
  | { type: 'UPDATE_TAX_RATE'; tax_rate: number }
  | { type: 'MARK_SAVED' }

// ---------------------------------------------------------------------------
// Recalculation helper
// ---------------------------------------------------------------------------

function recalculate(state: EstimateEditorState): EstimateEditorState {
  const sections = state.sections.map((s) => {
    const items = s.items.map((i) => ({
      ...i,
      total: Math.round(i.quantity * i.unit_price * 100) / 100,
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
      isDirty: false,
    }
  }

  return {
    id: estimate.id,
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
              return { ...i, [action.field]: action.value }
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
