'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from 'react'

export interface BreadcrumbItem {
  label: string
  href?: string
  /** Optional badge rendered after the label — e.g. an item count. */
  badge?: string | number
}

interface BreadcrumbContextValue {
  breadcrumbs: BreadcrumbItem[]
  setBreadcrumbs: (items: BreadcrumbItem[]) => void
  clearBreadcrumbs: () => void
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null)

function areBreadcrumbsEqual(
  current: BreadcrumbItem[],
  next: BreadcrumbItem[],
): boolean {
  return (
    current.length === next.length &&
    current.every(
      (item, index) =>
        item.label === next[index].label &&
        item.href === next[index].href &&
        Object.is(item.badge, next[index].badge),
    )
  )
}

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([])

  const publishBreadcrumbs = useCallback((items: BreadcrumbItem[]) => {
    setBreadcrumbs(current => (
      areBreadcrumbsEqual(current, items) ? current : items
    ))
  }, [])

  const clearBreadcrumbs = useCallback(() => {
    setBreadcrumbs(current => (current.length === 0 ? current : []))
  }, [])

  const value = useMemo(
    () => ({ breadcrumbs, setBreadcrumbs: publishBreadcrumbs, clearBreadcrumbs }),
    [breadcrumbs, publishBreadcrumbs, clearBreadcrumbs],
  )

  return (
    <BreadcrumbContext.Provider value={value}>
      {children}
    </BreadcrumbContext.Provider>
  )
}

function useBreadcrumbContext() {
  const ctx = useContext(BreadcrumbContext)
  if (!ctx) throw new Error('useBreadcrumbContext must be used within BreadcrumbProvider')
  return ctx
}

export function useBreadcrumb(items: BreadcrumbItem[]) {
  const { setBreadcrumbs, clearBreadcrumbs } = useBreadcrumbContext()

  // Publish after every render, but let the provider's semantic equality guard
  // discard referentially new arrays with unchanged content. Keeping unmount
  // cleanup separate prevents clear-then-publish churn on ordinary rerenders.
  useEffect(() => {
    setBreadcrumbs(items)
  })

  useEffect(() => () => clearBreadcrumbs(), [clearBreadcrumbs])
}

export function useCurrentBreadcrumbs(): BreadcrumbItem[] {
  const { breadcrumbs } = useBreadcrumbContext()
  return breadcrumbs
}
