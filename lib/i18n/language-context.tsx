'use client'

import { createContext, useContext, useState, useEffect, startTransition, type Dispatch, type SetStateAction } from 'react'

export type Language = 'en' | 'pt' | 'es'

interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  pendingCount: number
  setPendingCount: Dispatch<SetStateAction<number>>
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
  pendingCount: 0,
  setPendingCount: () => {},
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en')
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    // Runs on client only — reads localStorage after hydration (SSR-safe)
    const stored = localStorage.getItem('language') as Language | null
    if (stored === 'pt' || stored === 'es') {
      setLanguageState(stored)
    }
  }, [])

  const setLanguage = (lang: Language) => {
    localStorage.setItem('language', lang)
    startTransition(() => {
      setLanguageState(lang)
    })
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, pendingCount, setPendingCount }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
