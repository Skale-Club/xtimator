// v2-horizontal-logo
import { Card, CardContent } from '@/components/ui/card'
import { AppIcon } from '@/components/ui/app-icon'

interface OnboardingCardProps {
  children: React.ReactNode
  skipAction?: React.ReactNode
  appName: string
}

export function OnboardingCard({ children, skipAction, appName }: OnboardingCardProps) {

  return (
    <div className="relative isolate flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      {/* Phase 71 gradient-hero radial backdrop */}
      <div aria-hidden className="absolute inset-0 -z-10 gradient-hero" />

      {/* Logo + wordmark above card */}
      <div className="mb-12 flex items-center gap-2.5">
        <AppIcon className="h-6 w-6" />
        <span className="text-xl font-bold tracking-tight">
          {appName}
        </span>
      </div>

      {/* Wizard card (D-02 -- 600px variant) — Phase 71 glass */}
      <Card variant="glass" className="w-full max-w-[600px] rounded-xl">
        <CardContent className="p-6 md:p-8">
          {children}
        </CardContent>
      </Card>

      {/* Skip action slot */}
      {skipAction && (
        <div className="mt-4 text-center">
          {skipAction}
        </div>
      )}
    </div>
  )
}
