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
// SAVE-06 (audit B7): 200×500 = 100k items was a sequential-write DoS shape
// (each item is its own insert/update round-trip inside the write). Lowered
// to a generous-but-bounded 60×200 = 12k — no legitimate estimate approaches
// this; a real construction estimate rarely exceeds a few dozen line items.
const MAX_SECTIONS = 60
const MAX_ITEMS_PER_SECTION = 200

// DB/editor domain (see use-estimate-reducer.ts) — NOT the engine's internal
// 'percent'|'amount'|'none' domain; saveEstimate maps between the two.
// Widened (quick-260728-6ts) beyond the editor's own 'percentage'/'fixed'
// spellings: the reducer (use-estimate-reducer.ts:53,318) passes the raw DB
// discount_type value straight into editor state with NO runtime
// normalization (the `as 'percentage'|'fixed'|null` cast at line 132 is
// compile-time only), so a client save payload can legitimately carry
// 'amount' (written directly by generate-estimate.ts:554 for every
// AI-generated estimate with a discount) or, defensively, 'percent' (the
// totals engine's own internal spelling, in case it ever round-trips back
// into this domain). Without this widening, safeParse() rejects the whole
// payload for any AI-generated estimate carrying an untouched discount.
const discountTypeSchema = z.enum(['percentage', 'fixed', 'amount', 'percent']).nullable()
const depositTypeSchema = z.enum(['none', 'percent', 'amount']).nullable()
const taxCategorySchema = z.enum(['labor', 'materials', 'other']).nullable()
const priceSourceSchema = z.enum(['price_book', 'ai_estimate', 'researched']).nullable()

// SAVE-06 (audit B7): quantity/unit_price/discount/cost/markup_pct previously
// accepted negatives (finite-only) — a negative quantity or unit_price can
// invert a line's contribution to subtotal/tax in ways the UI never
// intends, and a negative discount/markup effectively becomes a hidden
// surcharge. Reject negatives outright; no credit-line use case exists
// today that needs a negative line (a refund/credit line, if ever added,
// should be its own explicit feature, not a side-effect of loose bounds).
const saveItemSchema = z.object({
  id: z.string().min(1).max(MAX_ID_LEN),
  description: z.string().max(MAX_TEXT),
  quantity: z.number().finite().min(0),
  unit: z.string().max(MAX_SHORT_TEXT).nullable(),
  unit_price: z.number().finite().min(0),
  sort_order: z.number().int(),
  price_source: priceSourceSchema,
  isManuallyEdited: z.boolean().optional(),
  // v4.11 advanced pricing — all OPTIONAL, mirroring the no-op-default reducer/service
  // contract (absence means "not set," resolved downstream via `?? true` / `?? 0`).
  taxable: z.boolean().optional(),
  tax_category: taxCategorySchema.optional(),
  discount: z.number().finite().min(0).optional(),
  cost: z.number().finite().min(0).nullable().optional(),
  markup_pct: z.number().finite().min(0).nullable().optional(),
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
  // BILL-CONSTRAINT-01 (FIX 1): non-negative — a negative deposit_value previously
  // inverted balance_due (e.g. deposit_type='amount', value=-500 on a $1,000
  // estimate persisted balance_due=$1,500). The percent-type upper bound (<=100)
  // is enforced below via superRefine, not here — 100 is only meaningful when
  // deposit_type is 'percent' (an 'amount' deposit_value of, say, 5000 is
  // perfectly valid on a $10,000 estimate and is instead clamped against the
  // grand total downstream by computeEstimateTotals, since the total is not
  // known at this schema boundary).
  deposit_type: depositTypeSchema.optional(),
  deposit_value: z.number().finite().min(0).nullable().optional(),
  presentation_settings: presentationSettingsSchema.optional(),
  expectedUpdatedAt: z.string().min(1).max(60).optional(),
}).superRefine((data, ctx) => {
  // BILL-CONSTRAINT-01 (FIX 1): deposit_type 'percent' caps deposit_value at 100.
  // Without this, deposit_type='percent' + deposit_value=150 on a $1,000 estimate
  // rendered "Deposit −$1,500 / Balance $0" in the editor, the share doc rendered
  // "$1,000 / $0", and the invoice charged the full $1,000 — three surfaces
  // disagreeing on what a >100% deposit even means. Reject it at the boundary
  // instead. A no-op when deposit_type isn't 'percent' or deposit_value is unset.
  if (
    data.deposit_type === 'percent' &&
    typeof data.deposit_value === 'number' &&
    data.deposit_value > 100
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'deposit_value must be 100 or less when deposit_type is "percent"',
      path: ['deposit_value'],
    })
  }
})

export type SaveEstimateInput = z.infer<typeof saveEstimateSchema>
