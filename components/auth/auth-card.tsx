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
    <div className="flex size-12 items-center justify-center rounded-xl bg-[#406EF1] font-bold text-white shadow-[0_0_20px_rgba(64,110,241,0.5)]">
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
            className="size-12 rounded-xl object-contain shadow-[0_0_20px_rgba(64,110,241,0.3)]"
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
        <div className="absolute -inset-1 -z-10 rounded-2xl bg-gradient-to-b from-[#406EF1]/20 to-transparent blur-xl" />
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
