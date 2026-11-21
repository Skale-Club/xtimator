/**
 * Read paths for change orders that run on the server outside server actions
 * (server components, route handlers). Signatures are the contract in
 * lib/change-orders/types.ts; everything here uses the SERVICE client, so
 * callers must already be authorized (a share token, or the PDF route's check).
 */
import { resolveDigitalSignature } from '@/lib/features/company-features'
import 'server-only'
import { headers } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireServiceClient } from '@/lib/supabase/service'
import { buildEstimatePublicPath } from '@/lib/estimate/public-url'
import { assertCompanyWritable } from '@/lib/demo/guard'
import { isOwnerVisit } from '@/lib/estimates/owner-visit'
import { resolveClientIp } from '@/lib/http/client-ip'
import { rateLimit } from '@/lib/ratelimit'
import { isLikelyBotUserAgent } from '@/lib/security/bot-defense'
import { loadPublicContractSummary, resolveEstimateNumber } from './contract'
import { loadChangeOrder } from './load'
import type { ChangeOrderInvoice, ContractSummary, PublicChangeOrderData } from './types'

/**
 * The change order's own live invoice (open or paid), safe fields only: never
 * the Stripe customer or invoice ids. Paid wins over a newer open one.
 */
export async function loadChangeOrderInvoice(
  supabase: SupabaseClient,
  changeOrderId: string,
): Promise<ChangeOrderInvoice | null> {
  const { data } = await supabase
    .from('invoices')
    .select('id, status, amount_cents, currency_code, hosted_invoice_url, paid_at, refunded_cents, created_at')
    .eq('change_order_id', changeOrderId)
    .in('status', ['open', 'paid'])
    .order('created_at', { ascending: false })
  const rows = (data ?? []) as Array<{
    id: string
    status: 'open' | 'paid'
    amount_cents: number
    currency_code: string
    hosted_invoice_url: string | null
    paid_at: string | null
    refunded_cents: number | null
  }>
  const row = rows.find((r) => r.status === 'paid') ?? rows[0]
  if (!row) return null
  return {
    id: row.id,
    status: row.status,
    amount_cents: row.amount_cents,
    currency_code: row.currency_code,
    hosted_invoice_url: row.hosted_invoice_url ?? null,
    paid_at: row.paid_at ?? null,
    refunded_cents: row.refunded_cents ?? 0,
  }
}

async function loadPublicData(
  supabase: SupabaseClient,
  by: { id: string } | { token: string },
): Promise<PublicChangeOrderData | null> {
  const changeOrder = await loadChangeOrder(supabase, by)
  if (!changeOrder) return null

  const { data: estimateData } = await supabase
    .from('estimates')
    .select(
      'id, project_id, share_token, public_slug_token, estimate_number, estimate_seq, version, responded_at, language',
    )
    .eq('id', changeOrder.estimate_id)
    .maybeSingle()
  if (!estimateData) return null
  const estimate = estimateData as {
    id: string
    project_id: string
    share_token: string
    public_slug_token: string | null
    estimate_number: string | null
    estimate_seq: number | null
    version: number | null
    responded_at: string | null
    language: string | null
  }

  const [{ data: projectData }, { data: companyData }, contract] = await Promise.all([
    supabase
      .from('projects')
      .select('name, client:clients(name)')
      .eq('id', estimate.project_id)
      .maybeSingle(),
    supabase
      .from('companies')
      .select(
        'id, name, slug, logo_url, phone, email, brand_primary_color, digital_signature_allowed, digital_signature_enabled',
      )
      .eq('id', changeOrder.company_id)
      .maybeSingle(),
    loadPublicContractSummary(supabase, estimate.id, { allowEmpty: true }),
  ])
  if (!companyData) return null
  const invoice = await loadChangeOrderInvoice(supabase, changeOrder.id)

  const project = projectData as { name: string | null; client: { name: string | null } | { name: string | null }[] | null } | null
  const clientRel = Array.isArray(project?.client) ? project?.client[0] : project?.client
  const company = companyData as {
    id: string
    name: string
    slug: string | null
    logo_url: string | null
    phone: string | null
    email: string | null
    brand_primary_color: string | null
    digital_signature_allowed: boolean | null
    digital_signature_enabled: boolean | null
  }

  const estimateNumber = resolveEstimateNumber(estimate)

  return {
    changeOrder,
    company: {
      id: company.id,
      name: company.name,
      logo_url: company.logo_url ?? null,
      phone: company.phone ?? null,
      email: company.email ?? null,
      brand_primary_color: company.brand_primary_color ?? null,
      // EFFECTIVE value (platform switch AND tenant switch); `_allowed` is never exposed.
      digital_signature_enabled: resolveDigitalSignature(company).active,
    },
    estimate: {
      id: estimate.id,
      estimateNumber,
      projectName: project?.name ?? '',
      clientName: clientRel?.name ?? null,
      acceptedAt: estimate.responded_at,
      publicPath: buildEstimatePublicPath(
        { slug: company.slug ?? null, name: company.name },
        {
          id: estimate.id,
          public_slug_token: estimate.public_slug_token,
          share_token: estimate.share_token,
          project_name: project?.name ?? null,
        },
      ),
      language: estimate.language ?? 'en',
    },
    // Public contract card: drafts excluded. The current change order is always
    // part of the page data itself, so an unlisted one never breaks the view.
    contract:
      contract ?? {
        estimateId: estimate.id,
        currencyCode: changeOrder.currency_code,
        estimateNumber,
        acceptedAt: estimate.responded_at,
        signedOnline: false,
        baseTotal: 0,
        changeOrders: [],
        approvedTotal: 0,
        pendingTotal: 0,
        contractTotal: 0,
      },
    contractActive: contract !== null,
    invoice,
  }
}

/**
 * Client page data by share token (service client: the client is anonymous).
 * Bumps nothing. Returns null for an unknown token or a change order whose
 * parent estimate is gone.
 */
export async function getChangeOrderByShareToken(token: string): Promise<PublicChangeOrderData | null> {
  if (typeof token !== 'string' || !token) return null
  return loadPublicData(requireServiceClient(), { token })
}

/**
 * Contract summary for the accepted estimate's PUBLIC page (service client,
 * drafts excluded). null when the estimate is not accepted or has no change
 * orders worth showing.
 */
export async function getPublicContractSummary(estimateId: string): Promise<ContractSummary | null> {
  if (typeof estimateId !== 'string' || !estimateId) return null
  return loadPublicContractSummary(requireServiceClient(), estimateId)
}

/**
 * Records one client view of the change order page (view_count + viewed_at)
 * without restamping updated_at. Fire-and-forget; never throws.
 */
export async function recordChangeOrderView(token: string): Promise<void> {
  try {
    if (typeof token !== 'string' || !token) return

    let ip: string | null = null
    try {
      ip = resolveClientIp(await headers())
    } catch {
      ip = null
    }
    const rl = await rateLimit('trackEstimatePerMinute', ip ?? 'no-ip')
    if (!rl.allowed) return

    // A link-preview fetcher or scraper is not a client view.
    try {
      const ua = (await headers()).get('user-agent')
      if (ua && isLikelyBotUserAgent(ua)) return
    } catch {
      // Outside a request scope: no user agent to judge.
    }

    const supabase = requireServiceClient()
    const { data } = await supabase
      .from('change_orders')
      .select('id, company_id')
      .eq('share_token', token)
      .maybeSingle()
    if (!data) return
    const row = data as { id: string; company_id: string }

    if (await assertCompanyWritable(row.company_id)) return
    // The owner previewing their own link is not a client view.
    if (await isOwnerVisit(row.company_id)) return

    await supabase.rpc('bump_change_order_view', { p_token: token })
  } catch (err) {
    console.warn('[change-orders] recordChangeOrderView failed:', err)
  }
}

/**
 * Same shape as getChangeOrderByShareToken, loaded by id with the service
 * client, for the PDF route AFTER it has authorized the caller (owner session
 * of the same company, or the matching share token). Never expose it to a
 * caller that has not been authorized.
 */
export async function getChangeOrderDocumentById(id: string): Promise<PublicChangeOrderData | null> {
  if (typeof id !== 'string' || !id) return null
  return loadPublicData(requireServiceClient(), { id })
}
