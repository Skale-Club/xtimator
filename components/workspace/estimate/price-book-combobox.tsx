'use client'

// Quick-260525-qbc: Inline combobox swap-in for the estimate row's bare description input.
// Strategy: visible <input> is the Popover anchor. A hidden CommandInput mirrors its value
// so cmdk's internal keyboard navigation (ArrowUp/Down/Enter) operates against the same
// query while the user keeps typing in the visible input.

import { forwardRef, useLayoutEffect, useState, useRef, useMemo } from 'react'
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
  disabled?: boolean
  'aria-label'?: string
  /** Render an auto-growing <textarea> that wraps like the text it edits
   *  (the paginated view's in-place line editor) instead of an <input>. */
  multiline?: boolean
}

type FieldProps = {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onFocus?: () => void
  onBlur?: () => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  'aria-label'?: string
}

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = '0px'
  el.style.height = `${el.scrollHeight}px`
}

/** <input>, or an auto-growing single-paragraph <textarea> when multiline. */
const Field = forwardRef<HTMLInputElement | HTMLTextAreaElement, FieldProps & { multiline?: boolean }>(
  function Field({ multiline, onChange, ...props }, ref) {
    const innerRef = useRef<HTMLTextAreaElement | null>(null)
    useLayoutEffect(() => {
      if (multiline) autoGrow(innerRef.current)
    }, [multiline, props.value])
    if (!multiline) {
      return <input ref={ref as React.Ref<HTMLInputElement>} onChange={onChange} {...props} />
    }
    return (
      <textarea
        ref={(el) => {
          innerRef.current = el
          if (typeof ref === 'function') ref(el)
          else if (ref) ref.current = el
        }}
        rows={1}
        style={{ resize: 'none', overflow: 'hidden', display: 'block' }}
        // A description is one paragraph: a pasted newline becomes a space.
        onChange={(e) => {
          if (e.target.value.includes('\n')) e.target.value = e.target.value.replace(/\n/g, ' ')
          onChange(e)
        }}
        {...props}
      />
    )
  }
)

export function PriceBookCombobox({
  value,
  onChange,
  onSelectPriceBookItem,
  items,
  currencyCode,
  placeholder,
  className,
  noMatchesLabel,
  disabled,
  'aria-label': ariaLabel,
  multiline,
}: PriceBookComboboxProps) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
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
      <Field
        multiline={multiline}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        aria-label={ariaLabel}
      />
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Field
          multiline={multiline}
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
          disabled={disabled}
          aria-label={ariaLabel}
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
