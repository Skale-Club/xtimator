'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { toast } from 'sonner'

import { linkProjectToClient } from '@/lib/actions/project'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useTranslation } from '@/lib/i18n/use-translation'

interface LinkClientButtonProps {
  projectId: string
}

interface ClientSearchItem {
  id: string
  name: string
  email: string | null
  phone: string | null
}

/**
 * R6 — pill-shaped Link Client trigger for the floating action bar.
 *
 * Same search + select behavior as LinkClientCard but rendered without the
 * card chrome so it fits inside the rounded-full cluster of estimate-floating
 * actions. The card variant stays in place for the no-estimate state on
 * Overview where the larger explanatory surface makes sense.
 */
export function LinkClientButton({ projectId }: LinkClientButtonProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  function handleLinkClient(clientId: string) {
    startTransition(async () => {
      const result = await linkProjectToClient(projectId, clientId)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(t('Client linked successfully'))
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
      <PopoverContent className="w-[320px] p-0" align="end" side="top">
        <Command>
          <CommandInput
            placeholder={t('Search clients...')}
            value={search}
            onValueChange={setSearch}
          />
          <ClientList
            search={search}
            onSelect={(id) => {
              handleLinkClient(id)
              setOpen(false)
            }}
          />
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
}) {
  const { t } = useTranslation()
  const [clients, setClients] = useState<ClientSearchItem[] | null>(null)
  const [loaded, setLoaded] = useState(false)

  if (!loaded && clients === null) {
    setLoaded(true)
    fetch('/api/clients')
      .then((r) => r.json())
      .then((data) => setClients(Array.isArray(data) ? data : []))
      .catch(() => setClients([]))
  }

  if (clients === null) {
    return <CommandEmpty>{t('Loading clients...')}</CommandEmpty>
  }

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  if (filtered.length === 0) {
    return <CommandEmpty>{t('No clients found.')}</CommandEmpty>
  }

  return (
    <CommandList>
      <CommandGroup>
        {filtered.map((client) => (
          <CommandItem
            key={client.id}
            value={client.id}
            onSelect={() => onSelect(client.id)}
          >
            <div className="flex flex-col">
              <span>{client.name}</span>
              {client.email && (
                <span className="text-xs text-muted-foreground">{client.email}</span>
              )}
            </div>
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandList>
  )
}
