import type { Metadata } from 'next'
import { PRIVATE_ROBOTS } from '@/lib/seo/route-policy'

export const metadata: Metadata = { robots: PRIVATE_ROBOTS }

// Same forced-light stage as the public estimate page (app/estimate/[token]/layout.tsx).
export default function ChangeOrderShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="light" className="min-h-screen bg-[hsl(var(--doc-stage))] text-foreground">
      {children}
    </div>
  )
}
