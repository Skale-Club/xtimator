import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProjectById, getProjectActivity, getProjectQuickStats } from '@/lib/queries/project'
import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import { getCurrentEstimate, getProjectEstimates } from '@/lib/queries/estimate'
import { ProjectWorkspace } from '@/components/workspace/project-workspace'
import { ProjectTitle } from '@/components/workspace/project-title'
import { Skeleton } from '@/components/ui/skeleton'
import { T } from '@/components/i18n/t'

const ALLOWED_TABS = ['overview', 'photos', 'estimate', 'send'] as const
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
  const currentEstimatePromise = getCurrentEstimate(supabase, id)
  const allVersionsPromise = getProjectEstimates(supabase, id)

  return (
    <div className="space-y-6 px-6 py-8">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground"><T>Project</T></p>
        <ProjectTitle projectId={project.id} initialName={project.name} />
        {project.client && (
          <p className="text-sm text-muted-foreground">{project.client.name}</p>
        )}
      </header>
      <Suspense fallback={<ProjectWorkspaceSkeleton />}>
        <ProjectTabs
          project={project}
          activityPromise={activityPromise}
          statsPromise={statsPromise}
          recordingsPromise={recordingsPromise}
          photosPromise={photosPromise}
          currentEstimatePromise={currentEstimatePromise}
          allVersionsPromise={allVersionsPromise}
          defaultTab={defaultTab}
        />
      </Suspense>
    </div>
  )
}

type ProjectTabsProps = {
  project: Awaited<ReturnType<typeof getProjectById>> & {}
  activityPromise: ReturnType<typeof getProjectActivity>
  statsPromise: ReturnType<typeof getProjectQuickStats>
  recordingsPromise: ReturnType<typeof getProjectRecordings>
  photosPromise: ReturnType<typeof getProjectPhotos>
  currentEstimatePromise: ReturnType<typeof getCurrentEstimate>
  allVersionsPromise: ReturnType<typeof getProjectEstimates>
  defaultTab: AllowedTab
}

async function ProjectTabs({
  project,
  activityPromise,
  statsPromise,
  recordingsPromise,
  photosPromise,
  currentEstimatePromise,
  allVersionsPromise,
  defaultTab,
}: ProjectTabsProps) {
  const [activity, stats, recordings, photos, currentEstimate, allVersions] = await Promise.all([
    activityPromise,
    statsPromise,
    recordingsPromise,
    photosPromise,
    currentEstimatePromise,
    allVersionsPromise,
  ])

  // Fetch company name + template fields + SMS flag for the Send tab
  const supabase = await createClient()
  const { data: company } = await supabase
    .from('companies')
    .select('name, owner_name, estimate_template_greeting, estimate_template_opener, estimate_template_closer, estimate_template_signature, sms_delivery_enabled')
    .eq('id', project.company_id)
    .single()

  const companyName = (company?.name as string) ?? ''
  const ownerName = (company?.owner_name as string | null) ?? ''
  const smsDeliveryEnabled = (company?.sms_delivery_enabled as boolean) ?? false
  const estimateTemplate = {
    greeting: (company?.estimate_template_greeting as string | null) ?? null,
    opener: (company?.estimate_template_opener as string | null) ?? null,
    closer: (company?.estimate_template_closer as string | null) ?? null,
    signature: (company?.estimate_template_signature as string | null) ?? null,
  }

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
