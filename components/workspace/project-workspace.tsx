'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ClipboardList, Mic, Camera, Sparkles, Send } from 'lucide-react'
import { OverviewTab } from './overview-tab'
import { PlaceholderTab } from './placeholder-tab'
import type { ProjectDetail, ActivityEvent, ProjectQuickStats } from '@/lib/queries/project'

interface ProjectWorkspaceProps {
  project: ProjectDetail
  activity: ActivityEvent[]
  stats: ProjectQuickStats
}

export function ProjectWorkspace({ project, activity, stats }: ProjectWorkspaceProps) {
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
        <PlaceholderTab title="Audio Recording" phase={5} />
      </TabsContent>
      <TabsContent value="photos">
        <PlaceholderTab title="Photos" phase={5} />
      </TabsContent>
      <TabsContent value="estimate">
        <PlaceholderTab title="AI Estimate" phase={6} />
      </TabsContent>
      <TabsContent value="send">
        <PlaceholderTab title="Preview & Send" phase={7} />
      </TabsContent>
    </Tabs>
  )
}
