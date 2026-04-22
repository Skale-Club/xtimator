import type { CSSProperties } from 'react'
import { getBranding } from '@/lib/platform-config'
import { hexToHslTriplet } from '@/lib/color'

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const branding = await getBranding()
  const triplet = branding.primaryColor
    ? hexToHslTriplet(branding.primaryColor)
    : null
  const style = {
    ['--platform-primary' as string]: triplet ?? '224 86% 60%',
  } as CSSProperties

  return (
    <div
      data-theme="dark-auth"
      style={style}
      className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4"
    >
      {children}
    </div>
  )
}
