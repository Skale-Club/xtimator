import { requireServiceClient } from '@/lib/supabase/service'
import type {
  Estimate,
  EstimateSection,
  EstimateItem,
  EstimateWithSections,
} from '@/lib/queries/estimate'
import { getEstimatePhotos } from '@/lib/queries/estimate-photo'
import { serverStorage } from '@/lib/storage/server'
import { toMinorUnits } from '@/lib/money/currency'
import { isShareLinkExpired } from '@/lib/estimates/share-link'
import { applySignedSnapshot, applySignedCompanyTerms } from '@/lib/estimate/signed-snapshot'
import { loadLatestSignedSnapshot } from '@/lib/queries/estimate-signature' // local binding for share.ts's own 2 call sites

// Internal fields never sent to the public browser payload: share_token is a
// bearer credential the viewer already holds. attachedPhotos is also omitted
// here and redeclared below with a signed `url` — the raw Photo rows (with
// storage_path only) never leave the server; anon visitors have no session
// to resolve their own signed URLs with.
export type ShareEstimate = Omit<
  EstimateWithSections,
  'share_token' | 'attachedPhotos'
>

export interface ShareEstimateData {
  estimate: ShareEstimate & {
    project: { name: string; project_type: string | null }
    company: {
      id: string
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
      // notify_on_* flags are internal prefs — intentionally NOT exposed to the
      // public share payload (used only server-side by logEstimateView/respond).
      stripe_account_id: string | null
      stripe_connect_status: string | null
      digital_signature_enabled: boolean
      estimate_terms_enabled: boolean
      estimate_terms_text: string | null
      estimate_template_style: string
    }
    /** Phase 70 — Stripe Connect payment state. */
    payment_status: string
    /** Derived from `estimate.total` (dollars) — Math.round(total * 100). */
    total_amount_cents: number
    stripe_checkout_session_id: string | null
    paid_at: string | null
    payment_amount_cents: number | null
    /**
     * Phase 94 — issued invoices for this estimate, exposed to the client so they
     * can pay open invoices from the share link. Only the safe fields are surfaced
     * (no stripe_customer_id / stripe_invoice_id). Filtered to open/paid status.
     */
    invoices: {
      id: string
      kind: string
      amount_cents: number
      currency_code: string
      status: string
      hosted_invoice_url: string | null
    }[]
    /** Optional per-estimate-version photo attachments, with signed URLs pre-resolved server-side (anon visitors have no session). */
    attachedPhotos: {
      id: string
      storage_path: string
      caption: string | null
      url: string
    }[]
    /** PDFPAR-02 — signature-display data, threaded from loadLatestSignedSnapshot.
     *  All 3 null together = unsigned estimate (no signature block rendered). */
    signerName: string | null
    signedAt: string | null
    signatureImageDataUrl: string | null
  }
  client: {
    // Phase 162-02 (DOCUX-02) — required by the widened DocumentClient
    // interface so the share renderer can construct a DocumentClient literal
    // without a type error. Not rendered in the share view today, but the
    // shared interface makes it mandatory.
    id: string
    name: string
    email: string | null
    phone: string | null
    address: string | null
    city: string | null
    state: string | null
    zip: string | null
  } | null
}

export async function getEstimateByShareToken(
  token: string
): Promise<ShareEstimateData | null> {
  const supabase = requireServiceClient()

  // Look up estimate by share_token
  const { data: estimateData } = await supabase
    .from('estimates')
    .select('*')
    .eq('share_token', token)
    .single()

  if (!estimateData) return null

  // Security: expired share links serve NO data (no PII built or returned).
  // The page distinguishes "expired" from "missing" via getShareLinkState().
  const shareExpiresAt =
    (estimateData as { share_expires_at?: string | null }).share_expires_at ?? null
  if (isShareLinkExpired(shareExpiresAt)) {
    return null
  }

  const estimate = estimateData as Estimate

  // Fetch sections with items (same pattern as fetchEstimateWithSections)
  const { data: sectionsData } = await supabase
    .from('estimate_sections')
    .select('*')
    .eq('estimate_id', estimate.id)
    .order('sort_order', { ascending: true })

  const sections = (sectionsData ?? []) as EstimateSection[]

  const sectionsWithItems = await Promise.all(
    sections.map(async (section) => {
      const { data: itemsData } = await supabase
        .from('estimate_items')
        .select('*')
        .eq('section_id', section.id)
        .order('sort_order', { ascending: true })

      return {
        ...section,
        items: (itemsData ?? []) as EstimateItem[],
      }
    })
  )

  // Attached photos for this estimate version, with signed URLs resolved
  // server-side (this requireServiceClient() instance bypasses RLS, so it
  // always succeeds regardless of anon/RLS status; anon visitors have no
  // session to resolve their own signed URLs with).
  const attachedPhotosRaw = await getEstimatePhotos(supabase, estimate.id)
  // Phase 188 (PROV-01): server-wide provider selection; Supabase mode keeps
  // this caller-supplied client and its RLS scoping.
  const storage = serverStorage(supabase)
  const attachedPhotos = await Promise.all(
    attachedPhotosRaw.map(async (photo) => ({
      id: photo.id,
      storage_path: photo.storage_path,
      caption: photo.caption,
      url: await storage.getSignedUrl('photos', photo.storage_path, 3600),
    }))
  )

  // TRUST-01: once a signature with a non-null snapshot exists, REPLACE the
  // enumerated rendered-content field set with the frozen snapshot — never
  // merge. Legacy signatures (signed_content IS NULL) fall through
  // unchanged (byte-identical retrocompat). Photo URLs, company branding,
  // and share metadata are NOT part of the overlay set and stay live (see
  // lib/estimate/signed-snapshot.ts's known-limitation doc comment).
  const signedSnapshotRow = await loadLatestSignedSnapshot(supabase, estimate.id)
  const signedContent = signedSnapshotRow?.signed_content ?? null

  // PDFPAR-02 — signature-display data. Both columns are NOT NULL on the
  // estimate_signatures table, so any existing row always has them; only a
  // null row (no signature at all) yields all-null. Deliberately NOT gated
  // on signed_content — that gate is for the TRUST-01 content overlay, a
  // separate concern; a legacy signature (signed_content: null) still has a
  // real signer_name/signature_data and must still show a signature block.
  const signerName = signedSnapshotRow?.signer_name ?? null
  const signedAt = signedSnapshotRow ? signedSnapshotRow.signed_at : null
  const signatureImageDataUrl = signedSnapshotRow?.signature_data ?? null

  const estimateWithSections: EstimateWithSections = applySignedSnapshot(
    {
      ...estimate,
      sections: sectionsWithItems,
      attachedPhotos: attachedPhotosRaw,
    },
    signedContent
  )

  // Fetch project + client
  const { data: projectData } = await supabase
    .from('projects')
    .select(
      'name, project_type, client_id, client:clients(id, name, email, phone, address, city, state, zip)'
    )
    .eq('id', estimate.project_id)
    .single()

  if (!projectData) return null

  // Fetch only the company fields the public document + pay button render.
  // notify_on_* prefs are deliberately excluded — they're internal and were
  // being serialized to anonymous viewers without ever being displayed.
  const { data: companyData } = await supabase
    .from('companies')
    .select(
      'id, name, owner_name, phone, email, website, address, city, state, zip, logo_url, brand_primary_color, stripe_account_id, stripe_connect_status, digital_signature_enabled, estimate_terms_enabled, estimate_terms_text, estimate_template_style'
    )
    .eq('id', estimate.company_id)
    .single()

  if (!companyData) return null

  // TRUST-01 v2 (security-hardening S1): a v2 signed snapshot freezes the
  // company Terms & Conditions block too — REPLACE (never merge) enabled +
  // text wholesale, same discipline as applySignedSnapshot above. A v1
  // snapshot or no signature at all is a no-op (renders live terms, today's
  // behavior).
  const companyDataFrozen = applySignedCompanyTerms(
    companyData as ShareEstimateData['estimate']['company'],
    signedContent
  )

  // Phase 94 — issued invoices for this estimate. Expose ONLY the 6 safe fields
  // the client pay-links need; stripe_customer_id / stripe_invoice_id are never
  // sent to the anonymous viewer. Filtered to open/paid (drafts/voids hidden).
  // Defensively coded: degrades to [] if the select chain is unavailable.
  type ShareInvoice = ShareEstimateData['estimate']['invoices'][number]
  let invoices: ShareInvoice[] = []
  try {
    const invoicesQuery = supabase
      .from('invoices')
      .select('id, kind, amount_cents, currency_code, status, hosted_invoice_url')
    const { data: invoiceRows } = (await invoicesQuery
      ?.eq?.('estimate_id', estimate.id)
      ?.in?.('status', ['open', 'paid'])) ?? { data: null }
    invoices = (invoiceRows ?? []) as ShareInvoice[]
  } catch {
    invoices = []
  }

  // Extract client from project join (Supabase returns it as array or object)
  // Phase 162-02 (DOCUX-02) — `id` widened onto the shape so ShareEstimateData
  // can carry it through to the shared DocumentClient interface.
  const clientRaw = projectData.client as
    | {
        id: string
        name: string
        email: string | null
        phone: string | null
        address: string | null
        city: string | null
        state: string | null
        zip: string | null
      }[]
    | {
        id: string
        name: string
        email: string | null
        phone: string | null
        address: string | null
        city: string | null
        state: string | null
        zip: string | null
      }
    | null

  const client = Array.isArray(clientRaw) ? clientRaw[0] ?? null : clientRaw

  // Phase 70 — surface payment fields and derive cents total from `estimate.total`
  // (which is stored in dollars as numeric). Use Math.round to avoid float drift.
  const estimateRaw = estimateData as Record<string, unknown>
  const payment_status =
    typeof estimateRaw.payment_status === 'string'
      ? (estimateRaw.payment_status as string)
      : 'unpaid'
  const stripe_checkout_session_id =
    (estimateRaw.stripe_checkout_session_id as string | null) ?? null
  const paid_at = (estimateRaw.paid_at as string | null) ?? null
  const payment_amount_cents =
    (estimateRaw.payment_amount_cents as number | null) ?? null
  // CRITICAL (TRUST-01): once a snapshot has been applied, the pay amount
  // must key off signed_total — never live estimate.total, which may have
  // drifted since signing. currency_code is read from the (possibly
  // overlaid) estimateWithSections so a signed estimate's pay amount is
  // computed in the currency that was frozen AT SIGNING time.
  const payoutDollars = signedContent
    ? (signedSnapshotRow?.signed_total ?? estimateWithSections.total)
    : estimate.total
  const totalDollars = Number(payoutDollars ?? 0)
  const total_amount_cents = Number.isFinite(totalDollars)
    ? toMinorUnits(totalDollars, estimateWithSections.currency_code)
    : 0

  // Strip internal fields from the estimate before it crosses to the client:
  // share_token (bearer credential), and the raw (no signed-URL) attachedPhotos
  // — replaced below with the signed-URL-resolved version.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { share_token: _shareToken, attachedPhotos: _rawAttachedPhotos, ...safeEstimate } =
    estimateWithSections

  return {
    estimate: {
      ...safeEstimate,
      project: {
        name: projectData.name as string,
        project_type: projectData.project_type as string | null,
      },
      company: companyDataFrozen,
      payment_status,
      total_amount_cents,
      stripe_checkout_session_id,
      paid_at,
      payment_amount_cents,
      invoices,
      // Override the raw (no-URL) attachedPhotos from safeEstimate with the
      // signed-URL-resolved version built above.
      attachedPhotos,
      signerName,
      signedAt,
      signatureImageDataUrl,
    },
    client,
  }
}

/**
 * Lightweight, PII-free check of a share link's state — used by the public page
 * to show a friendly "expired" message instead of a generic 404. Selects only
 * non-PII columns.
 */
export type ShareLinkState = 'active' | 'expired' | 'missing'

export async function getShareLinkState(token: string): Promise<ShareLinkState> {
  const supabase = requireServiceClient()
  const { data } = await supabase
    .from('estimates')
    .select('share_expires_at')
    .eq('share_token', token)
    .maybeSingle()

  if (!data) return 'missing'
  const exp = (data as { share_expires_at?: string | null }).share_expires_at ?? null
  if (isShareLinkExpired(exp)) return 'expired'
  return 'active'
}

/**
 * Sibling to getEstimateByShareToken, keyed by the friendly-URL
 * public_slug_token instead of share_token (PUBURL-01/03). Identical
 * service-role + exact-match + expiry-check + PII-stripping discipline --
 * see 20260606000002_drop_estimates_anon_select_policy.sql for the
 * vulnerability class this discipline avoids.
 *
 * CRITICAL (Pitfall 6 / PUBURL-05): exposes the estimate's REAL share_token
 * as `realShareToken` (server-side only) so the friendly route's page.tsx
 * can key logEstimateView/respondToEstimate/expiry checks off the SAME
 * value app/estimate/[token]/page.tsx already uses -- never off shortToken.
 */
export interface PublicTokenEstimateData extends ShareEstimateData {
  /** The estimate's real share_token, resolved server-side only for reuse
   *  by logEstimateView/respondToEstimate. NEVER render this into any
   *  client-visible field beyond what EstimateView already does with its
   *  `token` prop today. */
  realShareToken: string
}

export async function getEstimateByPublicToken(
  shortToken: string
): Promise<PublicTokenEstimateData | null> {
  const supabase = requireServiceClient()

  const { data: estimateData } = await supabase
    .from('estimates')
    .select('*')
    .eq('public_slug_token', shortToken)
    .single()

  if (!estimateData) return null

  const shareExpiresAt =
    (estimateData as { share_expires_at?: string | null }).share_expires_at ?? null
  if (isShareLinkExpired(shareExpiresAt)) {
    return null
  }

  const estimate = estimateData as Estimate
  const realShareToken = estimate.share_token

  const { data: sectionsData } = await supabase
    .from('estimate_sections')
    .select('*')
    .eq('estimate_id', estimate.id)
    .order('sort_order', { ascending: true })

  const sections = (sectionsData ?? []) as EstimateSection[]

  const sectionsWithItems = await Promise.all(
    sections.map(async (section) => {
      const { data: itemsData } = await supabase
        .from('estimate_items')
        .select('*')
        .eq('section_id', section.id)
        .order('sort_order', { ascending: true })

      return {
        ...section,
        items: (itemsData ?? []) as EstimateItem[],
      }
    })
  )

  const attachedPhotosRaw = await getEstimatePhotos(supabase, estimate.id)
  // Phase 188 (PROV-01): server-wide provider selection; Supabase mode keeps
  // this caller-supplied client and its RLS scoping.
  const storage = serverStorage(supabase)
  const attachedPhotos = await Promise.all(
    attachedPhotosRaw.map(async (photo) => ({
      id: photo.id,
      storage_path: photo.storage_path,
      caption: photo.caption,
      url: await storage.getSignedUrl('photos', photo.storage_path, 3600),
    }))
  )

  // TRUST-01: same REPLACE-not-merge overlay as getEstimateByShareToken —
  // see that function's comment for the full rationale.
  const signedSnapshotRow = await loadLatestSignedSnapshot(supabase, estimate.id)
  const signedContent = signedSnapshotRow?.signed_content ?? null

  // PDFPAR-02 — same signature-display derivation as getEstimateByShareToken.
  const signerName = signedSnapshotRow?.signer_name ?? null
  const signedAt = signedSnapshotRow ? signedSnapshotRow.signed_at : null
  const signatureImageDataUrl = signedSnapshotRow?.signature_data ?? null

  const estimateWithSections: EstimateWithSections = applySignedSnapshot(
    {
      ...estimate,
      sections: sectionsWithItems,
      attachedPhotos: attachedPhotosRaw,
    },
    signedContent
  )

  const { data: projectData } = await supabase
    .from('projects')
    .select(
      'name, project_type, client_id, client:clients(id, name, email, phone, address, city, state, zip)'
    )
    .eq('id', estimate.project_id)
    .single()

  if (!projectData) return null

  const { data: companyData } = await supabase
    .from('companies')
    .select(
      'id, name, owner_name, phone, email, website, address, city, state, zip, logo_url, brand_primary_color, stripe_account_id, stripe_connect_status, digital_signature_enabled, estimate_terms_enabled, estimate_terms_text, estimate_template_style'
    )
    .eq('id', estimate.company_id)
    .single()

  if (!companyData) return null

  // TRUST-01 v2 (security-hardening S1) — same overlay as
  // getEstimateByShareToken above; see that call site's comment for the
  // full rationale.
  const companyDataFrozen = applySignedCompanyTerms(
    companyData as ShareEstimateData['estimate']['company'],
    signedContent
  )

  type ShareInvoice = ShareEstimateData['estimate']['invoices'][number]
  let invoices: ShareInvoice[] = []
  try {
    const invoicesQuery = supabase
      .from('invoices')
      .select('id, kind, amount_cents, currency_code, status, hosted_invoice_url')
    const { data: invoiceRows } = (await invoicesQuery
      ?.eq?.('estimate_id', estimate.id)
      ?.in?.('status', ['open', 'paid'])) ?? { data: null }
    invoices = (invoiceRows ?? []) as ShareInvoice[]
  } catch {
    invoices = []
  }

  // Phase 162-02 (DOCUX-02) — `id` widened onto the shape so ShareEstimateData
  // can carry it through to the shared DocumentClient interface.
  const clientRaw = projectData.client as
    | { id: string; name: string; email: string | null; phone: string | null; address: string | null; city: string | null; state: string | null; zip: string | null }[]
    | { id: string; name: string; email: string | null; phone: string | null; address: string | null; city: string | null; state: string | null; zip: string | null }
    | null

  const client = Array.isArray(clientRaw) ? clientRaw[0] ?? null : clientRaw

  const estimateRaw = estimateData as Record<string, unknown>
  const payment_status =
    typeof estimateRaw.payment_status === 'string'
      ? (estimateRaw.payment_status as string)
      : 'unpaid'
  const stripe_checkout_session_id =
    (estimateRaw.stripe_checkout_session_id as string | null) ?? null
  const paid_at = (estimateRaw.paid_at as string | null) ?? null
  const payment_amount_cents =
    (estimateRaw.payment_amount_cents as number | null) ?? null
  // CRITICAL (TRUST-01): re-derive from signed_total, never live estimate.total
  // — see getEstimateByShareToken's identical comment for the full rationale.
  const payoutDollars = signedContent
    ? (signedSnapshotRow?.signed_total ?? estimateWithSections.total)
    : estimate.total
  const totalDollars = Number(payoutDollars ?? 0)
  const total_amount_cents = Number.isFinite(totalDollars)
    ? toMinorUnits(totalDollars, estimateWithSections.currency_code)
    : 0

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { share_token: _shareToken, attachedPhotos: _rawAttachedPhotos, ...safeEstimate } =
    estimateWithSections

  return {
    estimate: {
      ...safeEstimate,
      project: {
        name: projectData.name as string,
        project_type: projectData.project_type as string | null,
      },
      company: companyDataFrozen,
      payment_status,
      total_amount_cents,
      stripe_checkout_session_id,
      paid_at,
      payment_amount_cents,
      invoices,
      attachedPhotos,
      signerName,
      signedAt,
      signatureImageDataUrl,
    },
    client,
    realShareToken,
  }
}

/**
 * Sibling to getShareLinkState, keyed by public_slug_token instead of
 * share_token (PUBURL-01/05). Same PII-free column selection.
 */
export async function getShareLinkStateByPublicToken(
  shortToken: string
): Promise<ShareLinkState> {
  const supabase = requireServiceClient()
  const { data } = await supabase
    .from('estimates')
    .select('share_expires_at')
    .eq('public_slug_token', shortToken)
    .maybeSingle()

  if (!data) return 'missing'
  const exp = (data as { share_expires_at?: string | null }).share_expires_at ?? null
  if (isShareLinkExpired(exp)) return 'expired'
  return 'active'
}
