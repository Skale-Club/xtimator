'use client'

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

interface ProjectWorkspaceProps {
  project: ProjectDetail
  activity: ActivityEvent[]
  stats: ProjectQuickStats
  recordings: Recording[]
  photos: Photo[]
  currentEstimate: EstimateWithSections | null
  allVersions: Estimate[]
  companyName: string
}

export function ProjectWorkspace({ project, activity, stats, recordings, photos, currentEstimate, allVersions, companyName }: ProjectWorkspaceProps) {
  return (
    <Tabs defaultValue="overview" className="w-full">
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
        />
      </TabsContent>
    </Tabs>
  )
}
