'use client'

// localStorage keys used by the tour state machine
export const TOUR_KEYS = {
  completed: 'tour_completed',
  spotlightPending: 'tour_spotlight_pending', // set when user clicks "Show me around"
} as const

export function useTour() {
  function isTourCompleted(): boolean {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(TOUR_KEYS.completed) === 'true'
  }

  function completeTour() {
    localStorage.setItem(TOUR_KEYS.completed, 'true')
    localStorage.removeItem(TOUR_KEYS.spotlightPending)
  }

  function startTour() {
    // Called when user clicks "Show me around" — spotlight (Wave 2) will read this flag
    localStorage.setItem(TOUR_KEYS.spotlightPending, 'true')
    completeTour()
  }

  function isSpotlightPending(): boolean {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(TOUR_KEYS.spotlightPending) === 'true'
  }

  function clearSpotlightPending() {
    localStorage.removeItem(TOUR_KEYS.spotlightPending)
  }

  return { isTourCompleted, completeTour, startTour, isSpotlightPending, clearSpotlightPending }
}
