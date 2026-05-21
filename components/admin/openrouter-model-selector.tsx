'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'
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
import { cn } from '@/lib/utils'

export type OpenRouterModel = {
  id: string
  name: string
  description?: string | null
  context_length?: number | null
}

type Props = {
  value: string | null
  onSelect: (modelId: string) => void
  placeholder?: string
  disabled?: boolean
  /** Width class for the trigger button; defaults to full width. */
  className?: string
  /** Allow selecting nothing (only useful for per-company override pages). */
  allowClear?: boolean
}

let cachedModels: OpenRouterModel[] | null = null
let inflight: Promise<OpenRouterModel[]> | null = null

async function fetchModels(): Promise<OpenRouterModel[]> {
  if (cachedModels) return cachedModels
  if (inflight) return inflight
  inflight = (async () => {
    const res = await fetch('/api/admin/openrouter-models')
    if (!res.ok) throw new Error(`Failed to load models (${res.status})`)
    const json = (await res.json()) as { models: OpenRouterModel[] }
    cachedModels = json.models
    return json.models
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

export function OpenRouterModelSelector({
  value,
  onSelect,
  placeholder = 'Select a model…',
  disabled,
  className,
  allowClear,
}: Props) {
  const [open, setOpen] = useState(false)
  const [models, setModels] = useState<OpenRouterModel[]>(cachedModels ?? [])
  const [loading, setLoading] = useState(!cachedModels)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cachedModels) return
    let cancelled = false
    fetchModels()
      .then((m) => {
        if (!cancelled) setModels(m)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load models')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selected = useMemo(
    () => models.find((m) => m.id === value) ?? null,
    [models, value]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className={selected || value ? 'truncate' : 'text-muted-foreground'}>
            {selected ? `${selected.name} (${selected.id})` : value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            // Default filter searches on the `value` we pass to CommandItem
            // (which is "<id> <name>"). Case-insensitive contains.
            return itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }}
        >
          <CommandInput placeholder="Search 300+ models…" />
          <CommandList className="max-h-[320px]">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading models…
              </div>
            )}
            {error && !loading && (
              <div className="p-4 text-sm text-destructive">{error}</div>
            )}
            {!loading && !error && (
              <>
                <CommandEmpty>No models match.</CommandEmpty>
                {allowClear && (
                  <CommandGroup>
                    <CommandItem
                      value="__clear__"
                      onSelect={() => {
                        onSelect('')
                        setOpen(false)
                      }}
                    >
                      <span className="text-muted-foreground">Use platform default</span>
                    </CommandItem>
                  </CommandGroup>
                )}
                <CommandGroup>
                  {models.map((m) => (
                    <CommandItem
                      key={m.id}
                      value={`${m.id} ${m.name}`}
                      onSelect={() => {
                        onSelect(m.id)
                        setOpen(false)
                      }}
                      className="flex items-start gap-2"
                    >
                      <Check
                        className={cn(
                          'mt-0.5 h-4 w-4 shrink-0',
                          value === m.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{m.name}</span>
                          {typeof m.context_length === 'number' && m.context_length > 0 && (
                            <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground shrink-0">
                              {Math.round(m.context_length / 1000)}k ctx
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{m.id}</div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
