import { z } from 'zod'

// Runtime validation for saveEstimate's input (lib/actions/estimate.ts). This is a
// 'use server' action reachable directly via its RPC endpoint (bypassing the
// TypeScript client call site), so it's a real system boundary — malformed/oversized
// payloads must be rejected before they reach the totals engine or a DB write.
//
// GUARD-03 note: this validates SHAPE (types, bounds, enums), never business math —
// the totals engine (computeEstimateTotals) stays the single source of truth for
// subtotal/tax/discount/total. A value that passes here can still be logically
// nonsensical (e.g. a $0 line item); that's a product decision, not a schema concern.

const MAX_TEXT = 20_000 // summary/notes/timeline/terms — generous, bounds abuse only
const MAX_SHORT_TEXT = 500 // titles, units, estimate_number
const MAX_ID_LEN = 200 // DB uuid or 'temp-' + crypto.randomUUID()
const MAX_SECTIONS = 200
const MAX_ITEMS_PER_SECTION = 500

// DB/editor domain (see use-estimate-reducer.ts) — NOT the engine's internal
// 'percent'|'amount'|'none' domain; saveEstimate maps between the two.
const discountTypeSchema = z.enum(['percentage', 'fixed']).nullable()
const depositTypeSchema = z.enum(['none', 'percent', 'amount']).nullable()
const taxCategorySchema = z.enum(['labor', 'materials', 'other']).nullable()
const priceSourceSchema = z.enum(['price_book', 'ai_estimate', 'researched']).nullable()

const saveItemSchema = z.object({
  id: z.string().min(1).max(MAX_ID_LEN),
  description: z.string().max(MAX_TEXT),
  quantity: z.number().finite(),
  unit: z.string().max(MAX_SHORT_TEXT).nullable(),
  unit_price: z.number().finite(),
  sort_order: z.number().int(),
  price_source: priceSourceSchema,
  isManuallyEdited: z.boolean().optional(),
  // v4.11 advanced pricing — all OPTIONAL, mirroring the no-op-default reducer/service
  // contract (absence means "not set," resolved downstream via `?? true` / `?? 0`).
  taxable: z.boolean().optional(),
  tax_category: taxCategorySchema.optional(),
  discount: z.number().finite().optional(),
  cost: z.number().finite().nullable().optional(),
  markup_pct: z.number().finite().nullable().optional(),
})

const saveSectionSchema = z.object({
  id: z.string().min(1).max(MAX_ID_LEN),
  title: z.string().max(MAX_SHORT_TEXT),
  sort_order: z.number().int(),
  items: z.array(saveItemSchema).max(MAX_ITEMS_PER_SECTION),
})

// Mirrors lib/estimate/presentation-settings.ts's PresentationSettings — a pure
// pass-through JSONB blob (GUARD-03: never read by the totals engine), so this only
// guards the SHAPE persisted, not any pricing math. Exported: Phase 164 Plan 02's
// savePresentationSettings (lib/actions/estimate.ts) is ALSO a 'use server' action
// reachable directly via its RPC endpoint (same boundary concern as saveEstimate
// above) and reuses this schema rather than duplicating it.
export const presentationSettingsSchema = z
  .object({
    sections: z
      .object({
        summary: z.boolean().optional(),
        sections: z.boolean().optional(),
        payment_terms: z.boolean().optional(),
        timeline: z.boolean().optional(),
        warranty_terms: z.boolean().optional(),
        notes: z.boolean().optional(),
        photos: z.boolean().optional(),
      })
      .optional(),
    tax: z
      .object({
        mode: z.enum(['default', 'custom', 'off']),
        customRate: z.number().finite().nullable().optional(),
        preservedRate: z.number().finite().nullable().optional(),
      })
      .optional(),
    discount: z
      .object({
        enabled: z.boolean(),
        type: z.enum(['amount', 'percent']).nullable().optional(),
        value: z.number().finite().nullable().optional(),
      })
      .optional(),
    deposit: z
      .object({
        enabled: z.boolean(),
        type: z.enum(['amount', 'percent']).nullable().optional(),
        value: z.number().finite().nullable().optional(),
      })
      .optional(),
  })
  .nullable()

export const saveEstimateSchema = z.object({
  // Not `.uuid()`: the estimates.id column is a Postgres UUID, so a non-UUID value
  // fails at the DB layer anyway (no extra protection from a stricter format check
  // here) — this just bounds type/length at the request boundary.
  id: z.string().min(1).max(MAX_ID_LEN),
  summary: z.string().max(MAX_TEXT).nullable(),
  notes: z.string().max(MAX_TEXT).nullable(),
  timeline: z.string().max(MAX_TEXT).nullable(),
  payment_terms: z.string().max(MAX_TEXT).nullable(),
  warranty_terms: z.string().max(MAX_TEXT).nullable(),
  discount_type: discountTypeSchema,
  discount_value: z.number().finite().min(0),
  tax_rate: z.number().finite().min(0),
  sections: z.array(saveSectionSchema).max(MAX_SECTIONS),
  estimate_date: z.string().max(40).nullable(),
  estimate_number: z.string().max(MAX_SHORT_TEXT).nullable(),
  // v4.11 deposit — OPTIONAL with no-op defaults (retrocompat: 'none' / null).
  deposit_type: depositTypeSchema.optional(),
  deposit_value: z.number().finite().nullable().optional(),
  presentation_settings: presentationSettingsSchema.optional(),
  expectedUpdatedAt: z.string().min(1).max(60).optional(),
})

export type SaveEstimateInput = z.infer<typeof saveEstimateSchema>
