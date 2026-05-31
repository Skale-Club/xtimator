'use client'

import { type ReactNode } from 'react'
import { EstimateVersionProvider } from './estimate-version-context'

export function ProjectPageShell({ children }: { children: ReactNode }) {
  return <EstimateVersionProvider>{children}</EstimateVersionProvider>
}
