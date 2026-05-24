'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ClipboardList, Camera, Sparkles, Send } from 'lucide-react'
import { SubNav, type SubNavItem } from '@/components/ui/sub-nav'
import { OverviewTab } from './overview-tab'
import { SendTab } from './send/send-tab'
import { PhotosTab } from './photos/photos-tab'
import { EstimateTab } from './estimate/estimate-tab'
import type { ProjectDetail, ActivityEvent, ProjectQuickStats } from '@/lib/queries/project'
import type { Recording } from '@/lib/queries/recording'
import type { Photo } from '@/lib/queries/photo'
import type { EstimateWithSections, Estimate } from '@/lib/queries/estimate'
import type { EstimateTemplate } from '@/lib/utils/estimate-template'
import { useTranslation } from '@/lib/i18n/use-translation'

const ALLOWED_TABS = ['overview', 'photos', 'estimate', 'send'] as const
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
  smsDeliveryEnabled?: boolean
  defaultTab?: WorkspaceTab
}

export function ProjectWorkspace({
  project, activity, stats, recordings, photos,
  currentEstimate, allVersions, companyName,
  ownerName, estimateTemplate, smsDeliveryEnabled = false,
  defaultTab = 'overview',
}: ProjectWorkspaceProps) {
  const { t } = useTranslation()
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

  function handleSelect(value: string) {
    if (!(ALLOWED_TABS as readonly string[]).includes(value)) return
    const next = value as WorkspaceTab
    setActiveTab(next)
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'overview') params.delete('tab')
    else params.set('tab', next)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const NAV_ITEMS: SubNavItem[] = [
    { value: 'overview',  label: t('Overview'),    Icon: ClipboardList },
    { value: 'photos',    label: t('Photos'),      Icon: Camera        },
    { value: 'estimate',  label: t('AI Estimate'), Icon: Sparkles      },
    { value: 'send',      label: t('Send'),        Icon: Send          },
  ]

  return (
    /*
     * Layout mirrors settings:
     *   Mobile  (< md): sticky horizontal nav bar on top, full-width content below
     *   Desktop (md+):  vertical sidebar on the left, content on the right
     */
    <div className="flex min-h-full flex-col md:flex-row md:gap-0">

      {/* Nav — horizontal sticky strip on mobile, vertical sidebar on desktop */}
      <div className="relative sticky top-0 z-20 shrink-0 md:static md:z-auto md:w-48">
        {/* Right-edge fade gradient — signals horizontal scrollability on mobile */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent md:hidden"
        />
        <aside
          className={[
            'shrink-0 border-border bg-background',
            // mobile
            'w-full border-b px-2 py-2',
            'overflow-x-auto scrollbar-none',
            // desktop
            'md:overflow-x-visible md:border-b-0 md:border-r md:px-3 md:py-8',
          ].join(' ')}
        >
          <SubNav
            items={NAV_ITEMS}
            activeValue={activeTab}
            onSelect={handleSelect}
          />
        </aside>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 px-4 py-6 md:px-6">
        {activeTab === 'overview' && (
          <OverviewTab project={project} activity={activity} />
        )}
        {activeTab === 'photos' && (
          <PhotosTab projectId={project.id} companyId={project.company_id} initialPhotos={photos} />
        )}
        {activeTab === 'estimate' && (
          <EstimateTab
            projectId={project.id}
            companyId={project.company_id}
            currentEstimate={currentEstimate}
            allVersions={allVersions}
            recordings={recordings}
            photos={photos}
          />
        )}
        {activeTab === 'send' && (
          <SendTab
            estimate={currentEstimate}
            projectName={project.name}
            companyName={companyName}
            clientEmail={project.client?.email ?? null}
            clientPhone={project.client?.phone ?? null}
            clientName={project.client?.name ?? ''}
            ownerName={ownerName}
            estimateTemplate={estimateTemplate}
            smsDeliveryEnabled={smsDeliveryEnabled}
          />
        )}
      </div>
    </div>
  )
}
