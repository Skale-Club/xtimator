'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Estimate } from '@/lib/queries/estimate'
import type { EstimateViewMode } from './estimate/estimate-floating-actions'

export interface VersionSlot {
  currentVersionId: string
  versions: Estimate[]
  version: number
  isDirty: boolean
  isReadOnly: boolean
  onVersionChange: (id: string) => void
  /** Shared project name state — kept in sync across header and document */
  projectName: string
  onProjectRenamed: (name: string) => void
  /** Autosave status — surfaced next to the "Edit with AI" button in the header. */
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  /** Document view-mode toggle (PGMODE-01) — optional: the slot can be read
   *  before estimate-editor.tsx's first setSlot() call publishes these, and
   *  every OTHER field here is already read via `slot?.field` at call sites —
   *  required fields would be internally inconsistent with that convention. */
  viewMode?: EstimateViewMode
  onViewModeChange?: (mode: EstimateViewMode) => void
  /** Phase 193 (193-03) — engagement chip data for the header's Insights
   *  trigger, sourced from the estimate row estimate-editor.tsx already has
   *  loaded (no extra query for the chip). Same optional-field convention as
   *  viewMode above: undefined until the first setSlot() call publishes it. */
  viewCount?: number
  lastViewedAt?: string | null
  /** null = never sent — the header hides the whole chip in that case. */
  sentAt?: string | null
  hasPassword?: boolean
  /** Editor frame v2 (components/workspace/editor-frame) — what the top bar
   *  shows. Same optional-field convention: undefined until the editor's first
   *  setSlot() call, and always undefined when no estimate is on screen. */
  total?: number
  currencyCode?: string
  /** Already formatted (formatEstimateNumber). */
  estimateNumber?: string
  createdAt?: string
  clientResponse?: string | null
  respondedAt?: string | null
  hasSignature?: boolean
  /** Content lock on the CURRENT version: delivered, answered or signed. */
  isLocked?: boolean
  /** Retries a failed save. Undefined when a retry cannot help (read-only
   *  content, or a save conflict waiting for the user's choice). */
  onRetrySave?: () => void
  /** Opens the status sheet (timeline, client response, engagement). */
  onOpenStatus?: () => void
  /** Declined estimate only: clears the client's answer (kept in the activity
   *  history) so the content is editable again and the client can answer
   *  again on the same link. Undefined when reopening does not apply. */
  onReopen?: () => void
}

interface EstimateVersionCtx {
  slot: VersionSlot | null
  setSlot: (v: VersionSlot | null) => void
}

const Ctx = createContext<EstimateVersionCtx>({ slot: null, setSlot: () => {} })

export function EstimateVersionProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<VersionSlot | null>(null)
  return <Ctx.Provider value={{ slot, setSlot }}>{children}</Ctx.Provider>
}

export function useEstimateVersionSlot() {
  return useContext(Ctx)
}
