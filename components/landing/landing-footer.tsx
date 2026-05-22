import Link from 'next/link'
import { AppIcon } from '@/components/ui/app-icon'
import { getBranding } from '@/lib/platform-config'

export async function LandingFooter() {
  const branding = await getBranding()

  return (
    <footer className="border-t border-white/5 bg-background py-16">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-10">
        <div className="grid gap-12 md:grid-cols-4 lg:gap-8">
          <div className="md:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-80">
              <AppIcon logoUrl={branding.logoUrl} appName={branding.appName} className="h-6 w-6" />
              <span className="text-lg font-bold tracking-tight">{branding.appName}</span>
            </Link>
            <p className="mt-6 max-w-xs text-sm leading-relaxed text-muted-foreground">
              AI-powered estimates for service businesses that quote on site. Built for speed, designed for pros.
            </p>
          </div>
          
          <div>
            <h4 className="text-sm font-semibold text-white">Product</h4>
            <ul className="mt-6 space-y-4 text-sm text-muted-foreground">
              <li>
                <Link href="#" className="transition-colors hover:text-white">Features</Link>
              </li>
              <li>
                <Link href="#" className="transition-colors hover:text-white">How it works</Link>
              </li>
              <li>
                <Link href="/signup" className="transition-colors hover:text-white">Start free</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white">Legal</h4>
            <ul className="mt-6 space-y-4 text-sm text-muted-foreground">
              <li>
                <Link href="#" className="transition-colors hover:text-white">Privacy Policy</Link>
              </li>
              <li>
                <Link href="#" className="transition-colors hover:text-white">Terms of Service</Link>
              </li>
              <li>
                <Link href="/login" className="transition-colors hover:text-white">Log in</Link>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="mt-16 flex flex-col items-center justify-between gap-6 border-t border-white/5 pt-8 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} {branding.appName}. All rights reserved.
          </p>
          <div className="flex gap-6 text-muted-foreground">
            <Link href="#" className="transition-colors hover:text-white">
              <span className="sr-only">Twitter</span>
              <svg className="size-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
