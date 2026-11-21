'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, ChevronsUpDown, Building2, Loader2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { BottomSheetCloseButton, BottomSheetContent } from '@/components/ui/bottom-sheet'
import { useIsPhone } from '@/components/ui/use-is-phone'
import { useTranslation } from '@/lib/i18n/use-translation'
import { switchActiveCompany } from '@/lib/actions/active-company'
import { AdminCreateCompanyModal } from '@/components/app-shell/admin-create-company-modal'

/**
 * Phase 81 — Company switcher dropdown.
 *
 * Consumes the live membership-companies list via props. Switches the active
 * company through the server action `switchActiveCompany` inside useTransition
 * (SWITCH-07). Loader2 spinner replaces the Check on the clicked item while
 * the transition is pending. forbidden / unauthenticated errors → toast.error +
 * router.refresh (SWITCH-08). Clicking the already-active company is a no-op
 * (SWITCH-09). "Add new company" is a <Link> to /onboarding?mode=add
 * (SWITCH-10, SWITCH-12), never a server-action call.
 */

interface CompanyOption {
  id: string
  name: string
  logo_url: string | null
}

interface CompanySelectorProps {
  companies: CompanyOption[]
  activeCompanyId: string
  collapsed?: boolean
  /** Platform admin — renders the "Add new company" item. Hidden for regular users. */
  isAdmin?: boolean
  /**
   * Optional slot rendered at the bottom of the dropdown, after the
   * "Add new company" item and a separator. Used by Sidebar to merge the
   * old user-menu items (Settings / App Tour / Sign Out) into this single
   * dropdown so the footer is one widget instead of two (2026-05-26 UX fix).
   */
  accountMenuSlot?: React.ReactNode
  /**
   * Optional custom trigger. When provided, it replaces the default
   * company-avatar button as the dropdown trigger (rendered via `asChild`).
   * Used by the mobile header to open this same dropdown from the user avatar.
   */
  trigger?: React.ReactNode
  /** Alignment of the dropdown content relative to the trigger. Defaults to 'start'. */
  align?: 'start' | 'end'
  /**
   * Phones (< 640px) with a custom `trigger` open a bottom sheet instead of the
   * dropdown. This is its account section (plain rows, not DropdownMenuItem);
   * `close` dismisses the sheet. Without it, phones keep the dropdown.
   */
  phoneSlot?: (close: () => void) => React.ReactNode
}

function initialOf(name: string): string {
  return name.charAt(0).toUpperCase()
}

export function CompanySelector({
  companies,
  activeCompanyId,
  collapsed = false,
  isAdmin = false,
  accountMenuSlot,
  trigger,
  align = 'start',
  phoneSlot,
}: CompanySelectorProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const isPhone = useIsPhone()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const active =
    companies.find((c) => c.id === activeCompanyId) ?? companies[0] ?? null

  function handleSwitch(id: string, onSwitched?: () => void) {
    if (id === activeCompanyId) return // SWITCH-09 no-op
    setPendingId(id)
    startTransition(async () => {
      const result = await switchActiveCompany(id)
      if ('error' in result) {
        // SWITCH-08: forbidden + unauthenticated branches both surface as a
        // generic access message and a layout refresh so stale data is purged.
        toast.error('You no longer have access to that company.')
        router.refresh()
      } else {
        onSwitched?.()
      }
      setPendingId(null)
    })
  }

  if (isPhone && trigger && phoneSlot) {
    const close = () => setSheetOpen(false)
    return (
      <>
        <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
          <DialogTrigger asChild>{trigger}</DialogTrigger>
          <BottomSheetContent className="nx-surface" data-testid="account-sheet">
            <DialogHeader
              data-sheet-drag=""
              className="flex shrink-0 flex-row items-center justify-between gap-3 pb-2 pl-6 pr-3 pt-1 text-left touch-none"
            >
              <DialogTitle className="text-[19px] font-semibold leading-tight tracking-tight">
                {t('Account')}
              </DialogTitle>
              <BottomSheetCloseButton label={t('Close')} />
              <DialogDescription className="sr-only">{t('Companies')}</DialogDescription>
            </DialogHeader>
            <div className="flex min-h-0 flex-col gap-1 overflow-y-auto px-3 pb-5 pt-1">
              {companies.length > 0 && (
                <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('Companies')}
                </p>
              )}
              {companies.map((c) => {
                const isActive = c.id === activeCompanyId
                const isItemPending = c.id === pendingId
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={isPending}
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => handleSwitch(c.id, close)}
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] transition-colors hover:bg-accent active:bg-accent disabled:opacity-60"
                  >
                    <Avatar className="h-7 w-7 shrink-0">
                      {c.logo_url && <AvatarImage src={c.logo_url} alt={c.name} />}
                      <AvatarFallback className="text-xs">{initialOf(c.name)}</AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate">{c.name}</span>
                    {isItemPending ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : isActive ? (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    ) : null}
                  </button>
                )
              })}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    close()
                    setShowCreateModal(true)
                  }}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] transition-colors hover:bg-accent active:bg-accent"
                >
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <span>{t('Add new company')}</span>
                </button>
              )}
              {phoneSlot(close)}
            </div>
          </BottomSheetContent>
        </Dialog>
        {isAdmin && <AdminCreateCompanyModal open={showCreateModal} onOpenChange={setShowCreateModal} />}
      </>
    )
  }

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ? (
          trigger
        ) : collapsed ? (
          <button
            type="button"
            aria-label="Switch company"
            className="hidden sm:flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring transition-colors"
          >
            <Avatar className="h-7 w-7 shrink-0">
              {active?.logo_url && (
                <AvatarImage src={active.logo_url} alt={active.name} />
              )}
              <AvatarFallback className="text-xs font-semibold">
                {active ? initialOf(active.name) : '?'}
              </AvatarFallback>
            </Avatar>
          </button>
        ) : (
          <button
            type="button"
            aria-label="Switch company"
            className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-sm font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring transition-colors"
          >
            <Avatar className="h-6 w-6 shrink-0">
              {active?.logo_url && (
                <AvatarImage src={active.logo_url} alt={active.name} />
              )}
              <AvatarFallback className="text-xs font-semibold">
                {active ? initialOf(active.name) : '?'}
              </AvatarFallback>
            </Avatar>
            <span className="max-w-[160px] truncate">
              {active?.name ?? 'Select company'}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={align}
        className="w-56 glass-strong border border-[var(--glass-border)] shadow-glass"
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Companies
        </DropdownMenuLabel>

        {companies.map((c) => {
          const isActive = c.id === activeCompanyId
          const isItemPending = c.id === pendingId
          return (
            <DropdownMenuItem
              key={c.id}
              className="flex items-center gap-2"
              disabled={isPending}
              onSelect={(event) => {
                // Prevent Radix from closing the menu before the transition
                // resolves; the layout refresh will tear it down on success.
                event.preventDefault()
                handleSwitch(c.id)
              }}
            >
              <Avatar className="h-5 w-5 shrink-0">
                {c.logo_url && (
                  <AvatarImage src={c.logo_url} alt={c.name} />
                )}
                <AvatarFallback className="text-xs">
                  {initialOf(c.name)}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1 truncate">{c.name}</span>
              {isItemPending ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : isActive ? (
                <Check className="h-4 w-4 shrink-0 text-primary" />
              ) : null}
            </DropdownMenuItem>
          )
        })}

        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="flex items-center gap-2 cursor-pointer"
              onSelect={(e) => {
                e.preventDefault()
                setShowCreateModal(true)
              }}
            >
              <Building2 className="h-4 w-4" />
              <span>Add new company</span>
            </DropdownMenuItem>
          </>
        )}

        {accountMenuSlot && (
          <>
            <DropdownMenuSeparator />
            {accountMenuSlot}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>

    {isAdmin && (
      <AdminCreateCompanyModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
      />
    )}
  </>
  )
}
