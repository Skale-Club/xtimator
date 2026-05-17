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

export function LogoFallback({ appName }: { appName?: string }) {
  const initial = appName ? appName.charAt(0) : 'X'
  return (
    <div className="flex size-12 items-center justify-center rounded-xl gradient-brand font-bold text-white shadow-[0_8px_24px_-6px_hsl(var(--primary)/0.6)]">
      <span className="text-2xl">{initial}</span>
    </div>
  )
}

export function AuthCard({ branding, title, children }: AuthCardProps) {
  return (
    <div className="z-10 flex w-full max-w-[460px] flex-col items-center">
      <div className="mb-8 flex flex-col items-center gap-3">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logoUrl}
            alt=""
            className="h-12 w-auto object-contain"
            aria-hidden="true"
          />
        ) : (
          <LogoFallback appName={branding.appName} />
        )}
        <span className="text-3xl font-semibold tracking-tight text-white">
          {branding.appName}
        </span>
      </div>

      {/* Stronger glass — gradient-border via mask trick + bumped blur + heavier shadow.
          variant="glass-strong" pulls in --glass-blur-strong (24px) per Phase 71 tokens. */}
      <div className="relative z-10 w-full">
        <Card
          variant="glass-strong"
          className="gradient-border-card rounded-[1.5rem] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]"
        >
          <CardContent className="p-8 sm:p-10">
            {title && (
              <h1 className="mb-8 text-center text-2xl font-semibold tracking-tight text-white">{title}</h1>
            )}
            {children}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
