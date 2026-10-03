// components/workspace/estimate/preview-template/editable.tsx
//
// In-place editing for PaginatedPreview's page sheets. Every primitive here
// takes the RenderCtx and renders EXACTLY the plain value when `ctx.edit` is
// absent (read-only estimate, tests, any non-editor caller), so a template that
// swaps `{item.description}` for `<EditableText …/>` draws the same DOM text as
// before in read-only mode.
//
// When editable, a value shows as itself (same font, same box — only a hover
// outline, which never takes layout space) and turns into a field on click or
// keyboard focus. The field keeps a local DRAFT and dispatches once, on commit
// (blur / Enter), never per keystroke: every dispatch can re-paginate, and a
// block that moves to another sheet remounts — a per-keystroke dispatch would
// yank the caret out of the field mid-word. Escape discards the draft.
//
// Row / section affordances are absolutely positioned into the sheet's page
// margin, so they never change a block's measured height either.
'use client'

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { MoreVertical, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PriceBookCombobox } from '../price-book-combobox'
import type { DocumentItem } from '@/lib/estimate/document/model'
import { getCurrencySymbol } from '@/lib/money/currency'
import type { PriceBookItem } from '@/lib/queries/price-book'
import type { RenderCtx, ResolvedTermsCard } from './types'

// Hover/focus affordance for a value that can be clicked into. `outline` (not
// border/padding) so the hint occupies no layout space; dashed currentColor
// reads on white sheets and on brand-filled bands alike.
// Width/style live ONLY under the variants: in Tailwind v4 a bare `outline-1`
// already draws a solid outline.
const OUTLINE_HINT =
  'rounded-[2px] outline-offset-2 hover:outline-dashed hover:outline-1 focus-visible:outline-dashed focus-visible:outline-2'
const HINT = `${OUTLINE_HINT} cursor-text`

// Table-cell values (description, qty, unit, price) fill their cell, so a click
// anywhere on the cell's line box edits it — not just on the glyphs.
const CELL_TARGET = 'block w-full'

// The field itself inherits the surrounding type so the text does not jump
// when a value turns into an input.
const FIELD_STYLE: CSSProperties = {
  font: 'inherit',
  color: 'inherit',
  letterSpacing: 'inherit',
  textAlign: 'inherit',
  textTransform: 'inherit',
  background: 'transparent',
  border: 0,
  padding: 0,
  margin: 0,
  width: '100%',
  resize: 'none',
  display: 'block',
  outline: '2px solid hsl(var(--primary))',
  outlineOffset: 2,
  borderRadius: 2,
}

/** Parses "1,234.56", "1.234,56", "$ 99" … into a number (NaN if nothing numeric). */
export function parseLooseNumber(raw: string): number {
  let s = raw.replace(/[^\d.,-]/g, '')
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  if (lastDot !== -1 && lastComma !== -1) {
    // Both present: the LAST one is the decimal separator.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma !== -1) {
    // Only commas: a single comma followed by 1-2 digits is a decimal comma.
    const decimals = s.length - lastComma - 1
    s = (s.match(/,/g)?.length === 1 && decimals > 0 && decimals <= 2) ? s.replace(',', '.') : s.replace(/,/g, '')
  }
  return parseFloat(s)
}

function autoSize(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = '0px'
  el.style.height = `${el.scrollHeight}px`
}

// ---------------------------------------------------------------------------
// EditableText — single- or multi-line text
// ---------------------------------------------------------------------------

export function EditableText({
  ctx,
  value,
  onCommit,
  multiline = false,
  placeholder,
  ariaLabel,
  className,
}: {
  ctx: RenderCtx
  value: string
  onCommit: (next: string) => void
  /** Enter inserts a newline and Ctrl/Cmd+Enter commits (terms, summary);
   *  otherwise Enter commits and the text still wraps. */
  multiline?: boolean
  placeholder?: string
  ariaLabel?: string
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useLayoutEffect(() => {
    if (!editing) return
    autoSize(ref.current)
    ref.current?.focus()
    ref.current?.select()
  }, [editing])

  if (!ctx.edit) return <>{value}</>

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        className={`${HINT} ${className ?? ''}`}
        onFocus={() => {
          setDraft(value)
          setEditing(true)
        }}
      >
        {value || <span className="italic opacity-50">{placeholder}</span>}
      </span>
    )
  }

  const commit = () => {
    setEditing(false)
    if (draft !== value) onCommit(draft)
  }

  return (
    <textarea
      ref={ref}
      aria-label={ariaLabel}
      value={draft}
      rows={1}
      placeholder={placeholder}
      style={FIELD_STYLE}
      onChange={(e) => {
        setDraft(multiline ? e.target.value : e.target.value.replace(/\n/g, ' '))
        autoSize(e.target)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          setDraft(value)
          setEditing(false)
        } else if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// EditableNumber — quantity / unit price. `format` draws the resting value.
// ---------------------------------------------------------------------------

export function EditableNumber({
  ctx,
  value,
  onCommit,
  format = String,
  ariaLabel,
}: {
  ctx: RenderCtx
  value: number
  onCommit: (next: number) => void
  format?: (v: number) => string
  ariaLabel?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const ref = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editing) ref.current?.select()
  }, [editing])

  if (!ctx.edit) return <>{format(value)}</>

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        className={`${HINT} ${CELL_TARGET}`}
        onFocus={() => {
          setDraft(String(value))
          setEditing(true)
        }}
      >
        {format(value)}
      </span>
    )
  }

  const commit = () => {
    setEditing(false)
    const parsed = parseLooseNumber(draft)
    const next = Number.isFinite(parsed) ? Math.max(0, parsed) : value
    if (next !== value) onCommit(next)
  }

  return (
    <input
      ref={ref}
      autoFocus
      inputMode="decimal"
      aria-label={ariaLabel}
      value={draft}
      style={FIELD_STYLE}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          setEditing(false)
        } else if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// EditableDescription — item description with the price-book suggestions.
// ---------------------------------------------------------------------------

/** The description input + price-book suggestions, shared by an existing line
 *  and the new-line field. Commits once: Enter / blur commit the typed text, a
 *  price-book pick commits the pick instead (the combobox blurs the input right
 *  after a pick, so that blur must NOT also commit the stale typed text). */
function DescriptionField({
  ctx,
  initial,
  placeholder,
  className,
  onCommit,
  onPick,
  onCancel,
  multiline = false,
}: {
  ctx: RenderCtx
  initial: string
  placeholder: string
  className: string
  onCommit: (text: string) => void
  onPick: (pb: PriceBookItem) => void
  onCancel: () => void
  /** Wrap like the line's own text (an existing line) instead of one input row. */
  multiline?: boolean
}) {
  const [draft, setDraft] = useState(initial)
  const doneRef = useRef(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const field = wrapRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
    field?.focus()
    field?.select()
  }, [])

  const finish = (fn: () => void) => {
    if (doneRef.current) return
    doneRef.current = true
    fn()
  }

  return (
    <div
      ref={wrapRef}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) finish(() => onCommit(draft))
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          finish(() => onCommit(draft))
        } else if (e.key === 'Escape') {
          finish(onCancel)
        }
      }}
    >
      <PriceBookCombobox
        value={draft}
        onChange={setDraft}
        onSelectPriceBookItem={(pb) => finish(() => onPick(pb))}
        items={ctx.edit?.priceBookItems ?? []}
        currencyCode={ctx.data.currency_code}
        placeholder={placeholder}
        noMatchesLabel={ctx.L.noMatches}
        aria-label={placeholder}
        className={className}
        multiline={multiline}
      />
    </div>
  )
}

const INHERIT_INPUT =
  'block w-full bg-transparent p-0 rounded-[2px] outline outline-2 outline-offset-2 outline-primary [font:inherit] [color:inherit]'

export function EditableDescription({
  ctx,
  sectionId,
  item,
}: {
  ctx: RenderCtx
  sectionId: string
  item: DocumentItem
}) {
  const edit = ctx.edit
  const [editing, setEditing] = useState(false)

  if (!edit) return <>{item.description}</>

  if (!editing) {
    return (
      <span role="button" tabIndex={0} aria-label={ctx.L.description} className={`${HINT} ${CELL_TARGET}`} onFocus={() => setEditing(true)}>
        {item.description}
      </span>
    )
  }

  return (
    <DescriptionField
      ctx={ctx}
      initial={item.description}
      placeholder={ctx.L.description}
      className={INHERIT_INPUT}
      multiline
      onCommit={(text) => {
        setEditing(false)
        // An emptied description would HIDE the line (empty lines are not
        // drawn, here or in the PDF) — deleting is "Delete line"'s job.
        if (text.trim() && text !== item.description) {
          edit.dispatch({ type: 'UPDATE_ITEM', sectionId, itemId: item.id, field: 'description', value: text })
        }
      }}
      onPick={(pb) => {
        setEditing(false)
        edit.dispatch({
          type: 'APPLY_PRICE_BOOK_ITEM',
          sectionId,
          itemId: item.id,
          item: { name: pb.name, unit: pb.unit, unit_price: pb.unit_price },
        })
      }}
      onCancel={() => setEditing(false)}
    />
  )
}

// ---------------------------------------------------------------------------
// EditableUnit — unit picker (the same option list the full-width editor uses)
// ---------------------------------------------------------------------------

export function EditableUnit({ ctx, sectionId, item }: { ctx: RenderCtx; sectionId: string; item: DocumentItem }) {
  const edit = ctx.edit
  if (!edit) return <>{item.unit ?? ''}</>
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <span role="button" tabIndex={0} aria-label={ctx.L.unit} className={`${OUTLINE_HINT} ${CELL_TARGET} cursor-pointer`}>
          {item.unit || <span className="opacity-40">—</span>}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="max-h-72 overflow-y-auto">
        {edit.unitOptions(item.unit).map((u) => (
          <DropdownMenuCheckboxItem
            key={u}
            checked={u === item.unit}
            onSelect={() => edit.dispatch({ type: 'UPDATE_ITEM', sectionId, itemId: item.id, field: 'unit', value: u })}
          >
            {u}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// EditableDate — the info grid's estimate date
// ---------------------------------------------------------------------------

export function EditableDate({
  ctx,
  value,
  display,
}: {
  ctx: RenderCtx
  /** 'YYYY-MM-DD' or null (falls back to the creation date in `display`). */
  value: string | null
  display: string
}) {
  const [open, setOpen] = useState(false)
  const edit = ctx.edit
  if (!edit) return <>{display}</>
  const parsed = value ? new Date(`${value}T00:00:00`) : undefined
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span role="button" tabIndex={0} aria-label={ctx.L.date} className={`${OUTLINE_HINT} cursor-pointer`}>
          {display}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0 rounded-xl border shadow-xl">
        <Calendar
          mode="single"
          selected={parsed}
          defaultMonth={parsed}
          captionLayout="dropdown"
          onSelect={(d) => {
            const iso = d
              ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
              : null
            edit.dispatch({ type: 'UPDATE_FIELD', field: 'estimate_date', value: iso })
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Edit chrome labels — the UI around the document (menus, popovers) speaks the
// APP language, not the estimate's: the editor passes these through its t().
// English defaults for any caller that does not.
// ---------------------------------------------------------------------------

export const DEFAULT_EDIT_LABELS = {
  addItem: 'Add item',
  addSection: 'Add section',
  sectionTitle: 'Section title',
  firstLine: 'First line description',
  lineActions: 'Line actions',
  sectionActions: 'Section actions',
  deleteLine: 'Delete line',
  deleteSection: 'Delete section',
  moveUp: 'Move up',
  moveDown: 'Move down',
  taxable: 'Taxable',
  lineDiscount: 'Line discount',
  addLineDiscount: 'Add line discount',
  removeLineDiscount: 'Remove line discount',
  editTotals: 'Edit discount, tax and deposit',
  discount: 'Discount',
  tax: 'Tax',
  deposit: 'Deposit',
  none: 'None',
  percent: '%',
  amount: 'Amount',
  resetToDefault: 'Reset to default',
  removePhoto: 'Remove photo',
  linkClient: 'Link client',
  editClient: 'Change client',
}
export type EditLabels = typeof DEFAULT_EDIT_LABELS

// ---------------------------------------------------------------------------
// DraftNumberField — a number input that commits once (blur / Enter), like
// every other field here. `suffix` is drawn inside the right edge.
// ---------------------------------------------------------------------------

function DraftNumberField({
  value,
  onCommit,
  suffix,
  ariaLabel,
  autoFocus,
}: {
  value: number
  onCommit: (next: number) => void
  suffix?: string
  ariaLabel: string
  autoFocus?: boolean
}) {
  const [draft, setDraft] = useState(String(value))
  // Re-seed when the committed value changes underneath (another control) —
  // adjusted during render, React's pattern for state derived from a prop.
  const [seenValue, setSeenValue] = useState(value)
  if (seenValue !== value) {
    setSeenValue(value)
    setDraft(String(value))
  }
  const commit = () => {
    const parsed = parseLooseNumber(draft)
    const next = Number.isFinite(parsed) ? Math.max(0, parsed) : value
    if (next !== value) onCommit(next)
    else setDraft(String(value))
  }
  return (
    <div className="relative">
      <Input
        autoFocus={autoFocus}
        inputMode="decimal"
        aria-label={ariaLabel}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
        }}
        className="h-8 w-28 pr-7 text-right tabular-nums"
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  )
}

/** None / % / amount picker — a segmented control, so a type change is one click. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
  ariaLabel: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => value !== o.value && onChange(o.value)}
          className={`rounded px-2 py-0.5 text-xs transition-colors ${
            value === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Margin affordances
// ---------------------------------------------------------------------------

const MARGIN_BTN =
  'flex h-6 w-6 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 shadow-sm hover:text-zinc-900 hover:border-zinc-300'

/** Line kebab, parked in the sheet's LEFT page margin beside the row. The
 *  host <tr> must carry `group`; the host cell must be `relative`. */
export function ItemRowActions({ ctx, sectionId, item }: { ctx: RenderCtx; sectionId: string; item: DocumentItem }) {
  const edit = ctx.edit
  const [discountOpen, setDiscountOpen] = useState(false)
  if (!edit) return null
  const t = edit.labels
  const visible = ctx.itemsBySection.get(sectionId) ?? []
  const index = visible.findIndex((i) => i.id === item.id)
  const discount = item.discount ?? 0
  const setDiscount = (value: number) =>
    edit.dispatch({ type: 'UPDATE_ITEM', sectionId, itemId: item.id, field: 'discount', value })

  return (
    <span
      className={`absolute right-full top-1/2 mr-3 -translate-y-1/2 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100 ${
        discountOpen ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <Popover open={discountOpen} onOpenChange={setDiscountOpen}>
        <DropdownMenu>
          <PopoverAnchor asChild>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={t.lineActions} className={MARGIN_BTN}>
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
          </PopoverAnchor>
          <DropdownMenuContent
            align="start"
            side="left"
            // Opening the discount popover from the menu: don't hand focus back
            // to the kebab, or the popover's input loses it.
            onCloseAutoFocus={(e) => discountOpen && e.preventDefault()}
          >
            <DropdownMenuItem onSelect={() => edit.startNewItem(sectionId)}>{t.addItem}</DropdownMenuItem>
            <DropdownMenuItem disabled={index <= 0} onSelect={() => edit.moveItem(sectionId, item.id, -1)}>
              {t.moveUp}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={index === -1 || index >= visible.length - 1}
              onSelect={() => edit.moveItem(sectionId, item.id, 1)}
            >
              {t.moveDown}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setDiscountOpen(true)}>
              {discount > 0 ? `${t.lineDiscount}: -${ctx.fmt(discount)}` : t.addLineDiscount}
            </DropdownMenuItem>
            {discount > 0 && (
              <DropdownMenuItem onSelect={() => setDiscount(0)}>{t.removeLineDiscount}</DropdownMenuItem>
            )}
            <DropdownMenuCheckboxItem
              checked={item.taxable ?? true}
              onSelect={(e) => {
                e.preventDefault()
                edit.dispatch({
                  type: 'UPDATE_ITEM',
                  sectionId,
                  itemId: item.id,
                  field: 'taxable',
                  value: !(item.taxable ?? true),
                })
              }}
            >
              {t.taxable}
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => edit.dispatch({ type: 'REMOVE_ITEM', sectionId, itemId: item.id })}
            >
              {t.deleteLine}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <PopoverContent side="left" align="start" className="w-auto p-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{t.lineDiscount}</span>
            <DraftNumberField
              autoFocus
              value={discount}
              ariaLabel={t.lineDiscount}
              suffix={getCurrencySymbol(ctx.data.currency_code)}
              onCommit={(v) => {
                setDiscount(v)
                setDiscountOpen(false)
              }}
            />
          </div>
        </PopoverContent>
      </Popover>
    </span>
  )
}

/** Section kebab, parked in the sheet's RIGHT page margin beside the section
 *  header. The host must be `relative group`. */
export function SectionActions({ ctx, sectionId }: { ctx: RenderCtx; sectionId: string }) {
  const edit = ctx.edit
  if (!edit) return null
  const t = edit.labels
  // Only sections that draw (have a described line) take part in the order.
  const drawn = ctx.data.sections.filter((s) => (ctx.itemsBySection.get(s.id) ?? []).length > 0)
  const index = drawn.findIndex((s) => s.id === sectionId)
  return (
    <span className="absolute left-full top-1/2 ml-3 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={t.sectionActions} className={MARGIN_BTN}>
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="right">
          <DropdownMenuItem onSelect={() => edit.startNewItem(sectionId)}>{t.addItem}</DropdownMenuItem>
          <DropdownMenuItem disabled={index <= 0} onSelect={() => edit.moveSection(sectionId, -1)}>
            {t.moveUp}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index === -1 || index >= drawn.length - 1}
            onSelect={() => edit.moveSection(sectionId, 1)}
          >
            {t.moveDown}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => edit.dispatch({ type: 'REMOVE_SECTION', sectionId })}
          >
            {t.deleteSection}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}

/** A section's "add line" slot, laid over the empty left side of its subtotal
 *  row (absolute — the row's measured height never changes). Idle: a hover
 *  "+ Add item" button. Active (`edit.newItemSection === sectionId`): the new
 *  line's description field. The line is created only once it HAS a
 *  description — an empty line is never drawn (here or in the PDF), so creating
 *  it first would make it vanish. The host must be `relative group`. */
export function NewItemSlot({ ctx, sectionId }: { ctx: RenderCtx; sectionId: string }) {
  const edit = ctx.edit
  if (!edit) return null
  if (edit.newItemSection === sectionId) {
    return (
      <div className="absolute left-0 top-1/2 z-10 w-[60%] -translate-y-1/2 rounded-md bg-white px-2 py-1 text-[13px] font-normal text-zinc-900 shadow-lg ring-1 ring-zinc-200 [font-family:ui-sans-serif,system-ui,sans-serif]">
        <DescriptionField
          ctx={ctx}
          initial=""
          placeholder={ctx.L.description}
          className="block w-full bg-transparent outline-none"
          onCommit={(text) => (text.trim() ? edit.commitNewItem(sectionId, text) : edit.cancelNewItem())}
          onPick={(pb) => edit.commitNewItem(sectionId, pb.name, pb)}
          onCancel={edit.cancelNewItem}
        />
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => edit.startNewItem(sectionId)}
      className="absolute left-0 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-normal text-zinc-500 opacity-0 transition-opacity hover:bg-zinc-100 hover:text-zinc-900 group-hover:opacity-100 focus-visible:opacity-100 [font-family:ui-sans-serif,system-ui,sans-serif]"
    >
      <Plus className="h-3 w-3" />
      {edit.labels.addItem}
    </button>
  )
}

/** Side-toolbar "Add section": asks for the title AND the first line up
 *  front, for the same reason NewItemSlot does — a section with no described
 *  line is not drawn. */
export function AddSectionButton({
  labels,
  onAdd,
}: {
  labels: EditLabels
  onAdd: (title: string, firstItemDescription: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [firstItem, setFirstItem] = useState('')
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setTitle('')
          setFirstItem('')
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title={labels.addSection}
          className="flex w-14 flex-col items-center gap-1 rounded-xl border border-border bg-background/95 py-2 text-[11px] font-normal leading-tight text-foreground shadow-sm transition-colors hover:border-primary hover:text-primary"
        >
          <Plus className="h-4 w-4" />
          {labels.addSection}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-72">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!firstItem.trim()) return
            onAdd(title.trim(), firstItem.trim())
            setOpen(false)
            setTitle('')
            setFirstItem('')
          }}
        >
          <p className="text-sm font-normal">{labels.addSection}</p>
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={labels.sectionTitle} />
          <Input value={firstItem} onChange={(e) => setFirstItem(e.target.value)} placeholder={labels.firstLine} />
          <Button type="submit" size="sm" className="w-full" disabled={!firstItem.trim()}>
            {labels.addSection}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Totals — the whole totals block opens one popover with discount, tax and
// deposit. Its open state lives in PaginatedPreview (edit.totalsOpen): a
// change can move the totals block to another sheet, which remounts it, and
// the popover must come back open on the new sheet.
// ---------------------------------------------------------------------------

type DiscountKind = 'none' | 'percentage' | 'fixed'
type DepositKind = 'none' | 'percent' | 'amount'

function TotalsEditor({ ctx }: { ctx: RenderCtx }) {
  const edit = ctx.edit!
  const t = edit.labels
  const { data } = ctx
  const symbol = getCurrencySymbol(data.currency_code)
  const discountKind = (data.discount_type ?? 'none') as DiscountKind
  const depositKind = (data.deposit_type ?? 'none') as DepositKind
  const taxPct = Math.round(data.tax_rate * 10000) / 100
  const defaultTax = edit.defaultTaxRate
  const taxOverridden =
    defaultTax !== undefined && Math.round(data.tax_rate * 10000) !== Math.round(defaultTax * 10000)

  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t.discount}</p>
        <div className="flex items-center justify-between gap-3">
          <Segmented<DiscountKind>
            ariaLabel={t.discount}
            value={discountKind}
            options={[
              { value: 'none', label: t.none },
              { value: 'percentage', label: t.percent },
              { value: 'fixed', label: symbol },
            ]}
            onChange={(kind) =>
              edit.dispatch({
                type: 'UPDATE_DISCOUNT',
                discount_type: kind === 'none' ? null : kind,
                discount_value: kind === 'none' ? 0 : data.discount_value,
              })
            }
          />
          {discountKind !== 'none' && (
            <DraftNumberField
              value={data.discount_value}
              ariaLabel={t.discount}
              suffix={discountKind === 'percentage' ? '%' : symbol}
              onCommit={(v) =>
                edit.dispatch({ type: 'UPDATE_DISCOUNT', discount_type: data.discount_type, discount_value: v })
              }
            />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t.tax}</p>
        <div className="flex items-center justify-between gap-3">
          {taxOverridden ? (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => edit.dispatch({ type: 'UPDATE_TAX_RATE', tax_rate: defaultTax ?? 0 })}
            >
              {t.resetToDefault} ({Math.round((defaultTax ?? 0) * 10000) / 100}%)
            </button>
          ) : (
            <span />
          )}
          <DraftNumberField
            value={taxPct}
            ariaLabel={t.tax}
            suffix="%"
            onCommit={(v) => edit.dispatch({ type: 'UPDATE_TAX_RATE', tax_rate: v / 100 })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t.deposit}</p>
        <div className="flex items-center justify-between gap-3">
          <Segmented<DepositKind>
            ariaLabel={t.deposit}
            value={depositKind}
            options={[
              { value: 'none', label: t.none },
              { value: 'percent', label: t.percent },
              { value: 'amount', label: symbol },
            ]}
            onChange={(kind) =>
              edit.dispatch({
                type: 'UPDATE_DEPOSIT',
                deposit_type: kind,
                deposit_value: kind === 'none' ? null : (data.deposit_value ?? 0),
              })
            }
          />
          {depositKind !== 'none' && (
            <DraftNumberField
              value={data.deposit_value ?? 0}
              ariaLabel={t.deposit}
              suffix={depositKind === 'percent' ? '%' : symbol}
              onCommit={(v) => edit.dispatch({ type: 'UPDATE_DEPOSIT', deposit_type: depositKind, deposit_value: v })}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** The totals column. Read-only: a plain div. Editable: the same div, made a
 *  button that opens TotalsEditor (an outline on hover, no layout change). */
export function EditableTotals({
  ctx,
  className,
  children,
}: {
  ctx: RenderCtx
  className: string
  children: ReactNode
}) {
  const edit = ctx.edit
  if (!edit) return <div className={className}>{children}</div>
  return (
    <Popover open={edit.totalsOpen} onOpenChange={edit.setTotalsOpen}>
      <PopoverTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          aria-label={edit.labels.editTotals}
          title={edit.labels.editTotals}
          className={`${className} ${OUTLINE_HINT} cursor-pointer`}
        >
          {children}
        </div>
      </PopoverTrigger>
      <PopoverContent side="left" align="center" className="w-80">
        <TotalsEditor ctx={ctx} />
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Client — the Bill To cell opens the panel where the client is linked.
// ---------------------------------------------------------------------------

/** The Bill To grid cell. Editable: clicking it opens the client panel. */
export function ClientCell({ ctx, children }: { ctx: RenderCtx; children: ReactNode }) {
  const open = ctx.edit?.openClientPanel
  if (!open) return <div>{children}</div>
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ctx.edit!.labels.editClient}
      title={ctx.edit!.labels.editClient}
      className={`${OUTLINE_HINT} cursor-pointer`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
    >
      {children}
    </div>
  )
}

/** No client yet: an empty Bill To cell — editable, a "+ Link client" button
 *  (one line, in a cell the left column already out-measures). */
export function LinkClientSlot({ ctx }: { ctx: RenderCtx }) {
  const open = ctx.edit?.openClientPanel
  if (!open) return null
  return (
    <div>
      <button
        type="button"
        onClick={open}
        className="flex items-center gap-1 rounded-md border border-dashed border-zinc-300 px-2 py-1 text-xs font-normal text-zinc-500 hover:border-zinc-400 hover:text-zinc-900 [font-family:ui-sans-serif,system-ui,sans-serif]"
      >
        <Plus className="h-3 w-3" />
        {ctx.edit!.labels.linkClient}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

/** Remove-from-estimate "×" for a photo tile (the photo stays in the project). */
export function PhotoRemoveButton({ ctx, photoId }: { ctx: RenderCtx; photoId: string }) {
  const detach = ctx.edit?.detachPhoto
  if (!detach) return null
  return (
    <button
      type="button"
      aria-label={ctx.edit!.labels.removePhoto}
      title={ctx.edit!.labels.removePhoto}
      onClick={() => detach(photoId)}
      className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover/photo:opacity-100 focus-visible:opacity-100"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Field bindings both templates share — the template keeps the wrapper (its
// look), these decide which reducer field a value writes to.
// ---------------------------------------------------------------------------

const TERMS_FIELD = {
  payment: 'payment_terms',
  timeline: 'timeline',
  warranty: 'warranty_terms',
  notes: 'notes',
} as const

/** A terms card's text. The company-wide "Estimate Terms" card is settings
 *  data, not this estimate's, so it stays read-only here. */
export function EditableTermsText({ ctx, card }: { ctx: RenderCtx; card: ResolvedTermsCard }) {
  if (card.key === 'estimate') return <>{card.text}</>
  const field = TERMS_FIELD[card.key]
  return (
    <EditableText
      ctx={ctx}
      multiline
      value={card.text}
      ariaLabel={card.label}
      placeholder={ctx.L.termsPlaceholder}
      onCommit={(v) => ctx.edit?.dispatch({ type: 'UPDATE_FIELD', field, value: v.trim() ? v : null })}
    />
  )
}

export function EditableSummary({ ctx, text }: { ctx: RenderCtx; text: string }) {
  return (
    <EditableText
      ctx={ctx}
      multiline
      value={text}
      ariaLabel={ctx.L.summary}
      placeholder={ctx.L.summaryPlaceholder}
      onCommit={(v) => ctx.edit?.dispatch({ type: 'UPDATE_FIELD', field: 'summary', value: v.trim() ? v : null })}
    />
  )
}

export function EditableSectionTitle({ ctx, sectionId, title }: { ctx: RenderCtx; sectionId: string; title: string }) {
  return (
    <EditableText
      ctx={ctx}
      value={title}
      ariaLabel={ctx.edit?.labels.sectionTitle}
      onCommit={(v) => ctx.edit?.dispatch({ type: 'UPDATE_SECTION_TITLE', sectionId, title: v })}
    />
  )
}

export function EditableProjectName({ ctx }: { ctx: RenderCtx }) {
  const rename = ctx.edit?.renameProject
  if (!rename) return <>{ctx.projectName}</>
  return (
    <EditableText
      ctx={ctx}
      value={ctx.projectName}
      ariaLabel={ctx.L.project}
      onCommit={(v) => {
        const name = v.trim()
        // An empty name is not a rename; a failed rename already toasts.
        if (name && name !== ctx.projectName) void Promise.resolve(rename(name)).catch(() => {})
      }}
    />
  )
}

export function EditableEstimateNumber({ ctx }: { ctx: RenderCtx }) {
  return (
    <EditableText
      ctx={ctx}
      value={ctx.data.estimate_number ?? ctx.defaultEstimateNumber}
      ariaLabel={ctx.L.estimateNum}
      onCommit={(v) =>
        ctx.edit?.dispatch({ type: 'UPDATE_FIELD', field: 'estimate_number', value: v.trim() || null })
      }
    />
  )
}
