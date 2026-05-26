'use client'

// Quick-260525-qbc: Inline combobox swap-in for the estimate row's bare description input.
// Strategy: visible <input> is the Popover anchor. A hidden CommandInput mirrors its value
// so cmdk's internal keyboard navigation (ArrowUp/Down/Enter) operates against the same
// query while the user keeps typing in the visible input.

import { useState, useRef, useMemo } from 'react'
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { formatMoney } from '@/lib/money/currency'
import type { PriceBookItem } from '@/lib/queries/price-book'

interface PriceBookComboboxProps {
  value: string
  onChange: (next: string) => void
  onSelectPriceBookItem: (item: PriceBookItem) => void
  items: PriceBookItem[]
  currencyCode: string
  placeholder?: string
  className?: string
  noMatchesLabel?: string
}

export function PriceBookCombobox({
  value,
  onChange,
  onSelectPriceBookItem,
  items,
  currencyCode,
  placeholder,
  className,
  noMatchesLabel,
}: PriceBookComboboxProps) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasItems = items.length > 0

  const normalizedQuery = value.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!hasItems) return []
    if (!normalizedQuery) return items.slice(0, 50)
    return items
      .filter((it) => {
        const name = it.name.toLowerCase()
        const folder = (it.folder_name ?? '').toLowerCase()
        return name.includes(normalizedQuery) || folder.includes(normalizedQuery)
      })
      .slice(0, 50)
  }, [items, hasItems, normalizedQuery])

  // Empty price book → render plain input, no dropdown.
  if (!hasItems) {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
      />
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so a click on the dropdown can fire before close.
            setTimeout(() => setOpen(false), 120)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setOpen(false)
            }
          }}
          placeholder={placeholder}
          className={className}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={2}
        className="p-0 w-[--radix-popover-trigger-width] min-w-[280px]"
        onOpenAutoFocus={(e) => {
          // Keep focus on the visible input.
          e.preventDefault()
        }}
      >
        <Command shouldFilter={false}>
          <CommandList>
            <CommandEmpty>{noMatchesLabel ?? 'No matches'}</CommandEmpty>
            <CommandGroup>
              {filtered.map((it) => (
                <CommandItem
                  key={it.id}
                  value={it.id}
                  onSelect={() => {
                    onSelectPriceBookItem(it)
                    setOpen(false)
                    inputRef.current?.blur()
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{it.name}</span>
                      {it.folder_name && (
                        <span className="truncate text-xs text-muted-foreground">
                          {it.folder_name}
                        </span>
                      )}
                    </div>
                    <span className="tabular-nums text-xs text-muted-foreground shrink-0">
                      {formatMoney(it.unit_price, currencyCode)}
                      {it.unit ? ` / ${it.unit}` : ''}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
