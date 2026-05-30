import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProjectById, getProjectActivity, getProjectQuickStats } from '@/lib/queries/project'
import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import { getCurrentEstimate, getProjectEstimates } from '@/lib/queries/estimate'
import { getPriceBookItems } from '@/lib/queries/price-book'
import { getProjectConversationLink } from '@/lib/queries/whatsapp-inbox'
import { createServiceClient } from '@/lib/supabase/service'
import { getEntitlements } from '@/lib/entitlements'
import { ProjectWorkspace } from '@/components/workspace/project-workspace'
import { ProjectHeader } from '@/components/workspace/project-header'
import { ProjectPageShell } from '@/components/workspace/project-page-shell'
import { Skeleton } from '@/components/ui/skeleton'
import type { DocumentCompany, CompanyDefaults } from '@/components/workspace/estimate/estimate-document'

const ALLOWED_TABS = ['overview', 'photos', 'send', 'client', 'activity'] as const
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
      <ProjectHeader project={project} />
      <Suspense fallback={<ProjectWorkspaceSkeleton />}>
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
  const [activity, stats, recordings, photos, allVersions] = await Promise.all([
    activityPromise,
    statsPromise,
    recordingsPromise,
    photosPromise,
    allVersionsPromise,
  ])

  // Fetch company name + template fields + SMS flag for the Send tab
  const supabase = await createClient()
  const { data: company } = await supabase
    .from('companies')
    .select('name, owner_name, brand_primary_color, estimate_template_greeting, estimate_template_opener, estimate_template_closer, estimate_template_signature, sms_delivery_enabled, tier, logo_url, phone, email, website, address, city, state, zip, default_tax_rate, default_payment_terms, default_warranty_terms')
    .eq('id', project.company_id)
    .single()

  const companyName = (company?.name as string) ?? ''
  const ownerName = (company?.owner_name as string | null) ?? ''
  const companyBrandColor = (company?.brand_primary_color as string | null) ?? null
  const smsDeliveryEnabled = (company?.sms_delivery_enabled as boolean) ?? false

  // WhatsApp send is gated by plan entitlement AND a connected, active number.
  // company_whatsapp is RLS deny-all → read its status via the service client,
  // scoped to this (RLS-validated) project's company.
  let whatsappSendEnabled = false
  if (getEntitlements((company?.tier as string) ?? 'free').whatsappEnabled) {
    const svc = createServiceClient()
    if (svc) {
      const { data: wa } = await svc
        .from('company_whatsapp')
        .select('status')
        .eq('company_id', project.company_id)
        .maybeSingle()
      whatsappSendEnabled = wa?.status === 'active'
    }
  }
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

  // Fetch the company's price book so the estimate editor can offer autocomplete
  const priceBookItems = await getPriceBookItems(supabase, project.company_id)

  // Resolve the linked client's WhatsApp conversation (by phone, no migration)
  // for the Client-tab link card. Self-resolves the active company internally.
  const conversationLink = await getProjectConversationLink(project.id)

  return (
    <ProjectWorkspace
      project={project}
      activity={activity}
      stats={stats}
      recordings={recordings}
      photos={photos}
      currentEstimate={currentEstimate}
      allVersions={allVersions}
      companyName={companyName}
      ownerName={ownerName}
      companyBrandColor={companyBrandColor}
      company={documentCompany}
      companyDefaults={companyDefaults}
      estimateTemplate={estimateTemplate}
      smsDeliveryEnabled={smsDeliveryEnabled}
      whatsappSendEnabled={whatsappSendEnabled}
      priceBookItems={priceBookItems}
      conversationLink={conversationLink}
      defaultTab={defaultTab}
    />
  )
}

function ProjectWorkspaceSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
