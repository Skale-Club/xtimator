import Link from 'next/link'
import { getBranding } from '@/lib/platform-config'

export async function LandingFooter() {
  const branding = await getBranding()

  return (
    <footer className="border-t border-white/10 bg-transparent">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-muted-foreground sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <div>
          <p className="font-bold text-foreground">{branding.appName}</p>
          <p>AI-powered estimates for service businesses that quote on site.</p>
        </div>
        <nav className="flex flex-wrap items-center gap-4" aria-label="Footer navigation">
          <Link
            href="/auth/signup"
            className="rounded px-1 py-0.5 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0f]"
          >
            Create account
          </Link>
          <Link
            href="/auth/login"
            className="rounded px-1 py-0.5 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0f]"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  )
}
