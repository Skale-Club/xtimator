'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, X, Plus, SprayCan, Sofa, Droplets, Paintbrush, TreePine, Zap, Wrench, Hammer, Home, Fan, MoreHorizontal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { INDUSTRIES, isKnownIndustry, getIndustryLabel } from '@/lib/industries'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

const ICON_MAP: Record<string, LucideIcon> = {
  SprayCan,
  Sofa,
  Droplets,
  Paintbrush,
  TreePine,
  Zap,
  Wrench,
  Hammer,
  Home,
  Fan,
  MoreHorizontal,
}

interface IndustrySelectorProps {
  /** Selected predefined industry ids. */
  value: string[]
  /** Tenant-specific custom industry labels. */
  customValues: string[]
  onChange: (ids: string[]) => void
  onCustomChange: (customs: string[]) => void
  placeholder?: string
  disabled?: boolean
}

export function IndustrySelector({
  value,
  customValues,
  onChange,
  onCustomChange,
  placeholder = 'Select services...',
  disabled = false,
}: IndustrySelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const allValues = useMemo(() => [...value, ...customValues], [value, customValues])

  const searchLower = search.trim().toLowerCase()
  const searchLabel = search.trim()

  const predefinedOptions = useMemo(() => {
    return INDUSTRIES.filter((ind) =>
      searchLower ? ind.label.toLowerCase().includes(searchLower) : true
    )
  }, [searchLower])

  const customOptions = useMemo(() => {
    return customValues.filter((c) =>
      searchLower ? c.toLowerCase().includes(searchLower) : true
    )
  }, [customValues, searchLower])

  const canCreateCustom =
    searchLabel.length > 0 &&
    !value.some((id) => getIndustryLabel(id).toLowerCase() === searchLower) &&
    !customValues.some((c) => c.toLowerCase() === searchLower)

  function toggleKnown(id: string) {
    const next = value.includes(id) ? value.filter((v) => v !== id) : [...value, id]
    onChange(next)
  }

  function addCustom(label: string) {
    const trimmed = label.trim()
    if (!trimmed) return
    if (customValues.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return
    onCustomChange([...customValues, trimmed])
    setSearch('')
  }

  function removeCustom(label: string) {
    onCustomChange(customValues.filter((c) => c !== label))
  }

  function removeKnown(id: string) {
    onChange(value.filter((v) => v !== id))
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between min-h-[44px] h-auto py-2 px-3"
          >
            <span className={cn('truncate', allValues.length === 0 && 'text-muted-foreground')}>
              {allValues.length > 0
                ? `${allValues.length} service${allValues.length === 1 ? '' : 's'} selected`
                : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command
            filter={() => 1}
            className="border-0 shadow-none"
          >
            <CommandInput
              placeholder="Search or add a service..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList className="max-h-[320px]">
              <CommandEmpty className="py-0">
                {canCreateCustom ? (
                  <button
                    type="button"
                    onClick={() => {
                      addCustom(searchLabel)
                      setOpen(false)
                    }}
                    className="flex w-full items-center gap-2 px-2 py-3 text-sm text-left transition-colors hover:bg-accent"
                  >
                    <Plus className="h-4 w-4 text-primary" />
                    <span>
                      Create <span className="font-medium">"{searchLabel}"</span>
                    </span>
                  </button>
                ) : (
                  <span className="block py-6 text-center text-sm">No services found.</span>
                )}
              </CommandEmpty>

              {customOptions.length > 0 && (
                <CommandGroup heading="Your custom services">
                  {customOptions.map((custom) => {
                    const selected = customValues.includes(custom)
                    return (
                      <CommandItem
                        key={`custom-${custom}`}
                        value={`custom:${custom}`}
                        onSelect={() => {
                          if (selected) {
                            removeCustom(custom)
                          } else {
                            addCustom(custom)
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <MoreHorizontal className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1">{custom}</span>
                        <Check
                          className={cn(
                            'ml-auto h-4 w-4 shrink-0',
                            selected ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}

              {predefinedOptions.length > 0 && (
                <CommandGroup heading="Common services">
                  {predefinedOptions.map((industry) => {
                    const Icon = ICON_MAP[industry.icon]
                    const selected = value.includes(industry.id)
                    return (
                      <CommandItem
                        key={industry.id}
                        value={industry.id}
                        onSelect={() => toggleKnown(industry.id)}
                        className="cursor-pointer"
                      >
                        {Icon && <Icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />}
                        <span className="flex-1">{industry.label}</span>
                        <Check
                          className={cn(
                            'ml-auto h-4 w-4 shrink-0',
                            selected ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}

              {canCreateCustom && (predefinedOptions.length > 0 || customOptions.length > 0) && (
                <CommandGroup heading="Create new">
                  <CommandItem
                    value={`create:${searchLabel}`}
                    onSelect={() => {
                      addCustom(searchLabel)
                      setOpen(false)
                    }}
                    className="cursor-pointer"
                  >
                    <Plus className="mr-2 h-4 w-4 shrink-0 text-primary" />
                    <span>
                      Create <span className="font-medium">"{searchLabel}"</span>
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {allValues.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((id) => (
            <Badge
              key={id}
              variant="secondary"
              className="gap-1 pl-2 pr-1 py-1"
            >
              {getIndustryLabel(id)}
              <button
                type="button"
                onClick={() => removeKnown(id)}
                className="ml-1 rounded-full p-0.5 hover:bg-secondary-foreground/10"
                aria-label={`Remove ${getIndustryLabel(id)}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {customValues.map((custom) => (
            <Badge
              key={`custom-${custom}`}
              variant="outline"
              className="gap-1 pl-2 pr-1 py-1"
            >
              {custom}
              <button
                type="button"
                onClick={() => removeCustom(custom)}
                className="ml-1 rounded-full p-0.5 hover:bg-secondary-foreground/10"
                aria-label={`Remove ${custom}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
