import type { ReactNode } from 'react'
import { MarketingTags } from '@/components/marketing/marketing-tags'

/** Public marketing section: loads the marketing tags and the cookie banner. */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <MarketingTags />
    </>
  )
}
