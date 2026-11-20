'use client'

import { type ReactNode } from 'react'
import { EstimateVersionProvider } from './estimate-version-context'
import { GenerationStatusProvider } from './generation-status-context'

export function ProjectPageShell({ children }: { children: ReactNode }) {
  return (
    <EstimateVersionProvider>
      <GenerationStatusProvider>{children}</GenerationStatusProvider>
    </EstimateVersionProvider>
  )
}
