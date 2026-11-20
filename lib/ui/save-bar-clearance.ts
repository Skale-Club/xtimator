'use client'

import { useSyncExternalStore } from 'react'

/*
 * Where the visible save bar is on screen, so floating controls (the chat
 * bubble) can step out of its way instead of covering Save. Viewport px.
 * null while no save bar is showing.
 */
export type SaveBarRect = { left: number; right: number; top: number }

let current: SaveBarRect | null = null
const listeners = new Set<() => void>()

function same(a: SaveBarRect | null, b: SaveBarRect | null) {
  if (a === b) return true
  if (!a || !b) return false
  return Math.round(a.left) === Math.round(b.left) && Math.round(a.right) === Math.round(b.right) && Math.round(a.top) === Math.round(b.top)
}

export function setSaveBarRect(next: SaveBarRect | null) {
  if (same(current, next)) return
  current = next
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSaveBarRect(): SaveBarRect | null {
  return useSyncExternalStore(subscribe, () => current, () => null)
}

/** Gap kept between the save bar and a floating control lifted above it. */
export const SAVE_BAR_CLEARANCE_GAP = 12
