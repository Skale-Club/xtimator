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
    <div className="flex size-12 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground">
      <span className="text-2xl">{initial}</span>
    </div>
  )
}

export function AuthCard({ branding, title, children }: AuthCardProps) {
  return (
    <div className="z-10 flex w-full flex-col items-center">
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
        <span className="text-3xl font-extrabold tracking-tight text-white">
          {branding.appName}
        </span>
      </div>

      <div className="relative w-full max-w-[420px]">
        <Card className="rounded-[1.5rem] border border-white/10 bg-black/40 shadow-2xl backdrop-blur-xl">
          <CardContent className="p-8">
            {title && (
              <h1 className="mb-8 text-center text-2xl font-bold tracking-tight text-white">{title}</h1>
            )}
            {children}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
