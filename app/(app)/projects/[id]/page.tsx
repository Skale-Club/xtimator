import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProjectById, getProjectActivity, getProjectQuickStats } from '@/lib/queries/project'
import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import { getCurrentEstimate, getProjectEstimates } from '@/lib/queries/estimate'
import { ProjectWorkspace } from '@/components/workspace/project-workspace'
import { ProjectHeader } from '@/components/workspace/project-header'
import { ProjectPageShell } from '@/components/workspace/project-page-shell'
import { Skeleton } from '@/components/ui/skeleton'

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
    .select('name, owner_name, brand_primary_color, estimate_template_greeting, estimate_template_opener, estimate_template_closer, estimate_template_signature, sms_delivery_enabled')
    .eq('id', project.company_id)
    .single()

  const companyName = (company?.name as string) ?? ''
  const ownerName = (company?.owner_name as string | null) ?? ''
  const companyBrandColor = (company?.brand_primary_color as string | null) ?? null
  const smsDeliveryEnabled = (company?.sms_delivery_enabled as boolean) ?? false
  const estimateTemplate = {
    greeting: (company?.estimate_template_greeting as string | null) ?? null,
    opener: (company?.estimate_template_opener as string | null) ?? null,
    closer: (company?.estimate_template_closer as string | null) ?? null,
    signature: (company?.estimate_template_signature as string | null) ?? null,
  }

  // Fetch current estimate for workspace tabs that need it
  const currentEstimate = await getCurrentEstimate(supabase, project.id)

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
      estimateTemplate={estimateTemplate}
      smsDeliveryEnabled={smsDeliveryEnabled}
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
