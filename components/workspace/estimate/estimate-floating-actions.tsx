'use client'

import { useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { Share2, Camera, Settings, Bug, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'

type Status = 'idle' | 'saving' | 'saved' | 'error'

/** Document viewing mode — 'width' fills the content column (default),
 *  'page' constrains the document to a centered letter-width page. */
export type EstimateViewMode = 'width' | 'page'

interface EstimateFloatingActionsProps {
  isCurrent: boolean
  status: Status
  onSend: () => void
  /** Opens the Photos dialog on top of the estimate (replaces the old sub-sidebar nav). */
  onOpenPhotos?: () => void
  /** Phase 162-04 (DOCUX-01) — opens the PresentationSettingsPanel (which now
   *  also hosts the Link-Client affordance). When omitted the gear button is
   *  not rendered (backward-compat). */
  onOpenSettings?: () => void
  /** Platform-admin only: opens the estimate debug sheet. When omitted no debug button is rendered. */
  onOpenDebug?: () => void
  /** Controls drawn first in the pill, before a divider (the page view's zoom). */
  leading?: ReactNode
  /** The gear button, so the settings popover can open from it. */
  settingsButtonRef?: Ref<HTMLButtonElement>
  /** "Client response" control (record the client's answer in-app), drawn before Share. */
  responseControl?: ReactNode
}

// ---------------------------------------------------------------------------
// Pill — single layout shared by mobile and desktop. Sized to its content
// (not stretched), so the button sizes stay coherent across breakpoints.
// Desktop (lg+) is `fixed inset-x-0` so the pill centers on the FULL viewport
// width — including the sidebar (w-[213px] expanded / w-16 collapsed) — not
// the content column, and stays centered when the sidebar collapses. Mobile
// keeps `sticky` inside the content column (sidebar hidden there, so content
// center already equals viewport center).
//
// `max-w-full` + `overflow-x-auto` are the horizontal-overflow guard: the pill
// buttons don't shrink, so before this a too-wide pill pushed the whole preview
// sideways (the page gained a horizontal scrollbar and rocked left/right). Any
// excess now scrolls INSIDE the pill and never reaches the document.
// ---------------------------------------------------------------------------

// Update: the pill is `sticky` at every width now, inside the column that
// holds the document, so it centers on the DOCUMENT rather than the viewport
// (the old lg `fixed inset-x-0` put it off-centre beside the sidebar and the
// page view's side rail). In the page view PaginatedPreview renders it inside
// the sheet column (with its zoom control) for the same reason.

// The sticky line is ZERO height and the pill hangs from it (absolute,
// bottom-0): the bar floats over the content like the old `fixed` one did,
// instead of reserving its own ~50px strip under the last page (which showed
// up as an empty band at the bottom of the document).
function Pill({ children }: { children: ReactNode }) {
  return (
    <div
      data-hide-on-keyboard
      className="pointer-events-none sticky z-40 h-0 w-full"
      style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
    >
      <div className="absolute bottom-0 left-1/2 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 justify-center">
        <div className="pointer-events-auto inline-flex max-w-full items-center gap-2 overflow-x-auto scrollbar-none rounded-full border border-border bg-background/95 p-1.5 shadow-xl backdrop-blur">
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * The collapsed bar: a small tab glued to the bottom edge of the screen, its
 * bottom cut off by the edge. `fixed`, not `sticky`: a sticky tab drops back
 * into the flow at the end of the document and floats above the page padding.
 * A zero-height, full-width marker in the flow tracks the document column's
 * centre, so the fixed tab stays centred on the document (not the window)
 * when the window or the sidebar changes width.
 */
function CollapsedTab({ onExpand }: { onExpand: () => void }) {
  const { t } = useTranslation()
  const markerRef = useRef<HTMLDivElement>(null)
  const [centerX, setCenterX] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = markerRef.current
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      setCenterX(r.left + r.width / 2)
    }
    update()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    ro?.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <>
      <div ref={markerRef} aria-hidden className="h-0 w-full" />
      <button
        type="button"
        onClick={onExpand}
        aria-label={t('Show actions')}
        data-hide-on-keyboard
        className="fixed bottom-0 z-40 flex min-h-7 w-16 -translate-x-1/2 items-start justify-center rounded-t-xl border border-b-0 border-border bg-background/95 pt-1 text-foreground shadow-[0_-6px_16px_rgba(0,0,0,0.25)] backdrop-blur transition-colors hover:bg-muted"
        style={{ left: centerX ?? '50%', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ChevronUp className="h-4 w-4" />
      </button>
    </>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
// Autosave status (drafts save automatically, debounced in the editor) is
// surfaced next to the "Edit with AI" button in the project header instead
// of here — see ProjectHeader + VersionSlot.saveStatus. `status` still gates
// the Share button below (disabled while a save is in flight).

export function EstimateFloatingActions({
  isCurrent,
  status,
  onSend,
  onOpenPhotos,
  onOpenSettings,
  onOpenDebug,
  leading,
  settingsButtonRef,
  responseControl,
}: EstimateFloatingActionsProps) {
  // Quick-260718-w4k — the pill collapses to a single small round button so it
  // stops covering the bottom of the document. Session-local state (resets on
  // navigation) — the pill should reappear expanded on a fresh visit.
  const [collapsed, setCollapsed] = useState(false)
  const { t } = useTranslation()

  if (!isCurrent) return null

  const isSaving = status === 'saving'

  if (collapsed) return <CollapsedTab onExpand={() => setCollapsed(false)} />

  return (
    <Pill>
      {leading && (
        <>
          {leading}
          <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
        </>
      )}
      {onOpenSettings && (
        <Button
          ref={settingsButtonRef}
          size="sm"
          variant="ghost"
          onClick={onOpenSettings}
          aria-label={t('Settings')}
          className="shrink-0 rounded-full text-foreground"
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>
      )}
      {onOpenDebug && (
        <Button
          size="icon"
          variant="ghost"
          onClick={onOpenDebug}
          aria-label={t('Estimate debug')}
          title={t('Estimate debug')}
          data-testid="estimate-debug-trigger"
          className="h-8 w-8 shrink-0 rounded-full text-muted-foreground"
        >
          <Bug className="h-3.5 w-3.5" />
        </Button>
      )}
      {onOpenPhotos && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onOpenPhotos}
          className="shrink-0 rounded-full gap-1.5 text-foreground"
        >
          <Camera className="h-3.5 w-3.5" />
          {/* Icon-only below sm so Share always fits the pill on a phone. */}
          <span className="max-sm:sr-only">{t('Photos')}</span>
        </Button>
      )}
      {responseControl}
      <Button size="sm" onClick={onSend} disabled={isSaving} className="shrink-0 rounded-full gap-1.5">
        <Share2 className="h-3.5 w-3.5" />
        {t('Share')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setCollapsed(true)}
        aria-label={t('Hide actions')}
        className="shrink-0 rounded-full text-foreground"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
    </Pill>
  )
}
