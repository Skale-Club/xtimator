'use client'

import { Check, Download, Share, SquarePlus, EllipsisVertical } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AppIcon } from '@/components/ui/app-icon'
import { useTranslation } from '@/lib/i18n/use-translation'
import { googlePlayUrl } from '@/lib/store-links'
import { useInstallApp, type InstallPlatform } from './use-install-app'

interface InstallAppMenuItemProps {
  /** Opens the manual install instructions (iOS, or Android without the native prompt). */
  onShowInstructions: () => void
}

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
export function InstallAppMenuItem({ onShowInstructions }: InstallAppMenuItemProps) {
  const { t } = useTranslation()
  const { platform, installed } = useInstallApp()

  if (!platform || installed || platform === 'desktop') return null

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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center text-center sm:items-center sm:text-center">
          <AppIcon className="h-14 w-14 rounded-2xl" />
          <DialogTitle>{t('Install Xtimator')}</DialogTitle>
          <DialogDescription>
            {t('Add Xtimator to your home screen for quick, full-screen access.')}
          </DialogDescription>
        </DialogHeader>
        <ol className="flex flex-col gap-3">
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
      </DialogContent>
    </Dialog>
  )
}
