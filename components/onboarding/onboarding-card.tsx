import { Card, CardContent } from '@/components/ui/card'
import { getBranding } from '@/lib/platform-config'

interface OnboardingCardProps {
  children: React.ReactNode
  skipAction?: React.ReactNode
}

export async function OnboardingCard({ children, skipAction }: OnboardingCardProps) {
  const branding = await getBranding()
  const appName = branding.appName

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4">
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

      {/* Wizard card (D-02 -- 600px variant) */}
      <Card className="w-full max-w-[600px] rounded-xl shadow-sm">
        <CardContent className="p-6">
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
