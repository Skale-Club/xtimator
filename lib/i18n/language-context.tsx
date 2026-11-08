'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { onTranslationsLoaded } from './translation-events'

export type Language = 'en' | 'pt' | 'es'

interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  /**
   * Bumped each time a batch of async translations lands. Not read by anyone:
   * it exists so the context value changes and every useTranslation() consumer
   * re-renders with the newly cached strings (see translation-events.ts).
   */
  translationsVersion?: number
}

// Count of landed translation batches, provided by the root so a
// ScopedLanguageProvider can fold it into its own value too.
const TranslationsVersionContext = createContext<number>(0)

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
})

/**
 * The APP language, provided only by the root LanguageProvider and deliberately
 * never overridden by ScopedLanguageProvider.
 *
 * ScopedLanguageProvider exists so the New Xtimate popup re-skins itself in the
 * language of the estimate being produced. That is right for anything the
 * client will eventually read, and wrong for anything only the operator ever
 * sees: a Brazilian contractor writing an English estimate for a US client
 * should not get an English processing screen in an otherwise Portuguese app.
 * Operator-only surfaces read this context instead (see useAppTranslation).
 */
const AppLanguageContext = createContext<Language>('en')

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

/** Cookie the server-rendered Academy reads: localStorage is invisible to the server. */
const UI_LANG_COOKIE = 'academy_ui_lang'

function readUiLangCookie(): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${UI_LANG_COOKIE}=([^;]*)`))
  return m ? m[1] : null
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname
  const [language, setLanguageState] = useState<Language>('en')
  const [pendingCount, setPendingCount] = useState(0)
  const [translationsVersion, setTranslationsVersion] = useState(0)

  useEffect(() => onTranslationsLoaded(() => setTranslationsVersion((v) => v + 1)), [])

  // Mirror the interface language into a cookie so the server-rendered Academy
  // follows it; refresh the page when it changes while the Academy is open.
  const mirrorUiLanguage = useCallback(
    (lang: Language) => {
      try {
        if (readUiLangCookie() === lang) return
        document.cookie = `${UI_LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`
        if (pathnameRef.current?.startsWith('/academy')) router.refresh()
      } catch {
        // cookies unavailable: the Academy falls back to English
      }
    },
    [router]
  )

  useEffect(() => {
    // Runs on client only — reads localStorage after hydration (SSR-safe)
    const stored = localStorage.getItem('language') as Language | null
    if (stored === 'pt' || stored === 'es') {
      setLanguageState(stored)
    }
    mirrorUiLanguage(stored === 'pt' || stored === 'es' ? stored : 'en')
  }, [mirrorUiLanguage])

  const setLanguage = useCallback(
    (lang: Language) => {
      localStorage.setItem('language', lang)
      mirrorUiLanguage(lang)
      startTransition(() => {
        setLanguageState(lang)
      })
    },
    [mirrorUiLanguage]
  )

  // Memoized so the context value identity only changes when `language` changes
  // or a translation batch lands — not on unrelated parent re-renders (e.g. a
  // pendingCount bump, which happens twice per batch).
  const languageValue = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage, translationsVersion }),
    [language, setLanguage, translationsVersion]
  )

  return (
    <AppLanguageContext.Provider value={language}>
      <TranslationsVersionContext.Provider value={translationsVersion}>
        <LanguageContext.Provider value={languageValue}>
          <TranslationSetPendingContext.Provider value={setPendingCount}>
            <TranslationPendingCountContext.Provider value={pendingCount}>
              {children}
            </TranslationPendingCountContext.Provider>
          </TranslationSetPendingContext.Provider>
        </LanguageContext.Provider>
      </TranslationsVersionContext.Provider>
    </AppLanguageContext.Provider>
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
  const translationsVersion = useContext(TranslationsVersionContext)
  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage, translationsVersion }),
    [language, setLanguage, translationsVersion]
  )
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  return useContext(LanguageContext)
}

/**
 * The app's own language, immune to any ScopedLanguageProvider above the
 * caller. Read by operator-only surfaces that must follow the app rather than
 * the estimate being written.
 */
export function useAppLanguage() {
  return useContext(AppLanguageContext)
}

/**
 * Count of async translation batches that have landed. Read (and ignored) by
 * useAppTranslation() so operator-only surfaces, which do not consume
 * LanguageContext, still re-render when their translations arrive.
 */
export function useTranslationsVersion() {
  return useContext(TranslationsVersionContext)
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
