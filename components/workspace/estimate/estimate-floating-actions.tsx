'use client'

import { useState, type ReactNode } from 'react'
import { Share2, Camera, Settings, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

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

function Pill({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky bottom-3 lg:fixed lg:inset-x-0 lg:bottom-2 z-40 flex justify-center px-4 lg:px-0 pointer-events-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="pointer-events-auto inline-flex max-w-full items-center gap-2 overflow-x-auto scrollbar-none rounded-full border border-border bg-background/95 p-1.5 shadow-xl backdrop-blur">
        {children}
      </div>
    </div>
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
}: EstimateFloatingActionsProps) {
  // Quick-260718-w4k — the pill collapses to a single small round button so it
  // stops covering the bottom of the document. Session-local state (resets on
  // navigation) — the pill should reappear expanded on a fresh visit.
  const [collapsed, setCollapsed] = useState(false)

  if (!isCurrent) return null

  const isSaving = status === 'saving'

  if (collapsed) {
    return (
      <Pill>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setCollapsed(false)}
          aria-label="Show actions"
          className="rounded-full text-foreground"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
      </Pill>
    )
  }

  return (
    <Pill>
      {onOpenSettings && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onOpenSettings}
          aria-label="Settings"
          className="shrink-0 rounded-full text-foreground"
        >
          <Settings className="h-3.5 w-3.5" />
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
          Photos
        </Button>
      )}
      <Button size="sm" onClick={onSend} disabled={isSaving} className="shrink-0 rounded-full gap-1.5">
        <Share2 className="h-3.5 w-3.5" />
        Share
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setCollapsed(true)}
        aria-label="Hide actions"
        className="shrink-0 rounded-full text-foreground"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
    </Pill>
  )
}
