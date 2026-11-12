'use client'

import { useMemo } from 'react'
import { useBreadcrumb } from '@/components/app-shell/breadcrumb-context'

interface ClientBreadcrumbProps {
  clientName: string
}

/**
 * Publishes the Clients / {name} trail to the desktop top bar. Mobile shows no
 * trail (the bottom bar's Clients tab leads back; the header shows the app name).
 */
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
