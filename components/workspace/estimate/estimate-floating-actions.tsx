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
  /** Phase 162-04 (DOCUX-01) — opens the PresentationSettingsPanel. When
   *  omitted the gear button is not rendered (backward-compat). */
  onOpenSettings?: () => void
  linkClientSlot?: ReactNode
  /** "Refine with AI" trigger (RefineEstimateDialog) — omitted on read-only versions. */
  refineSlot?: ReactNode
}

// ---------------------------------------------------------------------------
// Pill — single layout shared by mobile and desktop. Sized to its content
// (not stretched), so the button sizes stay coherent across breakpoints.
// Desktop (lg+) is `fixed inset-x-0` so the pill centers on the FULL viewport
// width — including the sidebar (w-[213px] expanded / w-16 collapsed) — not
// the content column, and stays centered when the sidebar collapses. Mobile
// keeps `sticky` inside the content column (sidebar hidden there, so content
// center already equals viewport center).
// ---------------------------------------------------------------------------

function Pill({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky bottom-3 lg:fixed lg:inset-x-0 lg:bottom-2 z-40 flex justify-center px-4 lg:px-0 pointer-events-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-background/95 p-1.5 shadow-xl backdrop-blur">
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
  linkClientSlot,
  refineSlot,
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
          className="rounded-full text-foreground"
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>
      )}
      {linkClientSlot}
      {refineSlot}
      {onOpenPhotos && (
        <Button size="sm" variant="ghost" onClick={onOpenPhotos} className="rounded-full gap-1.5 text-foreground">
          <Camera className="h-3.5 w-3.5" />
          Photos
        </Button>
      )}
      <Button size="sm" onClick={onSend} disabled={isSaving} className="rounded-full gap-1.5">
        <Share2 className="h-3.5 w-3.5" />
        Share
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setCollapsed(true)}
        aria-label="Hide actions"
        className="rounded-full text-foreground"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
    </Pill>
  )
}
