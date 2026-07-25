import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProjectById, getProjectActivity, getProjectQuickStats } from '@/lib/queries/project'
import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import { getCurrentEstimate, getProjectEstimates } from '@/lib/queries/estimate'
import { getInvoicesByEstimateId } from '@/lib/queries/invoice'
import { getPriceBookItems } from '@/lib/queries/price-book'
import { paymentsEnabled } from '@/lib/billing/payments-enabled'
import { getEntitlementsForTier } from '@/lib/entitlements-server'
import { getWhatsAppAccountStatus } from '@/lib/whatsapp/account-registry'
import { ProjectWorkspace } from '@/components/workspace/project-workspace'
import { ProjectHeader } from '@/components/workspace/project-header'
import { ProjectPageShell } from '@/components/workspace/project-page-shell'
import { Skeleton } from '@/components/ui/skeleton'
import type { DocumentCompany, CompanyDefaults } from '@/components/workspace/estimate/estimate-document'

const ALLOWED_TABS = ['overview', 'client'] as const
type AllowedTab = (typeof ALLOWED_TABS)[number]

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; estimate?: string }>
}) {
  const { id } = await params
  const { tab: rawTab } = await searchParams
  const defaultTab: AllowedTab =
    (ALLOWED_TABS as readonly string[]).includes(rawTab ?? '')
      ? (rawTab as AllowedTab)
      : 'overview'

  const supabase = await createClient()

  const project = await getProjectById(supabase, id)

  if (!project) {
    console.error('[ProjectPage] notFound triggered', { id })
    notFound()
  }

  // Start remaining queries as unresolved promises (no await — passed to async sub-component)
  const activityPromise = getProjectActivity(supabase, id)
  const statsPromise = getProjectQuickStats(supabase, id)
  const recordingsPromise = getProjectRecordings(supabase, id)
  const photosPromise = getProjectPhotos(supabase, id)
  const allVersionsPromise = getProjectEstimates(supabase, id)

  return (
    <ProjectPageShell>
    <div className="flex min-h-full flex-col">
      <Suspense fallback={<ProjectWorkspaceSkeleton project={project} />}>
        <ProjectTabs
          project={project}
          activityPromise={activityPromise}
          statsPromise={statsPromise}
          recordingsPromise={recordingsPromise}
          photosPromise={photosPromise}
          allVersionsPromise={allVersionsPromise}
          defaultTab={defaultTab}
        />
      </Suspense>
    </div>
    </ProjectPageShell>
  )
}

type ProjectTabsProps = {
  project: Awaited<ReturnType<typeof getProjectById>> & {}
  activityPromise: ReturnType<typeof getProjectActivity>
  statsPromise: ReturnType<typeof getProjectQuickStats>
  recordingsPromise: ReturnType<typeof getProjectRecordings>
  photosPromise: ReturnType<typeof getProjectPhotos>
  allVersionsPromise: ReturnType<typeof getProjectEstimates>
  defaultTab: AllowedTab
}

async function ProjectTabs({
  project,
  activityPromise,
  statsPromise,
  recordingsPromise,
  photosPromise,
  allVersionsPromise,
  defaultTab,
}: ProjectTabsProps) {
  // Fetch company name + template fields + SMS flag for the Send tab. It only
  // needs project.company_id, so kick it off and resolve it in the SAME
  // Promise.all as the tab data instead of after it (was serial → now parallel).
  const supabase = await createClient()
  const companyPromise = supabase
    .from('companies')
    .select('name, owner_name, brand_primary_color, estimate_template_greeting, estimate_template_opener, estimate_template_closer, estimate_template_signature, sms_delivery_enabled, tier, logo_url, phone, email, website, address, city, state, zip, default_tax_rate, default_payment_terms, default_warranty_terms, stripe_account_id, stripe_connect_status')
    .eq('id', project.company_id)
    .single()

  const [activity, stats, recordings, photos, allVersions, { data: company }] = await Promise.all([
    activityPromise,
    statsPromise,
    recordingsPromise,
    photosPromise,
    allVersionsPromise,
    companyPromise,
  ])

  const companyName = (company?.name as string) ?? ''
  const ownerName = (company?.owner_name as string | null) ?? ''
  const companyBrandColor = (company?.brand_primary_color as string | null) ?? null
  const smsDeliveryEnabled = (company?.sms_delivery_enabled as boolean) ?? false

  // PAYGATE-01/02 — compute the single forward-looking payment gate server-side
  // from the company's Connect status, then thread the boolean down to the
  // editor so the Generate-invoice affordance only renders when payments are on.
  const canIssueInvoice = paymentsEnabled({
    stripe_account_id: (company?.stripe_account_id as string | null) ?? null,
    stripe_connect_status: (company?.stripe_connect_status as string | null) ?? null,
  })

  // Phase 163 (SENDHUB) — resolve WhatsApp availability into a single opaque
  // boolean for the Send hub. The tier entitlement is the coarse gate; the
  // account registry's `.active` is the fine gate (a configured, non-suspended
  // config row). Reuses the `tier` already selected in companyPromise — no extra
  // query for entitlements. Only the boolean crosses into the client tree; the
  // account status details (linked number, WABA id, provisioning) stay
  // server-side and never reach the browser. The short-circuit avoids the
  // registry read entirely when the tier doesn't include WhatsApp.
  const whatsappAvailable =
    (await getEntitlementsForTier((company?.tier as string | null) ?? 'free')).whatsappEnabled &&
    (await getWhatsAppAccountStatus(project.company_id)).active

  const estimateTemplate = {
    greeting: (company?.estimate_template_greeting as string | null) ?? null,
    opener: (company?.estimate_template_opener as string | null) ?? null,
    closer: (company?.estimate_template_closer as string | null) ?? null,
    signature: (company?.estimate_template_signature as string | null) ?? null,
  }
  const documentCompany: DocumentCompany = {
    name: companyName,
    owner_name: (company?.owner_name as string | null) ?? null,
    phone: (company?.phone as string | null) ?? null,
    email: (company?.email as string | null) ?? null,
    website: (company?.website as string | null) ?? null,
    address: (company?.address as string | null) ?? null,
    city: (company?.city as string | null) ?? null,
    state: (company?.state as string | null) ?? null,
    zip: (company?.zip as string | null) ?? null,
    logo_url: (company?.logo_url as string | null) ?? null,
    brand_primary_color: companyBrandColor,
  }
  // R4 — company defaults the estimate document compares against to flag
  // overridden vs inherited fields.
  const companyDefaults: CompanyDefaults = {
    payment_terms: (company?.default_payment_terms as string | null) ?? null,
    warranty_terms: (company?.default_warranty_terms as string | null) ?? null,
    tax_rate: Number(company?.default_tax_rate) || 0,
  }

  // Fetch current estimate for workspace tabs that need it
  const currentEstimate = await getCurrentEstimate(supabase, project.id)

  // Phase 94 (INVOICE-06) — issued invoices for the current estimate. Read-back
  // returns the frozen snapshot amounts (D-07); the editor surfaces them inline.
  const issuedInvoices = currentEstimate
    ? await getInvoicesByEstimateId(supabase, currentEstimate.id)
    : []

  // Fetch the company's price book so the estimate editor can offer autocomplete
  const priceBookItems = await getPriceBookItems(supabase, project.company_id)

  return (
    <ProjectWorkspace
      project={project}
      activity={activity}
      stats={stats}
      recordings={recordings}
      photos={photos}
      currentEstimate={currentEstimate}
      allVersions={allVersions}
      issuedInvoices={issuedInvoices}
      paymentsEnabled={canIssueInvoice}
      companyName={companyName}
      ownerName={ownerName}
      companyBrandColor={companyBrandColor}
      company={documentCompany}
      companyDefaults={companyDefaults}
      estimateTemplate={estimateTemplate}
      smsDeliveryEnabled={smsDeliveryEnabled}
      whatsappEnabled={whatsappAvailable}
      priceBookItems={priceBookItems}
      defaultTab={defaultTab}
    />
  )
}

function ProjectWorkspaceSkeleton({ project }: { project: Awaited<ReturnType<typeof getProjectById>> & {} }) {
  return (
    <div className="relative flex min-h-full flex-row gap-0 items-start">
      {/* Content column — real header renders instantly while tabs stream */}
      <div className="min-w-0 flex-1">
        <ProjectHeader project={project} />

        {/* Content skeleton — mirrors OverviewTab → EstimateEditor document */}
        <div className="px-5 py-6 md:px-6 space-y-4">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {/* Company header */}
          <div className="flex items-start justify-between gap-4 p-5">
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-12 w-12 rounded-md" />
          </div>
          {/* Brand band */}
          <Skeleton className="h-10 w-full rounded-none" />
          {/* Project block */}
          <div className="p-5 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-3 w-44" />
          </div>
          {/* Summary */}
          <div className="px-5 pb-5 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-9/12" />
          </div>
          {/* Sections */}
          {Array.from({ length: 2 }).map((_, s) => (
            <div key={s} className="border-t border-border px-5 py-4 space-y-3">
              <Skeleton className="h-4 w-44" />
              {Array.from({ length: 3 }).map((_, r) => (
                <div key={r} className="flex items-center gap-3">
                  <Skeleton className="h-3 flex-1" />
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          ))}
          {/* Totals */}
          <div className="border-t border-border px-5 py-4 space-y-2">
            {Array.from({ length: 3 }).map((_, t) => (
              <div key={t} className="flex justify-end gap-6">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        </div>

        {/* Floating action bar skeleton — mirrors EstimateFloatingActions pill
            (fixed + viewport-centered on desktop, matching Pill's positioning
            so nothing jumps on hydration) */}
        <div className="fixed inset-x-0 bottom-2 z-40 hidden lg:flex justify-center pointer-events-none">
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-background/95 p-1.5 shadow-xl backdrop-blur">
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="h-7 w-28 rounded-full" />
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
