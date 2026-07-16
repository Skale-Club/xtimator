'use client'

import type { ReactNode } from 'react'
import { Send, Camera, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Status = 'idle' | 'saving' | 'saved' | 'error'

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
// (not stretched), so the button sizes stay coherent across breakpoints —
// only the bottom offset and safe-area padding differ.
// ---------------------------------------------------------------------------

function Pill({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky bottom-3 md:bottom-6 z-40 flex justify-center px-4 md:px-0 pointer-events-none"
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
// the Send button below (disabled while a save is in flight).

export function EstimateFloatingActions({
  isCurrent,
  status,
  onSend,
  onOpenPhotos,
  onOpenSettings,
  linkClientSlot,
  refineSlot,
}: EstimateFloatingActionsProps) {
  if (!isCurrent) return null

  const isSaving = status === 'saving'

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
        <Send className="h-3.5 w-3.5" />
        Send
      </Button>
    </Pill>
  )
}
