import { Card, CardContent } from '@/components/ui/card'

export interface AuthBranding {
  appName: string
  logoUrl: string | null
}

interface AuthCardProps {
  branding: AuthBranding
  title?: string
  children: React.ReactNode
}

/**
 * Inline SVG logomark used as fallback when branding.logoUrl is null (R-09).
 * Exported so other consumers (e.g. nav, share pages) can reuse the same mark.
 */
export function LogoFallback() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="8" fill="hsl(var(--primary))" />
      <path
        d="M12 28L20 12L28 28"
        stroke="hsl(var(--primary-foreground))"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 23H25"
        stroke="hsl(var(--primary-foreground))"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function AuthCard({ branding, title, children }: AuthCardProps) {
  return (
    <div className="flex w-full flex-col items-center">
      {/* Logo + wordmark above card (D-02) — fed from getBranding() */}
      <div className="mb-8 flex flex-col items-center gap-2">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logoUrl}
            alt=""
            width={40}
            height={40}
            aria-hidden="true"
          />
        ) : (
          <LogoFallback />
        )}
        <span className="text-2xl font-semibold leading-[1.15] tracking-tight">
          {branding.appName}
        </span>
      </div>

      {/* Auth card (D-01) — uses semantic tokens that resolve to dark values
          inside [data-theme="dark-auth"] */}
      <Card className="w-full max-w-[400px] rounded-xl border border-border bg-card text-card-foreground shadow-none">
        <CardContent className="p-6">
          {title && (
            <h1 className="mb-6 text-center text-xl font-semibold">{title}</h1>
          )}
          {children}
        </CardContent>
      </Card>
    </div>
  )
}
