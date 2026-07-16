'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ProjectHeader } from './project-header'
import { OverviewTab } from './overview-tab'
import { PhotosTab } from './photos/photos-tab'
import { ClientTab } from './client-tab'
import { ActivityTab } from './activity-tab'
import type { ProjectDetail, ActivityEvent, ProjectQuickStats } from '@/lib/queries/project'
import type { Recording } from '@/lib/queries/recording'
import type { Photo } from '@/lib/queries/photo'
import type { EstimateWithSections, Estimate } from '@/lib/queries/estimate'
import type { InvoiceRow } from '@/lib/queries/invoice'
import type { EstimateTemplate } from '@/lib/utils/estimate-template'
import type { PriceBookItem } from '@/lib/queries/price-book'
import type { DocumentCompany, CompanyDefaults } from './estimate/estimate-document'
import { useTranslation } from '@/lib/i18n/use-translation'

const ALLOWED_TABS = ['overview', 'client'] as const
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
  /** Phase 163 (SENDHUB) — server-resolved WhatsApp availability (tier ∧ active
   * account), threaded to the Send hub so WhatsApp actions hide when unavailable. */
  whatsappEnabled?: boolean
  priceBookItems: PriceBookItem[]
  defaultTab?: WorkspaceTab
}

export function ProjectWorkspace({
  project, activity, stats, recordings, photos,
  currentEstimate, allVersions, issuedInvoices, paymentsEnabled, companyName,
  ownerName, companyBrandColor, company, companyDefaults, estimateTemplate, smsDeliveryEnabled = false,
  whatsappEnabled,
  priceBookItems,
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
  const [photosOpen, setPhotosOpen] = useState(false)
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

  return (
    /*
     * Single-column workspace at ALL breakpoints. The old sub-sidebar rail
     * (Overview/Client/Photos) is gone — Photos opens as a dialog on top of
     * the estimate (staying in-context, no navigation away from editing),
     * while Client still swaps the content column with a "Back" control.
     */
    <div className="relative flex min-h-full flex-row gap-0 items-start -mb-[calc(5rem_+_env(safe-area-inset-bottom,_0px))] md:-mb-6">

      {/* Content — the project header sticks to the top of the scroll area as
          content scrolls. */}
      <div className="min-w-0 flex-1">
        <ProjectHeader project={project} />

        <div className="px-5 py-6 md:px-6">
        {activeTab === 'client' && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleSelect('overview')}
            className="mb-4 -ml-2 gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('Back to estimate')}
          </Button>
        )}
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
            companyName={companyName}
            ownerName={ownerName}
            estimateTemplate={estimateTemplate}
            smsDeliveryEnabled={smsDeliveryEnabled}
            whatsappEnabled={whatsappEnabled}
            onOpenPhotos={() => setPhotosOpen(true)}
          />
        )}
        {activeTab === 'client' && (
          <div className="space-y-4">
            <ClientTab project={project} />
          </div>
        )}
        </div>

        <Dialog open={photosOpen} onOpenChange={setPhotosOpen}>
          <DialogContent className="w-[90vw] max-w-3xl max-h-[85dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('Photos')}</DialogTitle>
              <DialogDescription className="sr-only">
                {t('View and manage photos captured for this project.')}
              </DialogDescription>
            </DialogHeader>
            <PhotosTab projectId={project.id} companyId={project.company_id} initialPhotos={photos} />
          </DialogContent>
        </Dialog>

        {/* Bottom clearance spacer — lives INSIDE the flex-row's containing block
            (same one the sticky rail and sticky floating action bar use), paired
            with the negative margin-bottom on the outer flex-row div above. main
            (app/(app)/layout.tsx) still carries this same amount as padding-bottom
            for every other route in the (app) group — but for this route, the
            negative margin cancels that ancestor padding out of the scroll-height
            total (so other routes aren't double-spaced) while this spacer ensures
            the sticky elements' own containing block genuinely includes the
            clearance region. Without this pairing, main's padding sits OUTSIDE
            the sticky rail/floating-bar's containing block, so the page can be
            scrolled past where that containing block ends — both stickies detach
            in that last sliver, reading as a jump right at the end of scroll. */}
        <div
          aria-hidden
          className="h-[calc(5rem_+_env(safe-area-inset-bottom,_0px))] md:h-6"
        />
      </div>
    </div>
  )
}
