'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useTour } from './use-tour'

interface TourContextValue {
  showWelcome: boolean
  setShowWelcome: (v: boolean) => void
  showSpotlight: boolean
  setShowSpotlight: (v: boolean) => void
  isReviewModeRef: React.MutableRefObject<boolean>
  setIsReviewMode: (v: boolean) => void
}

const TourContext = createContext<TourContextValue>({
  showWelcome: false,
  setShowWelcome: () => {},
  showSpotlight: false,
  setShowSpotlight: () => {},
  isReviewModeRef: { current: false },
  setIsReviewMode: () => {},
})

export function useTourContext() {
  return useContext(TourContext)
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [showWelcome, setShowWelcome] = useState(false)
  const [showSpotlight, setShowSpotlight] = useState(false)
  const isReviewModeRef = useRef(false)
  const { isTourCompleted, isSpotlightPending } = useTour()

  function setIsReviewMode(v: boolean) {
    isReviewModeRef.current = v
  }

  useEffect(() => {
    // Read the httpOnly:false cookie set by createOrUpdateCompany server action
    const hasOnboardingCookie = document.cookie
      .split(';')
      .some(c => c.trim().startsWith('onboarding_complete='))

    if (hasOnboardingCookie && !isTourCompleted()) {
      // Clear the cookie immediately so a page reload won't retrigger the modal
      document.cookie = 'onboarding_complete=; path=/; max-age=0'
      setShowWelcome(true)
    } else if (isSpotlightPending() && !isTourCompleted()) {
      // Restore spotlight on page refresh mid-tour
      setShowSpotlight(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TourContext.Provider value={{ showWelcome, setShowWelcome, showSpotlight, setShowSpotlight, isReviewModeRef, setIsReviewMode }}>
      {children}
    </TourContext.Provider>
  )
}
