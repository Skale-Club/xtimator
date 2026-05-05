'use client'

import Link from 'next/link'
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

  return (
    <header data-testid="app-topbar" className="hidden md:flex items-center justify-between border-b border-border bg-background px-6 h-16">
      <CompanySelector company={company} />
      <div className="flex items-center gap-1">
        {isAdmin && (
          <Link
            href="/admin"
            className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            title="Admin Panel"
          >
            <ShieldCheck className="h-4 w-4" />
          </Link>
        )}
        <LanguageToggle />
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex cursor-pointer items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-sm">{initial}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
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
