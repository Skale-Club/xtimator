'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { toast } from 'sonner'

import { linkProjectToClient } from '@/lib/actions/project'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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

interface LinkClientCardProps {
  projectId: string
}

interface ClientSearchItem {
  id: string
  name: string
  email: string | null
  phone: string | null
}

export function LinkClientCard({ projectId }: LinkClientCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  function handleLinkClient(clientId: string) {
    startTransition(async () => {
      const result = await linkProjectToClient(projectId, clientId)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Client linked successfully')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Card variant="glass">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Link a Client</CardTitle>
          <UserPlus className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This project is not linked to a client. Link a client to keep track of who&apos;s requesting the work.
        </p>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="w-full">
              <UserPlus className="mr-2 h-4 w-4" />
              Link Client
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[350px] p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search clients..."
                value={search}
                onValueChange={setSearch}
              />
              <ClientList search={search} onSelect={(id) => { handleLinkClient(id); setOpen(false) }} />
            </Command>
          </PopoverContent>
        </Popover>
      </CardContent>
    </Card>
  )
}

function ClientList({
  search,
  onSelect,
}: {
  search: string
  onSelect: (id: string) => void
}) {
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
    return <CommandEmpty>Loading clients...</CommandEmpty>
  }

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  if (filtered.length === 0) {
    return <CommandEmpty>No clients found.</CommandEmpty>
  }

  return (
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
  )
}