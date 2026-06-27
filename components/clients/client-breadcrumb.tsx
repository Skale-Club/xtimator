'use client'

import { useMemo } from 'react'
import { useBreadcrumb } from '@/components/app-shell/breadcrumb-context'

interface ClientBreadcrumbProps {
  clientName: string
}

export function ClientBreadcrumb({ clientName }: ClientBreadcrumbProps) {
  const breadcrumbItems = useMemo(
    () => [
      { label: 'Clients', href: '/clients' },
      { label: clientName },
    ],
    [clientName],
  )

  useBreadcrumb(breadcrumbItems)

  return null
}
