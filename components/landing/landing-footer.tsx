import Link from 'next/link'

export function LandingFooter() {
  return (
    <footer className="border-t border-white/10 bg-transparent">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-muted-foreground sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <div>
          <p className="font-semibold text-foreground">Xtimator</p>
          <p>AI-powered estimates for service businesses that quote on site.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/auth/signup"
            className="rounded-[var(--radius-sm)] px-1 py-0.5 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
          >
            Create account
          </Link>
          <Link
            href="/auth/login"
            className="rounded-[var(--radius-sm)] px-1 py-0.5 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
          >
            Sign in
          </Link>
        </div>
      </div>
    </footer>
  )
}
