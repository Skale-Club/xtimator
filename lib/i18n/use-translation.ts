'use client'

import type { Dispatch, SetStateAction } from 'react'
import { useLanguage, type Language } from './language-context'
import { staticDict } from './translations'

// Module-level in-memory cache — persists for browser session
// Keyed as `${lang}:${source}` — e.g. `pt:Save`
const memCache = new Map<string, string>()

// Per-language batch accumulators (Pitfall 3 mitigation: key by language)
// Map<lang, Map<source, Array<resolver>>>
const pendingBatch = new Map<string, Map<string, Array<(s: string) => void>>>()
const batchTimers = new Map<string, ReturnType<typeof setTimeout>>()

async function flushBatch(lang: 'pt' | 'es', setPendingCount: Dispatch<SetStateAction<number>>) {
  const langBatch = pendingBatch.get(lang)
  if (!langBatch || langBatch.size === 0) return

  // Snapshot and clear the batch for this language
  const sources = Array.from(langBatch.keys())
  const resolvers = new Map(langBatch)
  langBatch.clear()
  batchTimers.delete(lang)

  // Increment pendingCount BEFORE fetch starts
  setPendingCount(c => c + 1)

  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: sources, targetLanguage: lang }),
    })

    if (!res.ok) {
      // Silent fallback: return source text on error
      resolvers.forEach((cbs, src) => cbs.forEach(cb => cb(src)))
      return
    }

    const raw = await res.text()
    // Strip markdown fences before parsing (Pitfall 6)
    const cleaned = raw
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '')
    const { translations } = JSON.parse(cleaned) as { translations: Record<string, string> }

    resolvers.forEach((cbs, src) => {
      const translated = translations[src] ?? src
      const cacheKey = `${lang}:${src}`
      memCache.set(cacheKey, translated)
      cbs.forEach(cb => cb(translated))
    })
  } catch {
    // Silent fallback on parse or network error
    resolvers.forEach((cbs, src) => cbs.forEach(cb => cb(src)))
  } finally {
    // Decrement pendingCount in finally — always fires even on error
    setPendingCount(c => c - 1)
  }
}

function resolveAsync(
  text: string,
  lang: 'pt' | 'es',
  setPendingCount: Dispatch<SetStateAction<number>>,
): Promise<string> {
  return new Promise((resolve) => {
    // Get or create per-language batch map
    if (!pendingBatch.has(lang)) {
      pendingBatch.set(lang, new Map())
    }
    const langBatch = pendingBatch.get(lang)!

    const existing = langBatch.get(text)
    if (existing) {
      existing.push(resolve)
    } else {
      langBatch.set(text, [resolve])
    }

    // Reset debounce timer for this language
    const existingTimer = batchTimers.get(lang)
    if (existingTimer) clearTimeout(existingTimer)

    const timer = setTimeout(() => flushBatch(lang, setPendingCount), 50)
    batchTimers.set(lang, timer)
  })
}

export function useTranslation() {
  const { language, setPendingCount } = useLanguage()

  function t(text: string): string {
    // EN fast-path: return text unchanged with zero overhead
    if (language === 'en') return text

    const cacheKey = `${language}:${text}`

    // 1. In-memory session cache
    const cached = memCache.get(cacheKey)
    if (cached) return cached

    // 2. Static dictionary
    const staticEntry = staticDict[language as 'pt' | 'es']?.[text]
    if (staticEntry) {
      memCache.set(cacheKey, staticEntry)
      return staticEntry
    }

    // 3. Async API fallback: queue string, return source text now
    // The component will re-render when the cached value is available via context state update
    resolveAsync(text, language as 'pt' | 'es', setPendingCount).then(() => {
      // memCache is set inside flushBatch — no action needed here
    })

    return text // Return source text synchronously while async resolves
  }

  return { t, language }
}
