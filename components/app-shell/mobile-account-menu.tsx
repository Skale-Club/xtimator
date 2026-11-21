'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Settings, LogOut, HelpCircle, GraduationCap, SunMoon, Coins } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { usageBandClass } from '@/lib/billing/usage-color'
import { formatCredits } from '@/lib/billing/format-usd'
import { ThemeSegmentedPicker } from '@/components/app-shell/theme-toggle'
import { CreditMenuRow } from '@/components/app-shell/credit-chip'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { signOut } from '@/lib/auth/sign-out'
import { useTranslation } from '@/lib/i18n/use-translation'
import { useTourContext } from '@/components/tour/tour-provider'
import { useTour } from '@/components/tour/use-tour'
import { CompanySelector } from '@/components/app-shell/company-selector'
import { InstallAppMenuItem, InstallAppDialog } from '@/components/pwa/install-app-menu-item'

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
  /** Read-only public demo session — hides Academy (matches desktop). */
  isDemo?: boolean
  /** At least one Academy course is visible (server-computed); adds "Academy" below App Tour. */
  academyAvailable?: boolean
  /** Company credit state; the Credits row renders whenever present. */
  credits?: { percentUsed: number | null; balance: number }
}

const PHONE_ROW =
  'flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] text-foreground transition-colors hover:bg-accent active:bg-accent'

/**
 * Mobile profile menu — opens the SAME dropdown as the desktop sidebar footer,
 * triggered by the user avatar in the top-right of the mobile header.
 *
 * Renders <CompanySelector> (Companies switcher + Add new company) with a custom
 * avatar trigger and an accountMenuSlot mirroring the desktop slot built in
 * Sidebar (user name/email header, Settings, then the help group: Install app,
 * App Tour, Academy; then Sign Out). Mobile-only extras: the Credits row and the theme picker, which
 * the desktop keeps in its topbar but the narrow mobile header has no room for.
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
  academyAvailable,
  credits,
}: MobileAccountMenuProps) {
  const { t } = useTranslation()
  const { setShowWelcome, setIsReviewMode } = useTourContext()
  const { resetAllTourState, startTour } = useTour()
  const [installHelpOpen, setInstallHelpOpen] = useState(false)

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
      {credits && <CreditMenuRow percentUsed={credits.percentUsed} balance={credits.balance} />}
      <div data-testid="theme-menu-row" className="flex items-center gap-2 px-2 py-1.5 text-sm">
        <SunMoon className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1">{t('Theme')}</span>
        <ThemeSegmentedPicker />
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild className="cursor-pointer">
        <Link href="/settings" className="flex items-center gap-2">
          <Settings className="h-4 w-4" />{t('Settings')}
        </Link>
      </DropdownMenuItem>
      {/* Help group: Install app (phones only, see InstallAppMenuItem), App Tour, Academy. */}
      <DropdownMenuSeparator />
      <InstallAppMenuItem onShowInstructions={() => setInstallHelpOpen(true)} />
      <DropdownMenuItem className="cursor-pointer gap-2" onClick={handleOpenTour}>
        <HelpCircle className="h-4 w-4" />{t('App Tour')}
      </DropdownMenuItem>
      {academyAvailable && !isDemo && (
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href="/academy" className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />{t('Academy')}
          </Link>
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="cursor-pointer gap-2 text-red-400 focus:text-red-400"
        onClick={() => signOut()}
      >
        <LogOut className="h-4 w-4" />{t('Sign Out')}
      </DropdownMenuItem>
    </>
  )

  // Phones (< 640px): the same items as comfortable rows inside the bottom
  // sheet the selector opens (the dropdown items need a dropdown around them).
  const phoneSlot = (close: () => void) => (
    <>
      <div className="mt-2 border-t border-border px-3 pb-1 pt-3">
        {userName && <p className="truncate text-sm font-medium">{userName}</p>}
        <p className="truncate text-xs text-muted-foreground">{navUser.email}</p>
      </div>
      {credits && (
        <Link
          href="/settings/billing"
          data-testid="credit-menu-row"
          onClick={close}
          className={cn(PHONE_ROW, 'flex-col items-stretch gap-1.5')}
        >
          <span className="flex items-center gap-3">
            <Coins className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="flex-1">{t('Credits')}</span>
            <span className="font-mono text-xs font-medium tabular-nums text-muted-foreground">
              {formatCredits(credits.balance ?? 0)}
              {credits.percentUsed === null ? ` ${t('credits')}` : ` · ${credits.percentUsed}% ${t('used')}`}
            </span>
          </span>
          {credits.percentUsed !== null && (
            <Progress value={credits.percentUsed} className={cn('h-1.5 w-full', usageBandClass(credits.percentUsed))} />
          )}
        </Link>
      )}
      <div data-testid="theme-menu-row" className="flex min-h-12 items-center gap-3 px-3 py-2 text-[15px]">
        <SunMoon className="h-5 w-5 text-muted-foreground" />
        <span className="flex-1">{t('Theme')}</span>
        <ThemeSegmentedPicker />
      </div>
      <Link href="/settings" onClick={close} className={PHONE_ROW}>
        <Settings className="h-5 w-5 text-muted-foreground" />{t('Settings')}
      </Link>
      <InstallAppMenuItem variant="row" onDone={close} onShowInstructions={() => setInstallHelpOpen(true)} />
      <button
        type="button"
        className={PHONE_ROW}
        onClick={() => {
          close()
          handleOpenTour()
        }}
      >
        <HelpCircle className="h-5 w-5 text-muted-foreground" />{t('App Tour')}
      </button>
      {academyAvailable && !isDemo && (
        <Link href="/academy" onClick={close} className={PHONE_ROW}>
          <GraduationCap className="h-5 w-5 text-muted-foreground" />{t('Academy')}
        </Link>
      )}
      <button
        type="button"
        className={cn(PHONE_ROW, 'text-red-400')}
        onClick={() => {
          close()
          signOut()
        }}
      >
        <LogOut className="h-5 w-5" />{t('Sign Out')}
      </button>
    </>
  )

  return (
    <>
      <CompanySelector
        trigger={trigger}
        phoneSlot={phoneSlot}
        align="end"
        companies={memberships}
        activeCompanyId={activeCompanyId}
        isAdmin={isAdmin}
        accountMenuSlot={accountMenuSlot}
      />
      <InstallAppDialog open={installHelpOpen} onOpenChange={setInstallHelpOpen} />
    </>
  )
}
