'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  startTransition,
  type Dispatch,
  type SetStateAction,
} from 'react'

export type Language = 'en' | 'pt' | 'es'

interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
})

// Translation "pending" state lives in its OWN contexts, split in two so that
// the async-translation machinery never re-renders the whole app:
//   - TranslationPendingCountContext holds the changing count and is read ONLY
//     by the loading overlay.
//   - TranslationSetPendingContext holds the setter, whose identity is stable
//     across renders (useState guarantee), so useTranslation() can bump the
//     count WITHOUT subscribing to it — otherwise every t() consumer (i.e. the
//     entire tree for pt/es users) would re-render on every batch.
const TranslationPendingCountContext = createContext<number>(0)
const TranslationSetPendingContext = createContext<Dispatch<SetStateAction<number>>>(
  () => {}
)

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

  const setLanguage = useCallback((lang: Language) => {
    localStorage.setItem('language', lang)
    startTransition(() => {
      setLanguageState(lang)
    })
  }, [])

  // Memoized so the context value identity only changes when `language` does —
  // not on unrelated parent re-renders (e.g. a pendingCount bump).
  const languageValue = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage }),
    [language, setLanguage]
  )

  return (
    <LanguageContext.Provider value={languageValue}>
      <TranslationSetPendingContext.Provider value={setPendingCount}>
        <TranslationPendingCountContext.Provider value={pendingCount}>
          {children}
        </TranslationPendingCountContext.Provider>
      </TranslationSetPendingContext.Provider>
    </LanguageContext.Provider>
  )
}

/**
 * Overrides the language for a subtree WITHOUT touching the global app language.
 * Every `useTranslation()` inside renders in `language`; the rest of the app is
 * unaffected. The translation-pending contexts are provided by the root
 * LanguageProvider and remain in scope here, so async translations still drive
 * the loading overlay. Used by the New Xtimate popup so its language selector
 * re-skins only the popup (and the estimate), not the app.
 */
export function ScopedLanguageProvider({
  language,
  setLanguage,
  children,
}: {
  language: Language
  setLanguage: (lang: Language) => void
  children: React.ReactNode
}) {
  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage }),
    [language, setLanguage]
  )
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  return useContext(LanguageContext)
}

/** Current number of in-flight translation batches. Read by the loading overlay. */
export function useTranslationPendingCount() {
  return useContext(TranslationPendingCountContext)
}

/**
 * The stable setter for the in-flight translation-batch count. Read by
 * useTranslation() to increment/decrement without subscribing to the count
 * itself (which would re-render every translated component on each batch).
 */
export function useSetTranslationPending() {
  return useContext(TranslationSetPendingContext)
}
