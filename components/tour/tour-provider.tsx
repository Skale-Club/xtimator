'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useTour } from './use-tour'

interface TourContextValue {
  showWelcome: boolean
  setShowWelcome: (v: boolean) => void
  showSpotlight: boolean
  setShowSpotlight: (v: boolean) => void
}

const TourContext = createContext<TourContextValue>({
  showWelcome: false,
  setShowWelcome: () => {},
  showSpotlight: false,
  setShowSpotlight: () => {},
})

export function useTourContext() {
  return useContext(TourContext)
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [showWelcome, setShowWelcome] = useState(false)
  const [showSpotlight, setShowSpotlight] = useState(false)
  const { isTourCompleted } = useTour()

  useEffect(() => {
    // Read the httpOnly:false cookie set by createOrUpdateCompany server action
    const hasOnboardingCookie = document.cookie
      .split(';')
      .some(c => c.trim().startsWith('onboarding_complete='))

    if (hasOnboardingCookie && !isTourCompleted()) {
      // Clear the cookie immediately so a page reload won't retrigger the modal
      document.cookie = 'onboarding_complete=; path=/; max-age=0'
      setShowWelcome(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TourContext.Provider value={{ showWelcome, setShowWelcome, showSpotlight, setShowSpotlight }}>
      {children}
    </TourContext.Provider>
  )
}
