import { Card, CardContent } from '@/components/ui/card'

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

      {/* Logo + wordmark above card (D-05) */}
      <div className="mb-12 flex flex-col items-center gap-2">
        <svg
          width="40"
          height="40"
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect width="40" height="40" rx="8" fill="hsl(240 5.9% 10%)" />
          <path d="M12 28L20 12L28 28" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15 23H25" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <span className="text-[28px] font-semibold leading-[1.15] tracking-tight">
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
