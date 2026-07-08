'use client'

import * as React from 'react'
import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'

import { linkProjectToClient, unlinkProjectFromClient } from '@/lib/actions/project'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandInput,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandEmpty,
} from '@/components/ui/command'
import { useTranslation } from '@/lib/i18n/use-translation'

// ---------------------------------------------------------------------------
// Phase 162-02 (DOCUX-02, DOCUX-03) — the ONE consolidated ClientPicker.
// Replaces LinkClientInline (was inline in estimate-document.tsx),
// LinkClientButton (was components/workspace/link-client-button.tsx), and
// LinkClientCard (was components/workspace/link-client-card.tsx). Adds a
// NEW `billTo` variant for the Bill To pencil affordance that 162-03 wires
// into estimate-document.tsx, and a first-class Unlink footer action that
// only renders when currentClientId !== null (the three legacy pickers
// couldn't unlink at all).
//
// Locked API — no escape-hatch render props (PITFALLS.md #4). New variants
// or capabilities must land as first-class props with their own tests.
// ---------------------------------------------------------------------------

export type ClientPickerVariant = 'card' | 'button' | 'inline' | 'billTo'

export interface ClientPickerProps {
  projectId: string
  currentClientId: string | null
  variant: ClientPickerVariant
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  onLinked?: (clientId: string) => void
  onUnlinked?: () => void
  className?: string
}

interface ClientSearchItem {
  id: string
  name: string
  email: string | null
  phone: string | null
}

export function ClientPicker(props: ClientPickerProps): React.JSX.Element {
  const { t } = useTranslation()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  function handleLink(clientId: string): void {
    startTransition(async () => {
      const result = await linkProjectToClient(props.projectId, clientId)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success(t('Client linked'))
      setOpen(false)
      props.onLinked?.(clientId)
      router.refresh()
    })
  }

  function handleUnlink(): void {
    startTransition(async () => {
      const result = await unlinkProjectFromClient(props.projectId)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success(t('Client unlinked'))
      setOpen(false)
      props.onUnlinked?.()
      router.refresh()
    })
  }

  // -------------------------------------------------------------------------
  // Variant-specific trigger. Locked API: no arbitrary render-prop escape
  // hatches (see PITFALLS.md #4). New variants must be enumerated here.
  // -------------------------------------------------------------------------
  let trigger: React.JSX.Element
  switch (props.variant) {
    case 'card':
      trigger = (
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t('Link a Client')}</CardTitle>
              <UserPlus className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t(
                'This project is not linked to a client. Link a client to keep track of who’s requesting the work.'
              )}
            </p>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full">
                <UserPlus className="mr-2 h-4 w-4" />
                {t('Link Client')}
              </Button>
            </PopoverTrigger>
          </CardContent>
        </Card>
      )
      break
    case 'button':
      trigger = (
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full gap-1.5 text-foreground"
            aria-label={t('Link Client')}
          >
            <UserPlus className="h-3.5 w-3.5" />
            {t('Link Client')}
          </Button>
        </PopoverTrigger>
      )
      break
    case 'inline':
      trigger = (
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 text-lg text-muted-foreground italic hover:text-foreground transition-colors group"
          >
            <UserPlus className="h-4 w-4 flex-shrink-0" />
            <span>{t('No client linked')}</span>
          </button>
        </PopoverTrigger>
      )
      break
    case 'billTo':
      trigger = (
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t('Change client')}
            className={
              'inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground/40 ' +
              'hover:text-foreground hover:bg-muted transition-colors ' +
              'opacity-0 group-hover:opacity-100 focus:opacity-100'
            }
          >
            <Pencil className="h-4 w-4" />
          </button>
        </PopoverTrigger>
      )
      break
  }

  const popoverWidth = props.variant === 'card' ? 'w-[350px]' : 'w-[320px]'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {trigger}
      <PopoverContent
        align={props.align ?? (props.variant === 'button' ? 'end' : 'start')}
        side={props.side ?? (props.variant === 'button' ? 'top' : 'bottom')}
        className={`${popoverWidth} p-0`}
      >
        {/*
          shouldFilter={false} — we do our own case-insensitive substring match
          on name+email inside ClientList. cmdk's built-in filter would otherwise
          run over `value={c.id}` (a UUID) and clobber the visible list; the
          three legacy pickers had this same latent bug, unnoticed because their
          test coverage never exercised typed search.
        */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('Search clients...')}
            value={search}
            onValueChange={setSearch}
          />
          <ClientList search={search} onSelect={handleLink} />
          {props.currentClientId != null && (
            <div className="border-t border-border px-2 py-1">
              <button
                type="button"
                onClick={handleUnlink}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                {t('Unlink client')}
              </button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function ClientList({
  search,
  onSelect,
}: {
  search: string
  onSelect: (id: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [clients, setClients] = useState<ClientSearchItem[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/clients')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        setClients(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!cancelled) setClients([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (clients === null) return <CommandEmpty>{t('Loading clients...')}</CommandEmpty>

  const q = search.toLowerCase()
  const filtered = clients.filter(
    (c) => c.name.toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q)
  )

  if (filtered.length === 0) return <CommandEmpty>{t('No clients found.')}</CommandEmpty>

  return (
    <CommandList>
      <CommandGroup>
        {filtered.map((c) => (
          <CommandItem key={c.id} value={c.id} onSelect={() => onSelect(c.id)}>
            <div className="flex flex-col">
              <span>{c.name}</span>
              {c.email && (
                <span className="text-xs text-muted-foreground">{c.email}</span>
              )}
            </div>
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandList>
  )
}
