/**
 * Canonical Estimate Profile field map.
 *
 * Single source of truth that classifies every field involved in the
 * company-profile → estimate relationship. Produced by the R1 audit and locked
 * in R3 of the "Estimate Profile & Company Defaults" project. The companion
 * human-readable write-up lives in `docs/estimate-profile-defaults.md`.
 *
 * Categories:
 *  - `default-with-override` — a company default that pre-fills a per-estimate
 *    value at creation. The estimate keeps its own copy, so editing the company
 *    default never mutates existing estimates, and each estimate may diverge
 *    ("override") from the default. The live document surfaces this with an
 *    override-vs-default indicator (see EstimateDocument / CompanyDefaults).
 *  - `profile-only` — company/profile configuration that drives rendering or
 *    business logic but is never copied onto an estimate row.
 *  - `per-estimate-only` — an estimate column with no company-level default.
 *
 * Rule of the source project: do not invent defaults. Every entry below is
 * grounded in code (migrations, lib/actions/estimate.ts, lib/services/
 * generate-estimate.ts, lib/i18n/resolve-estimate-language.ts).
 */

export type ProfileFieldCategory =
  | 'default-with-override'
  | 'profile-only'
  | 'per-estimate-only'

export interface ProfileFieldMapping {
  /** Stable concept key. */
  key: string
  category: ProfileFieldCategory
  /** `companies` column that holds the default, if any. */
  companyColumn: string | null
  /** `estimates` column that holds the per-estimate value, if any. */
  estimateColumn: string | null
  /** Whether inheritance/propagation is actually wired today. */
  inherited: boolean
  notes: string
}

export const ESTIMATE_PROFILE_FIELD_MAP: readonly ProfileFieldMapping[] = [
  // ── default-with-override ────────────────────────────────────────────────
  {
    key: 'tax_rate',
    category: 'default-with-override',
    companyColumn: 'default_tax_rate',
    estimateColumn: 'tax_rate',
    inherited: true,
    notes: 'NUMERIC(5,4). Copied at creation in both paths (createBlankEstimate and generateEstimateForProject). Override indicator + reset wired in EstimateDocument.',
  },
  {
    key: 'payment_terms',
    category: 'default-with-override',
    companyColumn: 'default_payment_terms',
    estimateColumn: 'payment_terms',
    inherited: true,
    notes: 'Copied at creation. In the AI path the model may emit its own value; falls back to the company default when absent. Override indicator + reset wired in EstimateDocument.',
  },
  {
    key: 'warranty_terms',
    category: 'default-with-override',
    companyColumn: 'default_warranty_terms',
    estimateColumn: 'warranty_terms',
    inherited: true,
    notes: 'Copied at creation. Same AI-override-then-fallback behavior as payment_terms. Override indicator + reset wired in EstimateDocument.',
  },
  {
    key: 'currency_code',
    category: 'default-with-override',
    companyColumn: 'currency_code',
    estimateColumn: 'currency_code',
    inherited: true,
    notes: 'Copied at creation (normalized). Not exposed as a per-estimate override in the document UI today, but stored per estimate so historical estimates stay stable.',
  },
  {
    key: 'language',
    category: 'default-with-override',
    companyColumn: 'default_estimate_language',
    estimateColumn: 'language',
    inherited: true,
    notes: "estimates.language is NOT NULL DEFAULT 'en'. Resolved through a cascade (estimate override → client preferred → company default → user app language → 'en') at generation time rather than a direct column copy. Edited via the company settings form, not the Estimate Defaults tab.",
  },

  // ── profile-only ─────────────────────────────────────────────────────────
  {
    key: 'validity_days',
    category: 'profile-only',
    companyColumn: 'default_validity_days',
    estimateColumn: null,
    inherited: false,
    notes: 'ORPHANED: the column exists (INTEGER DEFAULT 30) but no estimates.valid_until / validity column exists and no code path reads it. Editable in the Estimate Defaults form but currently has no downstream effect.',
  },
  {
    key: 'estimate_template_greeting',
    category: 'profile-only',
    companyColumn: 'estimate_template_greeting',
    estimateColumn: null,
    inherited: false,
    notes: 'Cover-letter template fragment applied at render time; not stored on the estimate row.',
  },
  {
    key: 'estimate_template_opener',
    category: 'profile-only',
    companyColumn: 'estimate_template_opener',
    estimateColumn: null,
    inherited: false,
    notes: 'Cover-letter template fragment applied at render time; not stored on the estimate row.',
  },
  {
    key: 'estimate_template_closer',
    category: 'profile-only',
    companyColumn: 'estimate_template_closer',
    estimateColumn: null,
    inherited: false,
    notes: 'Cover-letter template fragment applied at render time; not stored on the estimate row.',
  },
  {
    key: 'estimate_template_signature',
    category: 'profile-only',
    companyColumn: 'estimate_template_signature',
    estimateColumn: null,
    inherited: false,
    notes: 'Cover-letter template fragment applied at render time; not stored on the estimate row.',
  },
  {
    key: 'estimate_terms',
    category: 'profile-only',
    companyColumn: 'estimate_terms_text',
    estimateColumn: null,
    inherited: false,
    notes: 'Gated by estimate_terms_enabled. Rendered from the company profile at view/PDF time; not copied to the estimate row.',
  },
  {
    key: 'digital_signature_enabled',
    category: 'profile-only',
    companyColumn: 'digital_signature_enabled',
    estimateColumn: null,
    inherited: false,
    notes: 'Delivery/signature feature toggle. Affects the share/sign flow, not an estimate column.',
  },
  {
    key: 'email_delivery_enabled',
    category: 'profile-only',
    companyColumn: 'email_delivery_enabled',
    estimateColumn: null,
    inherited: false,
    notes: 'Delivery feature toggle. Affects send options, not an estimate column.',
  },
  {
    key: 'sms_delivery_enabled',
    category: 'profile-only',
    companyColumn: 'sms_delivery_enabled',
    estimateColumn: null,
    inherited: false,
    notes: 'Delivery feature toggle. Affects send options, not an estimate column.',
  },

  // ── per-estimate-only ────────────────────────────────────────────────────
  {
    key: 'estimate_date',
    category: 'per-estimate-only',
    companyColumn: null,
    estimateColumn: 'estimate_date',
    inherited: false,
    notes: 'User-editable display date. No company default.',
  },
  {
    key: 'estimate_number',
    category: 'per-estimate-only',
    companyColumn: null,
    estimateColumn: 'estimate_number',
    inherited: false,
    notes: 'User-editable override for the displayed number. Distinct from estimate_seq.',
  },
  {
    key: 'estimate_seq',
    category: 'per-estimate-only',
    companyColumn: null,
    estimateColumn: 'estimate_seq',
    inherited: false,
    notes: 'System-assigned per-company sequence (set by the set_estimate_seq trigger on INSERT). Not derived from a company default.',
  },
  {
    key: 'summary',
    category: 'per-estimate-only',
    companyColumn: null,
    estimateColumn: 'summary',
    inherited: false,
    notes: 'AI-generated or user-entered. No company default.',
  },
  {
    key: 'notes',
    category: 'per-estimate-only',
    companyColumn: null,
    estimateColumn: 'notes',
    inherited: false,
    notes: 'User-entered. No company default.',
  },
  {
    key: 'timeline',
    category: 'per-estimate-only',
    companyColumn: null,
    estimateColumn: 'timeline',
    inherited: false,
    notes: 'AI-generated or user-entered. No company default.',
  },
  {
    key: 'discount',
    category: 'per-estimate-only',
    companyColumn: null,
    estimateColumn: 'discount_type',
    inherited: false,
    notes: 'discount_type + discount_value. User-entered per estimate. No company default.',
  },
  {
    key: 'status',
    category: 'per-estimate-only',
    companyColumn: null,
    estimateColumn: 'status',
    inherited: false,
    notes: "Lifecycle status (DEFAULT 'draft'). No company default.",
  },
  {
    key: 'workflow_status',
    category: 'per-estimate-only',
    companyColumn: null,
    estimateColumn: 'workflow_status',
    inherited: false,
    notes: "Draft/consolidated workflow state (DEFAULT 'draft'). No company default.",
  },
]

/** Fields that pre-fill a per-estimate value from a company default at creation. */
export const DEFAULT_WITH_OVERRIDE_FIELDS = ESTIMATE_PROFILE_FIELD_MAP.filter(
  (f) => f.category === 'default-with-override'
)
