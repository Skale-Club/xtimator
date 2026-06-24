'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { ClipboardList, Camera, Send, UserRound, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { SubNav, type SubNavItem } from '@/components/ui/sub-nav'
import { OverviewTab } from './overview-tab'
import { SendTab } from './send/send-tab'
import { PhotosTab } from './photos/photos-tab'
import { ClientTab } from './client-tab'
import { ActivityTab } from './activity-tab'
import { ProjectWhatsAppCard } from './project-whatsapp-card'
import type { ProjectDetail, ActivityEvent, ProjectQuickStats } from '@/lib/queries/project'
import type { ProjectConversationLink } from '@/lib/queries/whatsapp-inbox'
import type { Recording } from '@/lib/queries/recording'
import type { Photo } from '@/lib/queries/photo'
import type { EstimateWithSections, Estimate } from '@/lib/queries/estimate'
import type { InvoiceRow } from '@/lib/queries/invoice'
import type { EstimateTemplate } from '@/lib/utils/estimate-template'
import type { PriceBookItem } from '@/lib/queries/price-book'
import type { DocumentCompany, CompanyDefaults } from './estimate/estimate-document'
import { useTranslation } from '@/lib/i18n/use-translation'

const ALLOWED_TABS = ['overview', 'photos', 'send', 'client', 'activity'] as const
type WorkspaceTab = (typeof ALLOWED_TABS)[number]

interface ProjectWorkspaceProps {
  project: ProjectDetail
  activity: ActivityEvent[]
  stats: ProjectQuickStats
  recordings: Recording[]
  photos: Photo[]
  currentEstimate: EstimateWithSections | null
  allVersions: Estimate[]
  issuedInvoices: InvoiceRow[]
  /** PAYGATE-01/02 — forward-looking payment gate (Connect active), computed server-side. */
  paymentsEnabled: boolean
  companyName: string
  ownerName: string
  companyBrandColor: string | null
  company: DocumentCompany
  companyDefaults: CompanyDefaults
  estimateTemplate: EstimateTemplate
  smsDeliveryEnabled?: boolean
  whatsappSendEnabled?: boolean
  priceBookItems: PriceBookItem[]
  conversationLink: ProjectConversationLink
  defaultTab?: WorkspaceTab
}

export function ProjectWorkspace({
  project, activity, stats, recordings, photos,
  currentEstimate, allVersions, issuedInvoices, paymentsEnabled, companyName,
  ownerName, companyBrandColor, company, companyDefaults, estimateTemplate, smsDeliveryEnabled = false,
  whatsappSendEnabled = false,
  priceBookItems,
  conversationLink,
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [, startTabTransition] = useTransition()

  // Sync state when searchParams.tab changes (e.g., redirect from /capture)
  useEffect(() => {
    if (queryTab && (ALLOWED_TABS as readonly string[]).includes(queryTab)) {
      setActiveTab(queryTab as WorkspaceTab)
    }
  }, [queryTab])

  function handleSelect(value: string) {
    if (!(ALLOWED_TABS as readonly string[]).includes(value)) return
    const next = value as WorkspaceTab
    // Mark the tab switch (and the heavy estimate-subtree re-mount it triggers)
    // as a non-urgent transition. This keeps the click handler from blocking on
    // the synchronous render/mount of OverviewTab → EstimateEditor → EstimateDocument,
    // which was costing ~190ms inside the click event and tripping the 200ms
    // interaction-timing threshold.
    startTabTransition(() => {
      setActiveTab(next)
      const params = new URLSearchParams(searchParams.toString())
      if (next === 'overview') params.delete('tab')
      else params.set('tab', next)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }

  const NAV_ITEMS: SubNavItem[] = [
    { value: 'overview',  label: t('Overview'),  Icon: ClipboardList },
    { value: 'client',    label: t('Client'),    Icon: UserRound     },
    { value: 'photos',    label: t('Photos'),    Icon: Camera        },
    { value: 'activity',  label: t('Activity'),  Icon: Clock         },
    { value: 'send',      label: t('Send'),      Icon: Send          },
  ]

  return (
    /*
     * Layout mirrors settings:
     *   Mobile  (< md): sticky horizontal nav bar on top, full-width content below
     *   Desktop (md+):  sticky vertical sidebar on the left (stays in view while
     *     the page content scrolls), content on the right
     */
    <div className="flex min-h-full flex-row gap-0 items-start">

      {/* Nav — vertical collapsible sub-sidebar at ALL breakpoints. In-flow sticky
          on mobile; fixed (aligned after the primary sidebar) on desktop. */}
      <div
        className={`relative sticky top-0 z-20 shrink-0 self-start h-[calc(100dvh-56px)] overflow-y-auto md:fixed md:left-[var(--app-sidebar-width)] md:top-[120px] md:z-30 md:h-[calc(100vh-120px)] transition-all duration-200 ${sidebarCollapsed ? 'w-14 md:w-14' : 'w-40 md:w-48'}`}
      >
        <aside
          className={[
            'shrink-0 border-border bg-background h-full flex flex-col',
            'border-r overflow-y-auto pt-3 pb-0',
            'md:pt-4',
            sidebarCollapsed ? 'px-1' : 'px-2 md:px-3',
          ].join(' ')}
        >
          <div className="flex flex-col flex-1 md:overflow-y-auto md:pt-1">
            {/* Collapse toggle lives in the footer below — a single control. */}
            <SubNav
              items={NAV_ITEMS}
              activeValue={activeTab}
              onSelect={handleSelect}
              collapsed={sidebarCollapsed}
              alwaysVertical
            />
          </div>

          <div className="mt-auto flex flex-col justify-center shrink-0 md:h-[var(--app-rail-footer-h)] border-t border-[var(--glass-border)] p-2">
            <div className={`flex ${sidebarCollapsed ? 'justify-center' : 'justify-end'}`}>
              <button
                type="button"
                onClick={() => setSidebarCollapsed((c) => !c)}
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="p-1 rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/40 transition-colors"
              >
                {sidebarCollapsed
                  ? <ChevronRight className="h-4 w-4" />
                  : <ChevronLeft className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Content — offset on desktop so it doesn't sit underneath the fixed sidebar */}
      <div className={`min-w-0 flex-1 px-4 py-6 md:px-6 ${sidebarCollapsed ? 'md:ml-14' : 'md:ml-48'}`}>
        {activeTab === 'overview' && (
          <OverviewTab
            project={project}
            companyId={project.company_id}
            companyBrandColor={companyBrandColor}
            company={company}
            companyDefaults={companyDefaults}
            currentEstimate={currentEstimate}
            allVersions={allVersions}
            issuedInvoices={issuedInvoices}
            paymentsEnabled={paymentsEnabled}
            recordings={recordings}
            photos={photos}
            priceBookItems={priceBookItems}
          />
        )}
        {activeTab === 'photos' && (
          <PhotosTab projectId={project.id} companyId={project.company_id} initialPhotos={photos} />
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
            companyWebsite={company.website}
            estimateTemplate={estimateTemplate}
            smsDeliveryEnabled={smsDeliveryEnabled}
            whatsappSendEnabled={whatsappSendEnabled}
          />
        )}
        {activeTab === 'client' && (
          <div className="space-y-4">
            <ClientTab project={project} />
            <div className="max-w-md">
              <ProjectWhatsAppCard
                conversationLink={conversationLink}
                onStartFlow={() => handleSelect('send')}
              />
            </div>
          </div>
        )}
        {activeTab === 'activity' && (
          <ActivityTab events={activity} />
        )}
      </div>
    </div>
  )
}
