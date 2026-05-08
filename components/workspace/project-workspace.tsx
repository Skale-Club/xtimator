'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ClipboardList, Mic, Camera, Sparkles, Send } from 'lucide-react'
import { OverviewTab } from './overview-tab'
import { SendTab } from './send/send-tab'
import { AudioTab } from './audio/audio-tab'
import { PhotosTab } from './photos/photos-tab'
import { EstimateTab } from './estimate/estimate-tab'
import type { ProjectDetail, ActivityEvent, ProjectQuickStats } from '@/lib/queries/project'
import type { Recording } from '@/lib/queries/recording'
import type { Photo } from '@/lib/queries/photo'
import type { EstimateWithSections, Estimate } from '@/lib/queries/estimate'
import type { EstimateTemplate } from '@/lib/utils/estimate-template'

const ALLOWED_TABS = ['overview', 'audio', 'photos', 'estimate', 'send'] as const
type WorkspaceTab = (typeof ALLOWED_TABS)[number]

interface ProjectWorkspaceProps {
  project: ProjectDetail
  activity: ActivityEvent[]
  stats: ProjectQuickStats
  recordings: Recording[]
  photos: Photo[]
  currentEstimate: EstimateWithSections | null
  allVersions: Estimate[]
  companyName: string
  ownerName: string
  estimateTemplate: EstimateTemplate
  defaultTab?: WorkspaceTab
}

export function ProjectWorkspace({
  project, activity, stats, recordings, photos,
  currentEstimate, allVersions, companyName,
  ownerName, estimateTemplate,
  defaultTab = 'overview',
}: ProjectWorkspaceProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const queryTab = searchParams.get('tab')
  const initial: WorkspaceTab =
    (ALLOWED_TABS as readonly string[]).includes(queryTab ?? '')
      ? (queryTab as WorkspaceTab)
      : defaultTab

  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initial)

  // Sync state when searchParams.tab changes (e.g., redirect from /capture)
  useEffect(() => {
    if (queryTab && (ALLOWED_TABS as readonly string[]).includes(queryTab)) {
      setActiveTab(queryTab as WorkspaceTab)
    }
  }, [queryTab])

  function handleValueChange(value: string) {
    if (!(ALLOWED_TABS as readonly string[]).includes(value)) return
    const next = value as WorkspaceTab
    setActiveTab(next)
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'overview') params.delete('tab')
    else params.set('tab', next)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <Tabs value={activeTab} onValueChange={handleValueChange} className="w-full">
      <div className="border-b border-border">
        <TabsList
          variant="line"
          className="w-auto h-auto bg-transparent p-0 gap-0 rounded-none justify-start"
        >
          {[
            { value: 'overview',  Icon: ClipboardList, label: 'Overview'    },
            { value: 'audio',     Icon: Mic,           label: 'Audio'       },
            { value: 'photos',    Icon: Camera,        label: 'Photos'      },
            { value: 'estimate',  Icon: Sparkles,      label: 'AI Estimate' },
            { value: 'send',      Icon: Send,          label: 'Send'        },
          ].map(({ value, Icon, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="
                h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-4 py-3
                gap-2 text-sm font-medium text-muted-foreground
                hover:text-foreground
                data-[state=active]:border-primary dark:data-[state=active]:border-primary
                data-[state=active]:text-foreground data-[state=active]:shadow-none
                data-[state=active]:bg-transparent dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-foreground
                after:hidden
                transition-colors
              "
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value="overview">
        <OverviewTab project={project} activity={activity} stats={stats} />
      </TabsContent>
      <TabsContent value="audio">
        <AudioTab projectId={project.id} companyId={project.company_id} initialRecordings={recordings} />
      </TabsContent>
      <TabsContent value="photos">
        <PhotosTab projectId={project.id} companyId={project.company_id} initialPhotos={photos} />
      </TabsContent>
      <TabsContent value="estimate">
        <EstimateTab
          projectId={project.id}
          companyId={project.company_id}
          currentEstimate={currentEstimate}
          allVersions={allVersions}
          recordings={recordings}
          photos={photos}
        />
      </TabsContent>
      <TabsContent value="send">
        <SendTab
          estimate={currentEstimate}
          projectName={project.name}
          companyName={companyName}
          clientEmail={project.client?.email ?? null}
          clientName={project.client?.name ?? ''}
          ownerName={ownerName}
          estimateTemplate={estimateTemplate}
        />
      </TabsContent>
    </Tabs>
  )
}
