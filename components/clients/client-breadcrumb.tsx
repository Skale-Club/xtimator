'use client'

import { useMemo } from 'react'
import { useBreadcrumb } from '@/components/app-shell/breadcrumb-context'
import { PageBreadcrumb } from '@/components/app-shell/page-breadcrumb'

interface ClientBreadcrumbProps {
  clientName: string
}

/**
 * Publishes the Clients / {name} trail to the desktop top bar and renders it
 * in-page on mobile (the mobile header only shows the app name).
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

  return <PageBreadcrumb items={breadcrumbItems} className="-mb-3" />
}
