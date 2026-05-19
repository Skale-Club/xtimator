'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Settings, LogOut, ShieldCheck } from 'lucide-react'
import { signOut } from '@/lib/actions/auth'
import { ThemeToggle } from '@/components/app-shell/theme-toggle'
import { LanguageToggle } from '@/components/app-shell/language-toggle'
import { CompanySelector } from '@/components/app-shell/company-selector'
import { useTranslation } from '@/lib/i18n/use-translation'
import { ContextualTooltip, TOOLTIP_KEYS } from '@/components/tour/contextual-tooltip'

interface TopbarProps {
  company: {
    id: string
    name: string
    logo_url: string | null
    owner_name: string | null
  }
  isAdmin?: boolean
}

export function Topbar({ company, isAdmin }: TopbarProps) {
  const initial = (company.owner_name ?? company.name).charAt(0).toUpperCase()
  const { t } = useTranslation()
  const router = useRouter()

  // Cmd+Shift+A (or Ctrl+Shift+A) → jump to /admin (admin-only)
  useEffect(() => {
    if (!isAdmin) return
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        router.push('/admin')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isAdmin, router])

  return (
    <header
      data-testid="app-topbar"
      className="hidden md:flex sticky top-0 z-40 items-center justify-between glass border-b border-[var(--glass-border)] px-6 h-16"
    >
      <CompanySelector company={company} />
      <div className="flex items-center gap-1">
        {isAdmin && (
          <Link
            href="/admin"
            className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            title={t('Admin Panel') + ' (⌘⇧A)'}
            aria-label={t('Open Super Admin Panel')}
          >
            <ShieldCheck className="h-4 w-4" />
          </Link>
        )}
        <ContextualTooltip
          tooltipKey={TOOLTIP_KEYS.languageToggle}
          text="Switch languages — estimates can be sent in EN, PT, or ES"
          side="bottom"
        >
          <span data-tour="language-toggle">
            <LanguageToggle />
          </span>
        </ContextualTooltip>
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex cursor-pointer items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-sm">{initial}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-48 glass-strong border border-[var(--glass-border)] shadow-glass"
          >
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/settings" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                {t('Settings')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="flex cursor-pointer items-center gap-2 text-destructive focus:text-destructive"
              onClick={() => signOut()}
            >
              <LogOut className="h-4 w-4" />
              {t('Sign Out')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
