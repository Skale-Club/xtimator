import Link from 'next/link'
import { AppIcon } from '@/components/ui/app-icon'
import { TopNavAuth } from '@/components/landing/top-nav-auth'

interface TopNavProps {
  branding: { appName: string; logoUrl: string | null }
  onOpenAuth?: (mode: 'login' | 'signup') => void
}

export function TopNav({ branding, onOpenAuth }: TopNavProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 sm:px-8 lg:px-10">
        <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
          <AppIcon logoUrl={branding.logoUrl} appName={branding.appName} className="h-6 w-6" />
          <span className="text-lg font-bold tracking-tight text-foreground">{branding.appName}</span>
        </Link>
        <nav className="flex items-center gap-4">
          <TopNavAuth branding={branding} onOpenAuth={onOpenAuth} />
        </nav>
      </div>
    </header>
  )
}
