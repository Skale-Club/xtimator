'use client'

import { createContext, useContext } from 'react'

const TwaContext = createContext(false)

/** Provided by the (app) layout from the server-side `isTwaRequest()`. */
export function TwaProvider({ isTwa, children }: { isTwa: boolean; children: React.ReactNode }) {
  return <TwaContext.Provider value={isTwa}>{children}</TwaContext.Provider>
}

/** True when running inside the Android TWA (purchase-free mode). */
export function useIsTwa(): boolean {
  return useContext(TwaContext)
}
