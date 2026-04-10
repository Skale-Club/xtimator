'use client'

import { useState, useTransition } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { Check, ChevronsUpDown, Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import type { ProjectFormValues } from '@/lib/schemas/project'
import type { ClientWithCount } from '@/lib/queries/clients'
import { createClientAction } from '@/lib/actions/client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

interface StepClientSelectProps {
  form: UseFormReturn<ProjectFormValues>
  clients: ClientWithCount[]
}

export function StepClientSelect({ form, clients: initialClients }: StepClientSelectProps) {
  const [open, setOpen] = useState(false)
  const [clients, setClients] = useState(initialClients)
  const [showInlineCreate, setShowInlineCreate] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Inline creation form state
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')

  const selectedClientId = form.watch('clientId')
  const selectedClient = clients.find((c) => c.id === selectedClientId)

  function handleSelectClient(client: ClientWithCount) {
    form.setValue('clientId', client.id, { shouldValidate: true })
    form.setValue('clientName', client.name)
    setOpen(false)
  }

  function handleCreateClient() {
    if (!newName.trim()) {
      toast.error('Client name is required')
      return
    }

    startTransition(async () => {
      const result = await createClientAction({
        name: newName.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim(),
        address: '',
        city: '',
        state: '',
        zip: '',
        notes: '',
      })

      if ('error' in result) {
        toast.error(result.error)
        return
      }

      const newClient: ClientWithCount = {
        id: result.data.id,
        name: result.data.name,
        email: result.data.email,
        phone: result.data.phone,
        logo_url: result.data.logo_url,
        created_at: result.data.created_at,
        project_count: 0,
      }

      setClients((prev) => [...prev, newClient].sort((a, b) => a.name.localeCompare(b.name)))
      form.setValue('clientId', newClient.id, { shouldValidate: true })
      form.setValue('clientName', newClient.name)
      setShowInlineCreate(false)
      setNewName('')
      setNewEmail('')
      setNewPhone('')
      toast.success('Client created')
    })
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Select a Client</h2>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="min-h-[44px] w-full justify-between"
          >
            {selectedClient ? selectedClient.name : 'Search clients...'}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search clients..." />
            <CommandList>
              <CommandEmpty>No clients found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setShowInlineCreate(true)
                    setOpen(false)
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add new client
                </CommandItem>
                {clients.map((client) => (
                  <CommandItem
                    key={client.id}
                    value={client.name}
                    onSelect={() => handleSelectClient(client)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selectedClientId === client.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
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
          </Command>
        </PopoverContent>
      </Popover>

      {/* Validation error */}
      {form.formState.errors.clientId?.message && (
        <p className="text-sm text-destructive">
          {form.formState.errors.clientId.message}
        </p>
      )}

      {/* Inline client creation form */}
      {showInlineCreate && (
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-medium">New Client</h3>

          <div className="space-y-2">
            <Label htmlFor="new-client-name">Name *</Label>
            <Input
              id="new-client-name"
              placeholder="Client name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-client-email">Email</Label>
            <Input
              id="new-client-email"
              type="email"
              placeholder="client@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-client-phone">Phone</Label>
            <Input
              id="new-client-phone"
              placeholder="(555) 123-4567"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="min-h-[44px]"
              onClick={handleCreateClient}
              disabled={isPending}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Client
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-[44px]"
              onClick={() => setShowInlineCreate(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
