'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Menu, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetTrigger, SheetContent, SheetClose } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

interface LandingNavProps {
  appName: string
}

export function LandingNav({ appName }: LandingNavProps) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'fixed top-0 z-50 w-full h-16 flex items-center transition-all duration-200',
        scrolled
          ? 'backdrop-blur-md bg-background/80 border-b border-border'
          : 'bg-transparent border-transparent'
      )}
    >
      <nav className="mx-auto w-full max-w-[1200px] px-6 flex items-center justify-between">
        {/* Logo + wordmark */}
        <Link href="/" className="flex items-center gap-2 text-foreground hover:text-foreground/90 transition-colors">
          <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
          <span className="font-bold text-[length:var(--font-size-xl)] tracking-[var(--tracking-tight)]">
            {appName}
          </span>
        </Link>

        {/* Desktop nav — hidden below md */}
        <div className="hidden md:flex items-center gap-6">
          <a href="#how-it-works" className="text-[length:var(--font-size-base)] text-muted-foreground hover:text-foreground transition-colors">
            How It Works
          </a>
          <a href="#features" className="text-[length:var(--font-size-base)] text-muted-foreground hover:text-foreground transition-colors">
            Features
          </a>
        </div>

        {/* Desktop CTAs — hidden below md */}
        <div className="hidden md:flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/auth/login">Sign In</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/auth/signup">Get Started</Link>
          </Button>
        </div>

        {/* Mobile hamburger — visible below md */}
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden min-h-[44px] min-w-[44px]"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:w-80 pt-12">
            <div className="flex flex-col gap-4 px-2">
              <SheetClose asChild>
                <a href="#how-it-works" className="text-[length:var(--font-size-base)] text-muted-foreground hover:text-foreground transition-colors py-2">
                  How It Works
                </a>
              </SheetClose>
              <SheetClose asChild>
                <a href="#features" className="text-[length:var(--font-size-base)] text-muted-foreground hover:text-foreground transition-colors py-2">
                  Features
                </a>
              </SheetClose>
              <div className="pt-4 flex flex-col gap-3 border-t border-border">
                <Button variant="ghost" className="w-full justify-center min-h-[44px]" asChild>
                  <Link href="/auth/login">Sign In</Link>
                </Button>
                <Button className="w-full justify-center min-h-[44px]" asChild>
                  <Link href="/auth/signup">Get Started Free</Link>
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  )
}
