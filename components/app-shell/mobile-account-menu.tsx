'use client'

import Link from 'next/link'
import { Settings, Trash2, LogOut, HelpCircle } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { signOut } from '@/lib/actions/auth'
import { useTranslation } from '@/lib/i18n/use-translation'
import { useTourContext } from '@/components/tour/tour-provider'
import { useTour } from '@/components/tour/use-tour'
import { CompanySelector } from '@/components/app-shell/company-selector'

interface MobileAccountMenuProps {
  navUser: { email: string; avatarUrl: string | null }
  memberships: Array<{
    id: string
    name: string
    logo_url: string | null
  }>
  activeCompanyId: string
  /** Platform admin — shows the "Add new company" item in CompanySelector. */
  isAdmin?: boolean
  userName: string | null
  /** Read-only public demo session — hides Settings + Trash (matches desktop). */
  isDemo?: boolean
}

/**
 * Mobile profile menu — opens the SAME dropdown as the desktop sidebar footer,
 * triggered by the user avatar in the top-right of the mobile header.
 *
 * Renders <CompanySelector> (Companies switcher + Add new company) with a custom
 * avatar trigger and an accountMenuSlot mirroring the desktop slot built in
 * Sidebar (user name/email header + Settings + Trash + App Tour + Sign Out).
 * The company switch itself is handled entirely inside CompanySelector via the
 * existing `switchActiveCompany` server action — not reimplemented here.
 */
export function MobileAccountMenu({
  navUser,
  memberships,
  activeCompanyId,
  isAdmin,
  userName,
  isDemo,
}: MobileAccountMenuProps) {
  const { t } = useTranslation()
  const { setShowWelcome, setIsReviewMode } = useTourContext()
  const { resetAllTourState, startTour } = useTour()

  const initial = navUser.email.charAt(0).toUpperCase()

  function handleOpenTour() {
    resetAllTourState()
    startTour()
    setIsReviewMode(true)
    setShowWelcome(true)
  }

  const trigger = (
    <button className="flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer">
      <Avatar className="h-8 w-8">
        {navUser.avatarUrl && <AvatarImage src={navUser.avatarUrl} alt={navUser.email} />}
        <AvatarFallback className="text-sm bg-primary text-white font-semibold">
          {initial}
        </AvatarFallback>
      </Avatar>
    </button>
  )

  // Mirror of the desktop account slot (Sidebar) — kept as a local copy per the
  // 260725 mobile-parity task (Sidebar owns its copy; do not extract a shared
  // piece while another session is editing sidebar.tsx).
  const accountMenuSlot = (
    <>
      <div className="px-2 py-2">
        {userName && <p className="text-sm font-medium truncate">{userName}</p>}
        <p className="text-xs text-muted-foreground truncate">{navUser.email}</p>
      </div>
      <DropdownMenuSeparator />
      {!isDemo && (
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href="/settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />{t('Settings')}
          </Link>
        </DropdownMenuItem>
      )}
      {!isDemo && (
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href="/trash" className="flex items-center gap-2">
            <Trash2 className="h-4 w-4" />{t('Trash')}
          </Link>
        </DropdownMenuItem>
      )}
      <DropdownMenuItem className="cursor-pointer gap-2" onClick={handleOpenTour}>
        <HelpCircle className="h-4 w-4" />{t('App Tour')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="cursor-pointer gap-2 text-red-400 focus:text-red-400"
        onClick={() => signOut()}
      >
        <LogOut className="h-4 w-4" />{t('Sign Out')}
      </DropdownMenuItem>
    </>
  )

  return (
    <CompanySelector
      trigger={trigger}
      align="end"
      companies={memberships}
      activeCompanyId={activeCompanyId}
      isAdmin={isAdmin}
      accountMenuSlot={accountMenuSlot}
    />
  )
}
