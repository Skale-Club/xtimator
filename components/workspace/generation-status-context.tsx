'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { CaptureProgressMode } from '@/lib/estimate/progress-model'
import type { AttemptProgressSnapshot } from '@/hooks/use-attempt-progress'

/**
 * Notices review stage 1, part 2 (2026-11-20): a NEW version generating while
 * the current estimate is on screen. The estimate tab publishes the attempt's
 * inputs; the top bar draws a chip and a thin progress line from them.
 *
 * Its own context (not the version slot): the top bar ticks every second while
 * a generation runs, and the editor, which reads the version slot, must not.
 */
export interface GenerationStatus {
  mode: CaptureProgressMode
  progress: AttemptProgressSnapshot | null
  medians?: Record<string, number>
}

interface GenerationStatusCtx {
  status: GenerationStatus | null
  setStatus: (s: GenerationStatus | null) => void
}

const Ctx = createContext<GenerationStatusCtx>({ status: null, setStatus: () => {} })

export function GenerationStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GenerationStatus | null>(null)
  return <Ctx.Provider value={{ status, setStatus }}>{children}</Ctx.Provider>
}

export function useGenerationStatus(): GenerationStatus | null {
  return useContext(Ctx).status
}

/** Publishes `status` while mounted (null = nothing generating). */
export function usePublishGenerationStatus(status: GenerationStatus | null): void {
  const { setStatus } = useContext(Ctx)
  const mode = status?.mode
  const progress = status?.progress ?? null
  const medians = status?.medians
  const active = status !== null
  useEffect(() => {
    setStatus(active && mode ? { mode, progress, medians } : null)
  }, [active, mode, progress, medians, setStatus])
  useEffect(() => () => setStatus(null), [setStatus])
}
