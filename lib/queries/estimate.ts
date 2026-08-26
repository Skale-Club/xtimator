import type { SupabaseClient } from '@supabase/supabase-js'
import type { Photo } from './photo'
import { getEstimatePhotos } from './estimate-photo'
import type { PresentationSettings } from '@/lib/estimate/presentation-settings'
import { requireServiceClient } from '@/lib/supabase/service'
import { loadLatestSignedSnapshot } from '@/lib/queries/estimate-signature'
import { applySignedCompanyTermsValue } from '@/lib/estimate/signed-snapshot'
import type { DocumentSignature } from '@/lib/estimate/document/model'

export interface Estimate {
  id: string
  project_id: string
  company_id: string
  currency_code?: string
  version: number
  /** Per-company sequential identifier, auto-assigned. Unique across the tenant. */
  estimate_seq: number
  /** Optional user-set override displayed instead of the auto sequence. */
  estimate_number: string | null
  /** Optional user-set override for the displayed estimate date. */
  estimate_date: string | null
  is_current: boolean
  share_token: string
  /** Phase 160 (PUBURL-01/03): second, independent friendly-URL token. NULL until backfilled. */
  public_slug_token: string | null
  status: string
  /** Phase 52 (SEED-016): target language for this estimate. Defaults to 'en'. */
  language: 'en' | 'pt' | 'es'
  summary: string | null
  notes: string | null
  timeline: string | null
  payment_terms: string | null
  warranty_terms: string | null
  subtotal: number
  discount_type: string | null
  discount_value: number
  discount_amount: number
  tax_rate: number
  tax_amount: number
  total: number
  /** Phase 129 deposit columns (migration 20260627000001). Persisted by the server;
   *  renderers READ these via deriveDepositDisplay() — never recompute (GUARD-03). */
  deposit_type: 'none' | 'percent' | 'amount' // NOT NULL DEFAULT 'none'
  deposit_value: number | null // raw % or $ entered (nullable)
  balance_due: number | null // total − deposit; null on legacy rows
  sent_at: string | null
  viewed_at: string | null
  responded_at: string | null
  /** Phase 193 engagement counters (migration 20260825000001). viewed_at above
   *  stays the FIRST view; these two track every subsequent open. Written only
   *  by bump_estimate_view_count() so they never restamp updated_at. */
  view_count: number
  last_viewed_at: string | null
  /** Phase 193: scrypt hash of the optional share-link password. NULL = open link. */
  share_password_hash: string | null
  share_password_set_at: string | null
  client_response: string | null
  created_at: string
  updated_at: string
  payment_status?: string | null
  paid_at?: string | null
  payment_amount_cents?: number | null
  /** User who created this estimate — drives "Prepared by" in PDFs. */
  created_by_user_id?: string | null
  /** Phase 161 (PRESENT-01): dormant-first JSONB. NULL = today's behavior (all
   *  sections visible, no tax/discount/deposit overrides). Read EXCLUSIVELY
   *  through lib/estimate/presentation-settings.ts's resolvePresentationSettings()
   *  -- never by ad hoc field checks (PRESENT-04). */
  presentation_settings: PresentationSettings | null
}

export interface EstimateSection {
  id: string
  estimate_id: string
  company_id: string
  title: string
  sort_order: number
  subtotal: number
}

export interface EstimateItem {
  id: string
  section_id: string
  company_id: string
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  total: number
  sort_order: number
  price_source: 'price_book' | 'ai_estimate' | 'researched' | null
}

export interface EstimateWithSections extends Estimate {
  sections: (EstimateSection & { items: EstimateItem[] })[]
  attachedPhotos: Photo[]
  /** Phase 164 Plan 02 (TRUST-02) — whether ANY estimate_signatures row exists
   *  for this estimate. Part of the lock-coverage surface the editor needs to
   *  render the lock banner/read-only state (the signed-but-unresponded
   *  window means sent_at/client_response alone are not sufficient — see
   *  lib/estimate/lock.ts's doc comment). Optional: computed here, not a raw
   *  DB column, so existing manual EstimateWithSections literals elsewhere
   *  (tests, etc.) are unaffected. */
  hasSignature?: boolean
  /** Phase 183 Plan 02 (PDFPAR-02) — signature-display data (signer name,
   *  signed date, signature image), sourced from the same widened
   *  loadLatestSignedSnapshot query as hasSignature above. Optional, same
   *  discipline: computed here, not a raw DB column. null = unsigned. */
  signature?: DocumentSignature | null
  /** TRUST-01 v2 (security-hardening S1) — the frozen company Terms & Conditions
   *  captured in a v2 signed_content snapshot. The workspace editor page builds
   *  its DocumentCompany from its OWN companies query (app/(app)/projects/[id]/
   *  page.tsx), bypassing getEstimateWithContext's overlay — so the frozen terms
   *  must travel with the estimate for that surface to override them. null =
   *  unsigned or v1/legacy snapshot: render live company terms, today's behavior. */
  signedCompanyTerms?: { enabled: boolean; text: string | null } | null
}

export async function getProjectEstimates(
  supabase: SupabaseClient,
  projectId: string
): Promise<Estimate[]> {
  const { data } = await supabase
    .from('estimates')
    .select('*')
    .eq('project_id', projectId)
    .order('version', { ascending: false })

  return (data ?? []) as Estimate[]
}

export async function getCurrentEstimate(
  supabase: SupabaseClient,
  projectId: string
): Promise<EstimateWithSections | null> {
  const { data: estimate } = await supabase
    .from('estimates')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_current', true)
    .single()

  if (!estimate) return null

  return fetchEstimateWithSections(supabase, estimate as Estimate)
}

export async function getEstimateById(
  supabase: SupabaseClient,
  estimateId: string
): Promise<EstimateWithSections | null> {
  const { data: estimate } = await supabase
    .from('estimates')
    .select('*')
    .eq('id', estimateId)
    .single()

  if (!estimate) return null

  return fetchEstimateWithSections(supabase, estimate as Estimate)
}

export async function getEstimateWithContext(
  supabase: SupabaseClient,
  estimateId: string
) {
  const estimate = await getEstimateById(supabase, estimateId)
  if (!estimate) return null

  // The project and company selects are independent — fetch them in parallel.
  const [{ data: project }, { data: company }] = await Promise.all([
    supabase
      .from('projects')
      .select(
        'name, project_type, client:clients(name, email, phone, address, city, state, zip)'
      )
      .eq('id', estimate.project_id)
      .single(),
    supabase
      .from('companies')
      .select(
        'name, owner_name, phone, email, website, address, city, state, zip, logo_url, brand_primary_color, estimate_terms_enabled, estimate_terms_text, estimate_template_style'
      )
      .eq('id', estimate.company_id)
      .single(),
  ])

  // TRUST-01 v2 (security-hardening S1): freeze the company Terms & Conditions
  // block for a v2-signed estimate the same way applySignedSnapshot already
  // freezes estimate content.
  //
  // Fix-pack F1 (finding #6): this used to issue its OWN, second, sequential
  // loadLatestSignedSnapshot call here just to reach the nested
  // signed_content.company_terms field — re-fetching the same big
  // signed_content + signature_data columns that getEstimateById (via
  // fetchEstimateWithSections, above) had ALREADY loaded concurrently and
  // surfaced as estimate.signedCompanyTerms. Overlay from that already-loaded
  // value instead — same REPLACE-not-merge semantics as applySignedCompanyTerms
  // (applySignedCompanyTermsValue is its sibling that takes the extracted
  // value directly), zero extra queries. A v1/no signature is
  // signedCompanyTerms == null: no-op, renders live terms (today's behavior).
  const frozenCompany = company
    ? applySignedCompanyTermsValue(company, estimate.signedCompanyTerms)
    : company

  return { estimate, project, company: frozenCompany }
}

async function fetchEstimateWithSections(
  supabase: SupabaseClient,
  estimate: Estimate
): Promise<EstimateWithSections> {
  // Single query: fetch every section with its items embedded via the
  // estimate_items.section_id FK, replacing the prior N+1 (one items query per
  // section). Both levels are ordered by sort_order.
  //
  // Phase 164 Plan 02 (TRUST-02) / Phase 183 Plan 02 (PDFPAR-02): the
  // signature lookup runs CONCURRENTLY in the same Promise.all — an indexed
  // query (idx_estimate_signatures_estimate_id) via the same shared, widened
  // loadLatestSignedSnapshot the PDF resolver and share.ts use, so it adds
  // no wall-clock latency to this already-parallel fetch and never drifts
  // from those other 2 surfaces. Every caller of getEstimateById /
  // getCurrentEstimate gets both hasSignature and the full signature-display
  // fields for free, matching the "one shared query, no duplicated logic"
  // discipline Plan 01 established for the signed-content overlay.
  const [{ data: sectionsData }, attachedPhotos, signatureSnapshotRow] = await Promise.all([
    supabase
      .from('estimate_sections')
      .select('*, items:estimate_items(*)')
      .eq('estimate_id', estimate.id)
      .order('sort_order', { ascending: true })
      .order('sort_order', { foreignTable: 'estimate_items', ascending: true }),
    getEstimatePhotos(supabase, estimate.id),
    // requireServiceClient() (not this function's `supabase` param, which may
    // be an authenticated non-service client) — mirrors
    // render-estimate-pdf.ts's exact pattern for the same query.
    loadLatestSignedSnapshot(requireServiceClient(), estimate.id),
  ])

  const sections = (sectionsData ?? []) as unknown as (EstimateSection & {
    items: EstimateItem[] | null
  })[]

  return {
    ...estimate,
    sections: sections.map((section) => ({
      ...section,
      items: (section.items ?? []) as EstimateItem[],
    })),
    attachedPhotos,
    hasSignature: signatureSnapshotRow != null,
    signature:
      signatureSnapshotRow?.signer_name && signatureSnapshotRow?.signature_data
        ? {
            signerName: signatureSnapshotRow.signer_name,
            signedAt: signatureSnapshotRow.signed_at,
            signatureDataUrl: signatureSnapshotRow.signature_data,
          }
        : null,
    signedCompanyTerms: signatureSnapshotRow?.signed_content?.company_terms ?? null,
  }
}
