import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AppIcon } from '@/components/ui/app-icon'
import { getBranding } from '@/lib/platform-config'

export async function TopNav() {
  const branding = await getBranding()

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 sm:px-8 lg:px-10">
        <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
          <AppIcon logoUrl={branding.logoUrl} appName={branding.appName} className="h-8 w-8" />
          <span className="text-xl font-bold tracking-tight text-foreground">{branding.appName}</span>
        </Link>
        <nav className="flex items-center gap-4">
          <Link
            href="/login"
            className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Log in
          </Link>
          <Button
            asChild
            size="sm"
            className="h-9 bg-primary text-primary-foreground shadow-[0_0_15px_hsl(var(--primary)/0.3)] hover:bg-primary/90"
          >
            <Link href="/signup">Start free</Link>
          </Button>
        </nav>
      </div>
    </header>
  )
}
