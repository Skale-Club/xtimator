'use client'

import Link from 'next/link'
import { AppIcon } from '@/components/ui/app-icon'

interface LandingFooterProps {
  appName: string
  logoUrl: string | null
  onOpenAuth?: (mode: 'login' | 'signup') => void
}

export function LandingFooter({ appName, logoUrl, onOpenAuth }: LandingFooterProps) {

  return (
    <footer className="border-t border-white/5 bg-background pt-5 pb-0 sm:py-16">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-10">
        <div className="grid gap-8 sm:grid-cols-4 sm:gap-12 lg:gap-8">
          <div className="sm:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-80">
              <AppIcon logoUrl={logoUrl} appName={appName} className="h-6 w-6" />
              <span className="text-[17px] font-bold tracking-tight sm:text-lg">{appName}</span>
            </Link>
            <p className="mt-2 sm:mt-6 max-w-xs text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
              AI-powered estimates for service businesses that quote on site. Built for speed, designed for pros.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6 sm:contents">
            <div>
              <h4 className="text-sm font-semibold text-white">Product</h4>
              <ul className="mt-4 sm:mt-6 space-y-4 text-sm text-muted-foreground">
                <li>
                  <Link href="/#features" className="transition-colors hover:text-white">Features</Link>
                </li>
                <li>
                  <Link href="/#how-it-works" className="transition-colors hover:text-white">How it works</Link>
                </li>
                <li>
                  <Link href="/industries" className="transition-colors hover:text-white">Industries</Link>
                </li>
                <li>
                  <Link href="/blog" className="transition-colors hover:text-white">Blog</Link>
                </li>
                <li>
                  <button type="button" onClick={() => onOpenAuth?.('signup')} className="transition-colors hover:text-white">Start</button>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white">Legal</h4>
              <ul className="mt-4 sm:mt-6 space-y-4 text-sm text-muted-foreground">
                <li>
                  <Link href="/privacy-policy" className="transition-colors hover:text-white">Privacy Policy</Link>
                </li>
                <li>
                  <Link href="/terms-of-service" className="transition-colors hover:text-white">Terms of Service</Link>
                </li>
                <li>
                  <Link href="/demo" className="transition-colors hover:text-white">See Demo</Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="mt-3 flex flex-col items-start justify-between gap-3 border-t border-white/5 pt-3 sm:mt-16 sm:gap-6 sm:pt-8 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-1">
            <p className="text-[13px] text-muted-foreground sm:text-sm">
              &copy; {new Date().getFullYear()} {appName}. All rights reserved.
            </p>
            <p className="text-xs text-muted-foreground/60">Developed by Skale Club</p>
          </div>
          <Link href="/blog" className="hidden text-sm text-muted-foreground transition-colors hover:text-white sm:block">
            Estimating guides
          </Link>
        </div>
      </div>
    </footer>
  )
}
