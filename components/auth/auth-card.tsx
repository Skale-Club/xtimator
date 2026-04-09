import { Card, CardContent } from '@/components/ui/card'

interface AuthCardProps {
  children: React.ReactNode
}

export function AuthCard({ children }: AuthCardProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4">
      {/* Logo + wordmark above card (D-02) */}
      <div className="mb-8 flex flex-col items-center gap-2">
        {/* Placeholder SVG logomark — Phase 2 settings will allow logo upload */}
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
          EstimateBuilder Pro
        </span>
      </div>

      {/* Auth card (D-01) */}
      <Card className="w-full max-w-[400px] rounded-xl shadow-sm">
        <CardContent className="p-6">
          {children}
        </CardContent>
      </Card>
    </div>
  )
}
