'use client'

import { useReducer } from 'react'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { Photo } from '@/lib/queries/photo'
import type { DocumentSignature } from '@/lib/estimate/document/model'
import { DEFAULT_CURRENCY_CODE } from '@/lib/money/currency'
import type { PresentationSettings } from '@/lib/estimate/presentation-settings'
import { mergeRefinement } from '@/lib/estimate/refine-merge'

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
  // v4.11 deposit — preview only; server (saveEstimate → computeEstimateTotals)
  // is authoritative. deposit_type domain: 'none' | 'percent' | 'amount'.
  deposit_type: string
  deposit_value: number | null
  deposit: number
  balance_due: number
  sections: EditorSection[]
  estimate_date: string | null
  estimate_number: string | null
  attachedPhotos: Photo[]
  /** Phase 165 Plan 02 (SAVE-04, audit B4 false-clean fix) — a monotonic
   *  counter bumped by EVERY isDirty-setting reducer action (via the `dirty()`
   *  helper below; never in MARK_SAVED/INIT). MARK_SAVED only clears isDirty
   *  when the epoch captured by the caller BEFORE its save request still
   *  equals this counter — a keystroke landing mid-save bumps it again, so a
   *  stale MARK_SAVED can never falsely mark the editor clean. */
  editEpoch: number
  /** Phase 185 Plan 04 (PGMODE-03) — bumped ONLY by actions that change WHICH
   *  pagination blocks exist or their order (never by pure text edits) —
   *  read by usePaginatedPreview to trigger an IMMEDIATE repagination,
   *  bypassing the 400ms text-debounce. Documented exhaustively below; a new
   *  action type defaults to NOT bumping this (opt-in, not opt-out) — if a
   *  future action changes block presence/order, it must be added here. */
  structuralEditEpoch: number
  /** Phase 161 (PRESENT-01/03): dormant-first -- NULL = today's behavior (all
   *  visible, no overrides). Never read by recalculate() (GUARD-03: visibility
   *  and override STATE never affect totals math here). */
  presentation_settings: PresentationSettings | null
  isDirty: boolean
  /** Pre-launch audit fix (B7): optimistic-concurrency baseline — the
   * estimates.updated_at this state was loaded from. saveEstimate compares it
   * server-side so a stale save (another tab/session already saved) is
   * rejected instead of silently overwriting or deleting their changes. */
  updated_at: string
  /** Phase 164 Plan 02 (TRUST-02) — lock-coverage fields threaded from the
   *  server row so the editor can compute isContentReadOnly / render the
   *  lock banner. hasSignature covers the signed-but-unresponded window
   *  (sent_at/client_response can both still be null on a signed estimate —
   *  see lib/estimate/lock.ts's doc comment). Never mutated client-side. */
  sent_at: string | null
  client_response: string | null
  hasSignature: boolean
  /** Phase 183 Plan 05 (PDFPAR-02) — signature-display data threaded from the
   *  server row (lib/queries/estimate-signature.ts), alongside hasSignature's
   *  lock-coverage boolean. Null when unsigned; never mutated client-side. */
  signature: DocumentSignature | null
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
  | { type: 'UPDATE_DEPOSIT'; deposit_type: string; deposit_value: number | null }
  | { type: 'UPDATE_TAX_RATE'; tax_rate: number }
  | { type: 'UPDATE_PRESENTATION_SETTINGS'; presentation_settings: PresentationSettings }
  | {
      type: 'MARK_SAVED'
      updated_at: string
      /** SAVE-03 — server-assigned uuids for every temp- section/item this
       *  save persisted (the RPC's id_map). OPTIONAL (Blocker 1): the
       *  presentation-settings re-baseline dispatch (estimate-editor.tsx's
       *  handlePresentationSettingsChange, via savePresentationSettings) has
       *  no id_map to offer and must stay valid without one. Absent/empty ->
       *  skip the remap. */
      idMap?: Record<string, string>
      /** SAVE-07 — the server-computed totals breakdown, adopted verbatim so
       *  the editor snaps to the persisted truth (covers per-category
       *  tax_config companies the reducer can't compute locally). OPTIONAL
       *  for the same reason as idMap — absent leaves today's totals as-is
       *  (a presentation-only save never changes priced content). */
      totals?: {
        subtotal: number
        tax_amount: number
        discount_amount: number
        total: number
        balance_due: number
      }
      /** SAVE-04 — the editEpoch the caller captured BEFORE dispatching the
       *  save request. OPTIONAL: absent means "always clear isDirty" (the
       *  presentation-settings re-baseline path, preserving its pre-165-02
       *  behavior exactly). When present, isDirty only clears if it still
       *  equals the CURRENT editEpoch -- an edit that landed mid-save bumped
       *  the epoch, so isDirty correctly stays true. */
      savedEpoch?: number
    }
  | { type: 'APPLY_REFINEMENT'; refined: RefinementPayload }
  | { type: 'ATTACH_PHOTO'; photo: Photo }
  | { type: 'DETACH_PHOTO'; photoId: string }

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
      // v4.11 advanced pricing — optional; present when the AI preserved/set them
      // (the refine route now feeds these into the "Current Estimate" context it
      // sees, mirroring generate's price_book/tax_category handling).
      taxable?: boolean
      tax_category?: 'labor' | 'materials' | 'other' | null
      discount?: number
      cost?: number | null
      markup_pct?: number | null
    }>
  }>
}

// ---------------------------------------------------------------------------
// SAVE-04: centralized isDirty + editEpoch bump
// ---------------------------------------------------------------------------

/**
 * Every reducer branch that marks the editor dirty MUST also bump editEpoch in
 * the same step (audit B4 / SAVE-04) — centralizing this here means no branch
 * can set isDirty:true without the epoch bump (which would re-introduce the
 * false-clean bug: a keystroke landing during an in-flight save stranded
 * behind a MARK_SAVED that unconditionally cleared isDirty).
 */
function dirty(state: EstimateEditorState): Pick<EstimateEditorState, 'isDirty' | 'editEpoch'> {
  return { isDirty: true, editEpoch: state.editEpoch + 1 }
}

/**
 * Phase 185 Plan 04 (PGMODE-03) — the SAME centralized-bump pattern as
 * dirty() above, widened to ALSO bump structuralEditEpoch. Used ONLY by
 * reducer cases classified STRUCTURAL (they change WHICH pagination blocks
 * exist or their order) — see this plan's <interfaces> classification table.
 * ATTACH_PHOTO/DETACH_PHOTO deliberately do NOT use this helper (they bump
 * structuralEditEpoch directly, without dirty()'s isDirty/editEpoch bump —
 * preserving their existing non-dirty behavior).
 */
function structuralDirty(
  state: EstimateEditorState
): Pick<EstimateEditorState, 'isDirty' | 'editEpoch' | 'structuralEditEpoch'> {
  return { ...dirty(state), structuralEditEpoch: state.structuralEditEpoch + 1 }
}

// ---------------------------------------------------------------------------
// Recalculation helper
// ---------------------------------------------------------------------------

function recalculate(state: EstimateEditorState): EstimateEditorState {
  const sections = state.sections.map((s) => {
    const items = s.items.map((i) => ({
      ...i,
      // Line net mirrors the engine's lineNet: round2(qty × unit_price) −
      // discount. `taxable` never affects the LINE total itself (the server's
      // lineNet has no taxable term either — lib/estimate/compute-totals.ts)
      // — it only gates which lines count toward the taxable TAX BASE below
      // (SAVE-07).
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

  // SAVE-07 (client preview parity, audit B8): mirror the server's flat-tax
  // path EXACTLY (lib/estimate/compute-totals.ts's `!isTaxConfig` branch,
  // landed in 165-01) — a taxable=false line contributes ZERO to the taxable
  // base, and the global discount is PRORATED onto that base (its share of
  // the overall subtotal), not subtracted in full. This is what keeps a
  // mixed-taxable estimate from diverging from what saveEstimate persists (or
  // going negative). All-taxable (taxable absent/true on every line — the
  // overwhelming default) → taxableBase === subtotal → proratedDisc ===
  // discount_amount → BYTE-IDENTICAL to the pre-165-02 flat formula. Flat-only:
  // the reducer has no company tax_config, so a per-category company still
  // only resolves its true tax on save (MARK_SAVED adopts the server totals).
  const taxableBase = sections.reduce(
    (sum, s) => sum + s.items.reduce((t, i) => t + ((i.taxable ?? true) ? i.total : 0), 0),
    0
  )
  const proratedDisc =
    subtotal > 0 ? Math.round(discount_amount * (taxableBase / subtotal) * 100) / 100 : 0
  const tax_amount = Math.round((taxableBase - proratedDisc) * state.tax_rate * 100) / 100
  const total = Math.round((subtotal - discount_amount + tax_amount) * 100) / 100

  // v4.11 deposit preview — mirror compute-totals.ts L177-190 EXACTLY (same
  // Math.round(x*100)/100 form). Server recompute is authoritative (GUARD-03).
  const deposit =
    state.deposit_type === 'percent'
      ? Math.round(total * ((state.deposit_value ?? 0) / 100) * 100) / 100
      : state.deposit_type === 'amount'
        ? Math.round((state.deposit_value ?? 0) * 100) / 100
        : 0
  const balance_due = Math.round((total - deposit) * 100) / 100

  return { ...state, sections, subtotal, discount_amount, tax_amount, total, deposit, balance_due }
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
      deposit_type: 'none',
      deposit_value: null,
      deposit: 0,
      balance_due: 0,
      sections: [],
      estimate_date: null,
      estimate_number: null,
      attachedPhotos: [],
      presentation_settings: null,
      isDirty: false,
      editEpoch: 0,
      structuralEditEpoch: 0,
      updated_at: new Date(0).toISOString(),
      sent_at: null,
      client_response: null,
      hasSignature: false,
      signature: null,
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
    // v4.11 deposit — read off the server row with no-op defaults (cast like
    // estimate_date; the query type may not yet surface these). deposit preview
    // recomputes on the first recalculate; balance_due falls back to total.
    deposit_type: (estimate as { deposit_type?: string }).deposit_type ?? 'none',
    deposit_value: (estimate as { deposit_value?: number | null }).deposit_value ?? null,
    deposit: 0,
    balance_due: (estimate as { balance_due?: number | null }).balance_due ?? estimate.total,
    estimate_date: (estimate as { estimate_date?: string | null }).estimate_date ?? null,
    estimate_number: (estimate as { estimate_number?: string | null }).estimate_number ?? null,
    attachedPhotos: (estimate as { attachedPhotos?: Photo[] }).attachedPhotos ?? [],
    presentation_settings: (estimate as { presentation_settings?: PresentationSettings | null }).presentation_settings ?? null,
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
    editEpoch: 0,
    structuralEditEpoch: 0,
    updated_at: estimate.updated_at,
    sent_at: estimate.sent_at,
    client_response: estimate.client_response,
    hasSignature: (estimate as { hasSignature?: boolean }).hasSignature ?? false,
    signature: (estimate as { signature?: DocumentSignature | null }).signature ?? null,
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
      return { ...state, [action.field]: action.value, ...dirty(state) }

    case 'UPDATE_SECTION_TITLE':
      return {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.sectionId ? { ...s, title: action.title } : s
        ),
        ...dirty(state),
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
        ...dirty(state),
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
        ...structuralDirty(state),
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
        ...structuralDirty(state),
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
        ...structuralDirty(state),
      }
      return recalculate(updated)
    }

    case 'REMOVE_SECTION': {
      const updated = {
        ...state,
        sections: state.sections.filter((s) => s.id !== action.sectionId),
        ...structuralDirty(state),
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
        ...structuralDirty(state),
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
      return { ...state, sections: reordered, ...structuralDirty(state) }
    }

    case 'UPDATE_DISCOUNT': {
      const updated = {
        ...state,
        discount_type: action.discount_type,
        discount_value: action.discount_value,
        ...structuralDirty(state),
      }
      return recalculate(updated)
    }

    case 'UPDATE_DEPOSIT': {
      const updated = {
        ...state,
        deposit_type: action.deposit_type,
        deposit_value: action.deposit_value,
        ...structuralDirty(state),
      }
      return recalculate(updated)
    }

    case 'UPDATE_TAX_RATE': {
      const updated = {
        ...state,
        tax_rate: action.tax_rate,
        ...structuralDirty(state),
      }
      return recalculate(updated)
    }

    case 'UPDATE_PRESENTATION_SETTINGS':
      return { ...state, presentation_settings: action.presentation_settings, ...structuralDirty(state) }

    case 'MARK_SAVED': {
      // SAVE-03: remap every temp- section/item id to its server-assigned uuid
      // (the RPC's id_map) so a second immediate save re-UPDATEs those rows
      // instead of re-INSERTing them (no churn, no duplicate-row window).
      // Absent/empty idMap (e.g. the presentation-settings re-baseline dispatch,
      // which has no id_map to offer) → skip the remap entirely.
      const idMap = action.idMap
      const sections =
        idMap && Object.keys(idMap).length > 0
          ? state.sections.map((s) => ({
              ...s,
              id: idMap[s.id] ?? s.id,
              items: s.items.map((i) => ({ ...i, id: idMap[i.id] ?? i.id })),
            }))
          : state.sections

      // SAVE-07: adopt the server-computed totals verbatim (covers
      // per-category tax_config companies the reducer's own flat-only preview
      // can't compute) so the editor snaps to the persisted truth immediately.
      // Absent totals (the presentation-only re-baseline path) → leave
      // today's priced content untouched.
      const totals = action.totals

      // SAVE-04 (audit B4 false-clean fix): only clear isDirty when the epoch
      // captured by the caller BEFORE it dispatched the save still equals the
      // CURRENT editEpoch. `savedEpoch` absent → always clear (preserves the
      // 164-02 presentation-settings re-baseline behavior exactly). A mismatch
      // means an edit landed mid-save — leave isDirty as-is (still true).
      const isDirty =
        action.savedEpoch === undefined || action.savedEpoch === state.editEpoch
          ? false
          : state.isDirty

      return {
        ...state,
        sections,
        ...(totals
          ? {
              subtotal: totals.subtotal,
              tax_amount: totals.tax_amount,
              discount_amount: totals.discount_amount,
              total: totals.total,
              balance_due: totals.balance_due,
            }
          : {}),
        isDirty,
        updated_at: action.updated_at,
      }
    }

    case 'ATTACH_PHOTO': {
      if (state.attachedPhotos.some((p) => p.id === action.photo.id)) {
        return state
      }
      // Phase 185 Plan 04 (PGMODE-03) — bumps structuralEditEpoch ONLY
      // (photo-row block/chunk count changes) — deliberately does NOT call
      // dirty()/structuralDirty() here: ATTACH_PHOTO has never set
      // isDirty/bumped editEpoch, an existing, deliberate design choice this
      // plan must not disturb.
      return {
        ...state,
        attachedPhotos: [...state.attachedPhotos, action.photo],
        structuralEditEpoch: state.structuralEditEpoch + 1,
      }
    }

    case 'DETACH_PHOTO':
      // Same rationale as ATTACH_PHOTO above.
      return {
        ...state,
        attachedPhotos: state.attachedPhotos.filter(
          (p) => p.id !== action.photoId
        ),
        structuralEditEpoch: state.structuralEditEpoch + 1,
      }

    case 'APPLY_REFINEMENT': {
      // Phase 170 Plan 01 (REFINE-02, audit G2 fix): mergeRefinement (lib/
      // estimate/refine-merge.ts) replaces the old blanket temp- regeneration
      // (100% row churn, created_at reset on the next save). It TWO-PASS
      // matches refined items back onto the CURRENT rows (exact normalized-
      // description, then section-relative positional pairing of the
      // leftovers under a similarity guard) so untouched AND reworded rows
      // keep their id/created_at; only genuinely NEW rows get temp- ids. The
      // SAME util computes the diff the review dialog rendered before Apply
      // was clicked (refine-estimate-dialog.tsx) -- what the user reviewed is
      // exactly what lands here.
      const r = action.refined
      const { mergedSections } = mergeRefinement(
        {
          sections: state.sections,
          summary: state.summary,
          notes: state.notes,
          timeline: state.timeline,
          payment_terms: state.payment_terms,
          warranty_terms: state.warranty_terms,
        },
        r
      )
      const updated: EstimateEditorState = {
        ...state,
        summary: r.summary,
        notes: r.notes ?? null,
        timeline: r.timeline ?? null,
        payment_terms: r.payment_terms ?? state.payment_terms,
        warranty_terms: r.warranty_terms ?? state.warranty_terms,
        sections: mergedSections,
        ...structuralDirty(state),
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
        ...structuralDirty(state),
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
