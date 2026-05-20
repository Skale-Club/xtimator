"use client"

import {
  TOUR_NS,
  clearAllTourState,
  clearSpotlightPending as _clearSpotlightPending,
  isSpotlightCompleted,
  isSpotlightPending as _isSpotlightPending,
  markSpotlightCompleted,
  setSpotlightPending,
} from "@/lib/tour/persistence"

// Back-compat surface — these constants used to point at the flat legacy keys.
// We keep the same shape so any old imports still compile; values now reflect the
// namespaced layout owned by lib/tour/persistence.
export const TOUR_KEYS = {
  completed: `${TOUR_NS}spotlight:completed`,
  spotlightPending: `${TOUR_NS}spotlight:pending`,
} as const

function resetCompleted(): void {
  if (typeof window === "undefined") return
  try { window.localStorage.removeItem(TOUR_KEYS.completed) } catch {}
}

export function useTour() {
  return {
    isTourCompleted: (): boolean => isSpotlightCompleted(),

    completeTour: (): void => {
      markSpotlightCompleted()
      _clearSpotlightPending()
    },

    // Re-arms the spotlight. Used by both the welcome modal ("Show me around")
    // and TourHelpButton ("Restart tour"). A restart should always replay, so we
    // reset the completed flag too — fixes RESEARCH gotcha #2 (no longer marks
    // completed at start time).
    startTour: (): void => {
      resetCompleted()
      setSpotlightPending()
    },

    isSpotlightPending: (): boolean => _isSpotlightPending(),

    clearSpotlightPending: (): void => _clearSpotlightPending(),

    // Exposed for TourHelpButton's restart-from-scratch path (75-04 wires this up).
    resetAllTourState: (): void => clearAllTourState(),
  }
}
