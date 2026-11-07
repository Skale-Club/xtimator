'use client'

import { useCallback } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * Keeps a list's search, tab, sort and page in the URL query, so Back, a
 * reload and a shared link all reopen the list exactly as it was left.
 *
 * Reads come from Next's useSearchParams (correct on the server render, so no
 * hydration flash). Writes use history.replaceState, which Next keeps in sync
 * with useSearchParams without a server round-trip, and which adds no history
 * entry per keystroke. Other params on the URL (the Projects page's
 * status/client) are left untouched.
 *
 * `prefix` namespaces the keys when two lists share a page (`?p_q=`).
 */
export type ListParam = 'q' | 'tab' | 'sort' | 'page'

export function useListUrlState({ enabled = true, prefix }: { enabled?: boolean; prefix?: string } = {}) {
  const params = useSearchParams()
  const keyOf = useCallback((name: ListParam) => (prefix ? `${prefix}_${name}` : name), [prefix])

  const read = useCallback(
    (name: ListParam): string | null => (enabled ? params?.get(keyOf(name)) ?? null : null),
    [enabled, params, keyOf],
  )

  const write = useCallback(
    (updates: Partial<Record<ListParam, string | null>>) => {
      if (!enabled || typeof window === 'undefined') return
      const url = new URL(window.location.href)
      for (const [name, value] of Object.entries(updates) as Array<[ListParam, string | null]>) {
        if (value === null || value === '') url.searchParams.delete(keyOf(name))
        else url.searchParams.set(keyOf(name), value)
      }
      if (url.href !== window.location.href) window.history.replaceState(null, '', url)
    },
    [enabled, keyOf],
  )

  return { read, write }
}
