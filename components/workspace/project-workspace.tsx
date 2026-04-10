'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ClipboardList, Mic, Camera, Sparkles, Send } from 'lucide-react'
import { OverviewTab } from './overview-tab'
import { PlaceholderTab } from './placeholder-tab'
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
}

export function ProjectWorkspace({ project, activity, stats, recordings, photos, currentEstimate, allVersions }: ProjectWorkspaceProps) {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="w-full grid grid-cols-5">
        <TabsTrigger value="overview" className="min-h-[44px] gap-1.5 text-xs sm:text-sm">
          <ClipboardList className="h-4 w-4" />
          <span className="hidden sm:inline">Overview</span>
        </TabsTrigger>
        <TabsTrigger value="audio" className="min-h-[44px] gap-1.5 text-xs sm:text-sm">
          <Mic className="h-4 w-4" />
          <span className="hidden sm:inline">Audio</span>
        </TabsTrigger>
        <TabsTrigger value="photos" className="min-h-[44px] gap-1.5 text-xs sm:text-sm">
          <Camera className="h-4 w-4" />
          <span className="hidden sm:inline">Photos</span>
        </TabsTrigger>
        <TabsTrigger value="estimate" className="min-h-[44px] gap-1.5 text-xs sm:text-sm">
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">AI Estimate</span>
        </TabsTrigger>
        <TabsTrigger value="send" className="min-h-[44px] gap-1.5 text-xs sm:text-sm">
          <Send className="h-4 w-4" />
          <span className="hidden sm:inline">Send</span>
        </TabsTrigger>
      </TabsList>
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
        <PlaceholderTab title="Preview & Send" phase={7} />
      </TabsContent>
    </Tabs>
  )
}
