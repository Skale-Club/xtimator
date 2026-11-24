'use client'

/**
 * The one toolbar every list uses (DataTable composes these). Rules that keep
 * the screens consistent:
 *  - every control is 36px tall (h-9), rounded-lg, 14px text;
 *  - wide screens (lg, 1024px+; the sidebar takes 213px from 768px): one row — tabs and extra filters left, search and sort right;
 *  - phone and tablet: one row — full-width search plus a "Filters" button; tabs, extra
 *    filters and sort live in a bottom sheet, so the toolbar costs 36px;
 *  - an active filter is always visible (chips on the phone, a result count
 *    with "Clear filters" on both), so a narrowed list is never a mystery.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUpDown, Check, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BottomSheetCloseButton, BottomSheetContent } from '@/components/ui/bottom-sheet'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'

/**
 * The one surface for every bordered control in a toolbar (search, sort,
 * filters, outline actions). The stock outline Button paints bg-background,
 * which shows as a black box on a glass card next to a see-through search;
 * a faint foreground tint reads the same on any surface, in both themes.
 * (Not `dark:` — Tailwind's dark variant here follows the OS, not the app theme.)
 */
export const TOOLBAR_CONTROL =
  'h-9 rounded-lg border border-field-border bg-field shadow-none hover:border-field-border-hover hover:bg-field hover:text-foreground'

export interface ListOption {
  value: string
  label: string
}

export interface ActiveFilter {
  key: string
  label: string
  onRemove: () => void
}

/** Segmented filters update the same results list and support arrow-key navigation. */
export function ListTabs({ options, value, onChange, label, className }: {
  options: readonly ListOption[]
  value: string
  onChange: (value: string) => void
  label: string
  className?: string
}) {
  return (
    <RadioGroup.Root
      orientation="horizontal"
      aria-label={label}
      value={value}
      onValueChange={onChange}
      className={cn('inline-flex h-9 items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5', className)}
    >
      {options.map((option) => (
        <RadioGroup.Item
          key={option.value}
          value={option.value}
          className="h-7 whitespace-nowrap rounded-md px-3 text-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring data-[state=checked]:bg-background data-[state=checked]:font-medium data-[state=checked]:text-foreground data-[state=checked]:shadow-sm"
        >
          {option.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}

/** Search box: trims nothing itself (the list trims), Esc clears, "/" focuses. */
export function ListSearch({ value, onChange, placeholder, className }: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== '/' || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      const input = inputRef.current
      // Skip a box that is hidden (display:none parent) or inside a closed panel.
      if (!input || input.offsetParent === null) return
      event.preventDefault()
      input.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder.replace(/\.+$/, '')}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault()
            event.stopPropagation()
            onChange('')
          }
        }}
        className="h-9 w-full min-w-0 rounded-lg border border-field-border bg-field pl-9 pr-9 text-base text-foreground outline-none transition-[border-color,box-shadow] hover:border-field-border-hover placeholder:text-field-placeholder focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => { onChange(''); inputRef.current?.focus() }}
          aria-label={t('Clear search')}
          className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}

/** "Newest ▾" sort button; the same value the column headers set on desktop. */
export function ListSortMenu({ options, value, onChange, className }: {
  options: readonly ListOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const { t } = useTranslation()
  const current = options.find((o) => o.value === value) ?? options[0]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn(TOOLBAR_CONTROL, 'font-normal', className)} aria-label={`${t('Sort')}: ${current?.label ?? ''}`}>
          <ArrowUpDown className="size-4 text-muted-foreground" aria-hidden />
          <span>{current?.label}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t('Sort by')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={current?.value} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Phone only: the "Filters" button and the bottom sheet it opens. */
export function ListFiltersSheet({
  tabs, tabValue, onTabChange, tabsLabel,
  sortOptions, sortValue, onSortChange,
  extraFilters, activeCount, resultCount, onClear, className,
}: {
  tabs?: readonly ListOption[]
  tabValue?: string
  onTabChange?: (value: string) => void
  tabsLabel?: string
  sortOptions?: readonly ListOption[]
  sortValue?: string
  onSortChange?: (value: string) => void
  extraFilters?: ReactNode
  activeCount: number
  resultCount: number
  onClear?: () => void
  className?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const choice = (selected: boolean) => cn(
    'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors',
    selected ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border text-foreground hover:bg-accent',
  )

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={cn(TOOLBAR_CONTROL, 'relative px-3 font-normal', className)}
        aria-label={activeCount ? `${t('Filters')} (${activeCount})` : t('Filters')}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        <span>{t('Filters')}</span>
        {activeCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
            {activeCount}
          </span>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* The app's bottom sheet on phones (handle, drag to resize or close, X);
            a centred 448px card from sm up, so it never stretches across a tablet. */}
        <BottomSheetContent desktopClassName="sm:max-w-md">
          <DialogHeader
            data-sheet-drag=""
            className="flex shrink-0 touch-none flex-row items-center justify-between gap-3 pl-5 pr-3 pt-1 pb-1 text-left sm:pt-4"
          >
            <DialogTitle className="text-[19px] leading-tight font-semibold tracking-tight">{t('Filters')}</DialogTitle>
            <BottomSheetCloseButton label={t('Close')} />
            <DialogDescription className="sr-only">{t('Filter and sort this list')}</DialogDescription>
          </DialogHeader>
          <div data-sheet-body="" className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pt-2 pb-4">
            {tabs && tabs.length > 0 && onTabChange && (
              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tabsLabel ?? t('Status')}</h3>
                <div className="flex flex-wrap gap-2">
                  {tabs.map((tab) => (
                    <button key={tab.value} type="button" aria-pressed={tab.value === tabValue} onClick={() => onTabChange(tab.value)} className={choice(tab.value === tabValue)}>
                      {tab.value === tabValue && <Check className="size-3.5" aria-hidden />}
                      {tab.label}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {extraFilters && <section className="space-y-2">{extraFilters}</section>}
            {sortOptions && sortOptions.length > 0 && onSortChange && (
              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('Sort by')}</h3>
                <div className="flex flex-wrap gap-2">
                  {sortOptions.map((o) => (
                    <button key={o.value} type="button" aria-pressed={o.value === sortValue} onClick={() => onSortChange(o.value)} className={choice(o.value === sortValue)}>
                      {o.value === sortValue && <Check className="size-3.5" aria-hidden />}
                      {o.label}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
          <div className="flex shrink-0 flex-row gap-2 border-t border-border px-5 pt-3 pb-4">
            {onClear && activeCount > 0 && (
              <Button type="button" variant="ghost" className="h-11 flex-1 rounded-lg" onClick={onClear}>
                {t('Clear filters')}
              </Button>
            )}
            <Button type="button" className="h-11 flex-1 rounded-lg" onClick={() => setOpen(false)}>
              {resultCount === 1 ? t('Show 1 result') : t('Show {n} results').replace('{n}', String(resultCount))}
            </Button>
          </div>
        </BottomSheetContent>
      </Dialog>
    </>
  )
}

/**
 * The slim line under the toolbar, shown only while something narrows the
 * list: removable chips (phone; desktop already shows the tabs and filter
 * buttons themselves), "3 of 12" and "Clear filters".
 */
export function ListFilterSummary({ chips, shown, total, onClear }: {
  chips: readonly ActiveFilter[]
  shown: number
  total: number
  onClear: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-7 flex-wrap items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          aria-label={`${t('Remove filter')}: ${chip.label}`}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/30 bg-primary/10 pl-2 pr-1.5 font-medium text-primary lg:hidden"
        >
          {chip.label}
          <X className="size-3" aria-hidden />
        </button>
      ))}
      <span className="tabular-nums">{t('{shown} of {total}').replace('{shown}', String(shown)).replace('{total}', String(total))}</span>
      <span aria-hidden>·</span>
      <button type="button" onClick={onClear} className="font-medium text-foreground underline-offset-4 hover:underline">
        {t('Clear filters')}
      </button>
    </div>
  )
}
