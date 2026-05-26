'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
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
import { switchActiveCompany } from '@/lib/actions/active-company'

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
}

function initialOf(name: string): string {
  return name.charAt(0).toUpperCase()
}

export function CompanySelector({
  companies,
  activeCompanyId,
  collapsed = false,
}: CompanySelectorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const active =
    companies.find((c) => c.id === activeCompanyId) ?? companies[0] ?? null

  function handleSwitch(id: string) {
    if (id === activeCompanyId) return // SWITCH-09 no-op
    setPendingId(id)
    startTransition(async () => {
      const result = await switchActiveCompany(id)
      if ('error' in result) {
        // SWITCH-08: forbidden + unauthenticated branches both surface as a
        // generic access message and a layout refresh so stale data is purged.
        toast.error('You no longer have access to that company.')
        router.refresh()
      }
      setPendingId(null)
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {collapsed ? (
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
        align="start"
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

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link
            href="/onboarding?mode=add"
            prefetch
            className="flex items-center gap-2 text-muted-foreground"
          >
            <Building2 className="h-4 w-4" />
            <span>Add new company</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
