'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbContextValue {
  breadcrumbs: BreadcrumbItem[]
  setBreadcrumbs: (items: BreadcrumbItem[]) => void
  clearBreadcrumbs: () => void
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null)

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([])

  const clearBreadcrumbs = useCallback(() => {
    setBreadcrumbs([])
  }, [])

  return (
    <BreadcrumbContext.Provider value={{ breadcrumbs, setBreadcrumbs, clearBreadcrumbs }}>
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

  useEffect(() => {
    setBreadcrumbs(items)
    return () => clearBreadcrumbs()
  }, [items, setBreadcrumbs, clearBreadcrumbs])
}

export function useCurrentBreadcrumbs(): BreadcrumbItem[] {
  const { breadcrumbs } = useBreadcrumbContext()
  return breadcrumbs
}
