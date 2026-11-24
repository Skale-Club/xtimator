'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BottomSheetCloseButton, BottomSheetContent } from '@/components/ui/bottom-sheet'
import { ProjectHeader } from './project-header'
import { EditorTopBar } from '@/components/workspace/editor-frame/editor-top-bar'
import { EditorFrameProvider } from '@/components/workspace/editor-frame/context'
import { useEditorFrame } from '@/components/workspace/editor-frame/frame'
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
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
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
  companySlug?: string | null
  ownerName: string
  companyBrandColor: string | null
  company: DocumentCompany
  companyDefaults: CompanyDefaults
  estimateTemplate: EstimateTemplate
  /** Phase 185 (PGMODE-02) — resolved design-template id (server-resolved,
   *  mirroring resolveEstimatePdfContext's own resolution), threaded to the
   *  editor's usePaginatedPreview hook. */
  estimateTemplateId: EstimateTemplateId
  /** Phase 185 (PGMODE-03) — "Prepared by" value (staff display name or
   *  company owner name), threaded to the editor so it can render the
   *  prepared-by block matching PDF parity. */
  preparedBy: string | null
  smsDeliveryEnabled?: boolean
  /** Phase 163 (SENDHUB) — server-resolved WhatsApp availability (tier ∧ active
   * account), threaded to the Send hub so WhatsApp actions hide when unavailable. */
  whatsappEnabled?: boolean
  /** Server-resolved platform-admin flag; gates the estimate debug tool. */
  isPlatformAdmin?: boolean
  priceBookItems: PriceBookItem[]
  defaultTab?: WorkspaceTab
}

export function ProjectWorkspace({
  project, activity, stats, recordings, photos,
  currentEstimate, allVersions, issuedInvoices, paymentsEnabled, companyName, companySlug,
  ownerName, companyBrandColor, company, companyDefaults, estimateTemplate,
  estimateTemplateId, preparedBy, smsDeliveryEnabled = false,
  whatsappEnabled,
  isPlatformAdmin = false,
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
  const frame = useEditorFrame()
  const [dockEl, setDockEl] = useState<HTMLDivElement | null>(null)
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

  const tabContent = (
    <>
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
          companySlug={companySlug}
          ownerName={ownerName}
          estimateTemplate={estimateTemplate}
          estimateTemplateId={estimateTemplateId}
          preparedBy={preparedBy}
          smsDeliveryEnabled={smsDeliveryEnabled}
          whatsappEnabled={whatsappEnabled}
          isPlatformAdmin={isPlatformAdmin}
          onOpenPhotos={() => setPhotosOpen(true)}
        />
      )}
      {activeTab === 'client' && (
        <div className="space-y-4">
          <ClientTab project={project} />
        </div>
      )}
    </>
  )

  const photosDialog = (
    <Dialog open={photosOpen} onOpenChange={setPhotosOpen}>
      {/* Same bottom sheet as Share / New Xtimate on phones (drag the handle or
          header down to close); centred 768px card from sm up. */}
      <BottomSheetContent className="nx-surface" desktopClassName="sm:max-w-3xl">
        <DialogHeader
          data-sheet-drag=""
          className="flex shrink-0 touch-none flex-row items-center justify-between gap-3 pl-5 pr-3 pt-1 pb-1 text-left sm:pl-6 sm:pr-4 sm:pt-5"
        >
          <DialogTitle className="text-[19px] leading-tight font-semibold tracking-tight">{t('Photos')}</DialogTitle>
          <BottomSheetCloseButton label={t('Close')} />
          <DialogDescription className="sr-only">
            {t('View and manage photos captured for this project.')}
          </DialogDescription>
        </DialogHeader>
        {/* min-w-0: the photo grid / drop-zone buttons must not widen the sheet. */}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6 sm:pb-6">
          <PhotosTab projectId={project.id} companyId={project.company_id} initialPhotos={photos} />
        </div>
      </BottomSheetContent>
    </Dialog>
  )

  if (frame === 'v2') {
    return (
      <EditorFrameProvider frame="v2" dockEl={dockEl}>
        <div data-editor-frame="v2" className="flex min-h-full flex-col">
          <EditorTopBar project={project} />
          <div className="min-w-0 flex-1 px-3 pt-3 pb-5 sm:px-5 md:px-6 md:pt-5">{tabContent}</div>
          {photosDialog}
          {/* Dock mount point: sticks to the bottom of the scroll area. The estimate
              editor portals its actions in here (it owns the handlers). Empty when
              no estimate is on screen, so it collapses. */}
          <div
            ref={setDockEl}
            data-editor-dock
            data-hide-on-keyboard
            className="sticky bottom-0 z-30 empty:hidden"
          />
        </div>
      </EditorFrameProvider>
    )
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

        {/* pt-0: the header's own pb-5 is the gap above the content (top and
            bottom of the title block match). */}
        <div className="px-5 pt-0 pb-6 md:px-6">
        {tabContent}
        </div>

        {photosDialog}

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
            in that last sliver, reading as a jump right at the end of scroll.
            Desktop no longer needs extra clearance: the floating action pill
            used to be `fixed` (always overlaying, hence 64px here so the last
            content could clear it), but it now floats centred on the document
            from a zero-height sticky line, and at the end of the scroll it only
            sits over the document's own bottom padding. The 64px read as an
            empty band under the document, so md is 0. Phones keep the bottom-
            nav clearance. */}
        <div
          aria-hidden
          className="h-[calc(5rem_+_env(safe-area-inset-bottom,_0px))] md:h-0"
        />
      </div>
    </div>
  )
}
