'use client'

import { Check, Download, Share, SquarePlus, EllipsisVertical } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BottomSheetCloseButton, BottomSheetContent } from '@/components/ui/bottom-sheet'
import { AppIcon } from '@/components/ui/app-icon'
import { useTranslation } from '@/lib/i18n/use-translation'
import { googlePlayUrl } from '@/lib/store-links'
import { useInstallApp, type InstallPlatform } from './use-install-app'

interface InstallAppMenuItemProps {
  /** Opens the manual install instructions (iOS, or Android without the native prompt). */
  onShowInstructions: () => void
  /** 'row' renders a plain full-width row for the phone account sheet (no dropdown context). */
  variant?: 'menu' | 'row'
  /** Called after the row is tapped (the phone sheet closes itself). */
  onDone?: () => void
}

const ROW_CLASS =
  'flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] text-foreground transition-colors hover:bg-accent active:bg-accent'

/**
 * "Install app" entry for the account menu, shown only where installing is
 * worth it: on a phone or tablet, in the browser.
 * - Android: opens the Xtimator app on Google Play (the official app, a
 *   Trusted Web Activity), not the browser's own PWA install, so nobody ends
 *   up with two copies.
 * - iOS (no app store app, no install API): the Add to Home Screen steps.
 * - Desktop: hidden. Xtimator is used on the job site with the phone; a
 *   desktop install adds nothing.
 * - Already installed (home-screen app, or the Play app itself): hidden.
 */
export function InstallAppMenuItem({ onShowInstructions, variant = 'menu', onDone }: InstallAppMenuItemProps) {
  const { t } = useTranslation()
  const { platform, installed } = useInstallApp()

  if (!platform || installed || platform === 'desktop') return null

  if (variant === 'row') {
    if (platform === 'android') {
      return (
        <a
          href={googlePlayUrl('account_menu')}
          target="_blank"
          rel="noopener noreferrer"
          className={ROW_CLASS}
          onClick={onDone}
        >
          <Download className="h-5 w-5 text-muted-foreground" />{t('Install app')}
        </a>
      )
    }
    return (
      <button
        type="button"
        className={ROW_CLASS}
        onClick={() => {
          onDone?.()
          onShowInstructions()
        }}
      >
        <Download className="h-5 w-5 text-muted-foreground" />{t('Install app')}
      </button>
    )
  }

  if (platform === 'android') {
    return (
      <DropdownMenuItem asChild className="cursor-pointer gap-2">
        <a href={googlePlayUrl('account_menu')} target="_blank" rel="noopener noreferrer">
          <Download className="h-4 w-4" />{t('Install app')}
        </a>
      </DropdownMenuItem>
    )
  }

  return (
    <DropdownMenuItem className="cursor-pointer gap-2" onSelect={onShowInstructions}>
      <Download className="h-4 w-4" />{t('Install app')}
    </DropdownMenuItem>
  )
}

interface InstallAppDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Step = { icon: React.ComponentType<{ className?: string }>; text: string }

const STEPS: Record<Exclude<InstallPlatform, 'desktop'>, Step[]> = {
  ios: [
    { icon: Share, text: 'Tap the Share button in the browser toolbar (in Safari it may be under the ••• menu)' },
    { icon: SquarePlus, text: 'Scroll down and tap "Add to Home Screen"' },
    { icon: Check, text: 'Tap "Add" in the top-right corner' },
  ],
  android: [
    { icon: EllipsisVertical, text: 'Open the browser menu (⋮) in the top-right corner' },
    { icon: Download, text: 'Tap "Install app" or "Add to Home screen"' },
    { icon: Check, text: 'Confirm with "Install"' },
  ],
}

/**
 * Manual install instructions. Rendered outside the dropdown content so it
 * survives the menu closing.
 */
export function InstallAppDialog({ open, onOpenChange }: InstallAppDialogProps) {
  const { t } = useTranslation()
  const { platform } = useInstallApp()
  const steps = STEPS[platform === 'ios' ? 'ios' : 'android']

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent desktopClassName="sm:max-w-sm">
        <DialogHeader
          data-sheet-drag=""
          className="relative shrink-0 items-center px-5 pb-3 pt-1 text-center touch-none sm:items-center sm:pt-6 sm:text-center"
        >
          <div className="absolute right-3 top-0 sm:top-4">
            <BottomSheetCloseButton label={t('Close')} />
          </div>
          <AppIcon className="h-14 w-14 rounded-2xl" />
          <DialogTitle>{t('Install Xtimator')}</DialogTitle>
          <DialogDescription>
            {t('Add Xtimator to your home screen for quick, full-screen access.')}
          </DialogDescription>
        </DialogHeader>
        <ol className="flex flex-col gap-3 overflow-y-auto px-5 pb-6 pt-2">
          {steps.map((step, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <span className="flex-1 text-sm text-foreground">{t(step.text)}</span>
              <step.icon className="h-5 w-5 shrink-0 text-primary" />
            </li>
          ))}
        </ol>
      </BottomSheetContent>
    </Dialog>
  )
}
