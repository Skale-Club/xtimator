'use client'

import { useBreadcrumb } from '@/components/app-shell/breadcrumb-context'

interface ClientBreadcrumbProps {
  clientName: string
}

export function ClientBreadcrumb({ clientName }: ClientBreadcrumbProps) {
  useBreadcrumb([
    { label: 'Clients', href: '/clients' },
    { label: clientName },
  ])

  return null
}
