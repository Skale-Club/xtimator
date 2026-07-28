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
