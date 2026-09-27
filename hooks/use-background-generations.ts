'use client'

import { useSyncExternalStore } from 'react'
import {
  listBackgroundGenerations,
  serverBackgroundGenerations,
  subscribeBackgroundGenerations,
  type BackgroundGeneration,
} from '@/lib/estimate/background-generations'

function snapshot(): BackgroundGeneration[] {
  return listBackgroundGenerations()
}

/** Every estimate generation the operator left running (lib/estimate/background-generations.ts). */
export function useBackgroundGenerations(): BackgroundGeneration[] {
  return useSyncExternalStore(subscribeBackgroundGenerations, snapshot, serverBackgroundGenerations)
}

/** The generation still running for one project, if the operator left one. */
export function useBackgroundGeneration(projectId: string | null | undefined): BackgroundGeneration | null {
  const all = useBackgroundGenerations()
  if (!projectId) return null
  return all.find((g) => g.projectId === projectId) ?? null
}
