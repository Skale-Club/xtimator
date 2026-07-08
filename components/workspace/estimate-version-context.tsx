'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Estimate } from '@/lib/queries/estimate'

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
