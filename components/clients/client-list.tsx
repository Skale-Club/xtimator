'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Users, Plus, Phone, Mail, Search, ArrowUpDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ListSearch, TOOLBAR_CONTROL } from '@/components/ui/list-toolbar'
import { useListUrlState } from '@/components/ui/list-url-state'
import { EmptyState } from '@/components/dashboard/empty-state'
import { ClientSheet } from '@/components/clients/client-sheet'
import type { ClientDetail, ClientStats } from '@/lib/queries/clients'
import { DEFAULT_CURRENCY_CODE, formatMoney } from '@/lib/money/currency'
import { formatClientPhone } from '@/lib/phone/format'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'

type ClientRowData = ClientDetail & Partial<ClientStats>

interface ClientListProps {
  clients: ClientRowData[]
  companyId: string
  currencyCode?: string
}

type SortKey = 'recent' | 'value' | 'az' | 'za' | 'most'

/** Rows shown before "Show more" (a company rarely has more; keeps the DOM small). */
const PAGE_SIZE = 50

/**
 * Desktop row grid: client · contact · quick actions · projects · total · last.
 * Wide gaps on purpose: the contact column must never touch its neighbours.
 */
const ROW_GRID =
  'md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.25fr)_4.5rem_4.5rem_6.5rem_5.5rem] md:gap-x-6 lg:gap-x-8'

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w))
  if (words.length === 0) return '?'
  const first = words[0].charAt(0)
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : ''
  return (first + last).toUpperCase()
}

export function localeFor(language: string): string {
  return language === 'pt' ? 'pt-BR' : language === 'es' ? 'es' : 'en-US'
}

export function formatShortDate(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(locale, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', year: 'numeric' })
}

/**
 * The Clients list: one responsive layout for phone and desktop, in the same
 * frame as the Price Book. Each client is ONE row element (no duplicated
 * table + card trees). Clicking anywhere on a row opens the client; editing
 * and deleting live on the client page. Call and email are one tap away.
 */
export function ClientList({ clients, companyId, currencyCode = DEFAULT_CURRENCY_CODE }: ClientListProps) {
  const { t, language } = useTranslation()
  const locale = localeFor(language)
  const url = useListUrlState()
  const [search, setSearchState] = useState(() => url.read('q') ?? '')
  function setSearch(value: string) {
    setSearchState(value)
    setVisible(PAGE_SIZE)
    url.write({ q: value.trim() || null })
  }
  const [sort, setSortState] = useState<SortKey>(() => {
    const fromUrl = url.read('sort') as SortKey | null
    return fromUrl && ['recent', 'value', 'az', 'za', 'most'].includes(fromUrl) ? fromUrl : 'recent'
  })
  function setSort(value: SortKey) {
    setSortState(value)
    url.write({ sort: value === 'recent' ? null : value })
  }
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [sheetOpen, setSheetOpen] = useState(false)

  const sortOptions: Array<{ value: SortKey; label: string }> = [
    { value: 'recent', label: t('Recent activity') },
    { value: 'value', label: t('Highest total') },
    { value: 'az', label: t('A → Z') },
    { value: 'za', label: t('Z → A') },
    { value: 'most', label: t('Most projects') },
  ]

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const digits = q.replace(/\D/g, '')
    const filtered = q
      ? clients.filter((c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email?.toLowerCase().includes(q) ?? false) ||
          (c.city?.toLowerCase().includes(q) ?? false) ||
          (c.phone?.toLowerCase().includes(q) ?? false) ||
          (digits.length >= 3 && (c.phone?.replace(/\D/g, '').includes(digits) ?? false)))
      : clients
    const byName = (a: ClientRowData, b: ClientRowData) => a.name.localeCompare(b.name)
    const sorted = [...filtered]
    switch (sort) {
      case 'recent':
        // Newest project first; clients without projects follow, newest first.
        sorted.sort((a, b) =>
          (b.last_activity_at ?? '').localeCompare(a.last_activity_at ?? '') ||
          b.created_at.localeCompare(a.created_at) || byName(a, b))
        break
      case 'value':
        sorted.sort((a, b) => (b.total_value ?? 0) - (a.total_value ?? 0) || byName(a, b))
        break
      case 'za':
        sorted.sort((a, b) => b.name.localeCompare(a.name))
        break
      case 'most':
        sorted.sort((a, b) => b.project_count - a.project_count || byName(a, b))
        break
      default:
        sorted.sort(byName)
    }
    return sorted
  }, [clients, search, sort])

  const totalValue = clients.reduce((sum, c) => sum + (c.total_value ?? 0), 0)
  const money = (value: number) => formatMoney(value, currencyCode, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  const compactMoney = (value: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, notation: 'compact', maximumFractionDigits: 1 }).format(value)

  const sheet = (
    <ClientSheet open={sheetOpen} onOpenChange={setSheetOpen} client={null} companyId={companyId} />
  )

  if (clients.length === 0) {
    return (
      <>
        <EmptyState
          icon={Users}
          title={t('No clients yet')}
          description={t('Add your first client to get started')}
          actionLabel={t('Add Client')}
          onAction={() => setSheetOpen(true)}
        />
        {sheet}
      </>
    )
  }

  const activeSort = sortOptions.find((o) => o.value === sort) ?? sortOptions[0]
  const shown = rows.slice(0, visible)

  return (
    <>
      {/* Desktop: one panel. Phone: flat, full width. No backdrop blur (it froze
          long lists while scrolling on phones). */}
      <div className="md:rounded-[var(--radius-lg)] md:border md:border-[var(--glass-border)] md:bg-[var(--glass-bg)] md:shadow-[var(--shadow-glass)]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3 md:border-b md:border-[var(--glass-border)] md:px-5 md:py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold tracking-[-0.015em] sm:text-2xl">{t('Clients')}</h2>
            <p className="text-sm text-muted-foreground" data-testid="clients-summary">
              {clients.length} {clients.length === 1 ? t('client') : t('clients')}
              {totalValue > 0 && <> · {compactMoney(totalValue)} {t('in estimates')}</>}
            </p>
          </div>

          <div className="order-last flex w-full min-w-0 items-center gap-2 md:order-none md:w-auto">
            <ListSearch
              className="min-w-0 flex-1 md:w-64 md:flex-none"
              value={search}
              onChange={setSearch}
              placeholder={t('Search clients...')}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {/* Icon only on a phone (the search keeps the width); labelled from sm. */}
                <Button variant="outline" className={cn(TOOLBAR_CONTROL, 'size-9 shrink-0 gap-1.5 p-0 sm:w-auto sm:px-3')} aria-label={`${t('Sort')}: ${activeSort.label}`}>
                  <ArrowUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="hidden truncate sm:inline">{activeSort.label}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {sortOptions.map((o) => (
                  <DropdownMenuItem key={o.value} onSelect={() => setSort(o.value)}>
                    <Check className={cn('h-4 w-4', o.value === sort ? 'opacity-100' : 'opacity-0')} />
                    {o.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Button variant="primary" size="sm" className="size-9 shrink-0 rounded-full p-0 sm:h-9 sm:w-auto sm:rounded-lg sm:px-3" onClick={() => setSheetOpen(true)}>
            <Plus className="h-4 w-4" />
            <span className="sr-only sm:not-sr-only">{t('Add Client')}</span>
          </Button>
        </div>

        <div className="mt-4 md:mt-0">
          {rows.length === 0 ? (
            <div className="md:p-5">
              <EmptyState
                icon={Search}
                title={t('No clients match your search')}
                description={t('Try a different search term')}
                onClearFilter={() => setSearch('')}
              />
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--glass-border)] bg-card md:rounded-none md:border-0 md:bg-transparent">
              <div className={cn('hidden border-b border-[var(--glass-border)] px-5 py-2.5 text-xs font-medium text-muted-foreground', ROW_GRID)} aria-hidden="true">
                <span>{t('Client')}</span>
                <span>{t('Contact')}</span>
                <span />
                <span className="text-right">{t('Projects')}</span>
                <span className="text-right">{t('Total')}</span>
                <span className="text-right">{t('Last')}</span>
              </div>
              <ul>
                {shown.map((client) => (
                  <ClientRow
                    key={client.id}
                    client={client}
                    totalLabel={money(client.total_value ?? 0)}
                    lastLabel={client.last_activity_at ? formatShortDate(client.last_activity_at, locale) : ''}
                    projectsLabel={`${client.project_count} ${client.project_count === 1 ? t('project') : t('projects')}`}
                    noPhone={t('No phone')}
                    noEmail={t('No email')}
                    callLabel={`${t('Call')} ${client.name}`}
                    emailLabel={`${t('Email')} ${client.name}`}
                  />
                ))}
              </ul>
            </div>
          )}
          {rows.length > visible && (
            <div className="flex justify-center py-4">
              <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                {t('Show more')} ({rows.length - visible})
              </Button>
            </div>
          )}
        </div>
      </div>

      {sheet}
    </>
  )
}

function ClientRow({
  client,
  totalLabel,
  lastLabel,
  projectsLabel,
  noPhone,
  noEmail,
  callLabel,
  emailLabel,
}: {
  client: ClientRowData
  totalLabel: string
  lastLabel: string
  projectsLabel: string
  noPhone: string
  noEmail: string
  callLabel: string
  emailLabel: string
}) {
  const phone = formatClientPhone(client.phone)
  const place = [client.city, client.state].filter(Boolean).join(', ')
  const hasTotal = (client.total_value ?? 0) > 0
  const iconLink = 'relative z-10 inline-flex size-9 items-center justify-center rounded-full border border-[var(--glass-border)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <li className={cn('group relative flex items-center gap-3 border-b border-[var(--glass-border)] px-3 py-3 transition-colors last:border-b-0 hover:bg-muted/40 md:px-5', ROW_GRID)}>
      {/* Client: avatar, name (the row link), place on desktop / summary on a phone */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar className="size-9 shrink-0">
          {client.logo_url && <AvatarImage src={client.logo_url} alt="" />}
          <AvatarFallback className="text-xs font-medium">{initialsOf(client.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <Link
            href={`/clients/${client.id}`}
            className="block truncate font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
            title={client.name}
          >
            {client.name}
          </Link>
          {/* Phone: projects · total · last, one line under the name */}
          <p className="truncate text-xs text-muted-foreground md:hidden">
            {projectsLabel}
            {hasTotal && <> · {totalLabel}</>}
            {lastLabel && <> · {lastLabel}</>}
          </p>
          {/* Desktop: where the client is */}
          {place && <p className="hidden truncate text-xs text-muted-foreground md:block">{place}</p>}
        </div>
      </div>

      {/* Contact (desktop) */}
      <div className="hidden min-w-0 md:block">
        <p className={cn('truncate text-sm', !phone && 'text-muted-foreground')}>{phone || noPhone}</p>
        <p className="truncate text-xs text-muted-foreground" title={client.email ?? undefined}>{client.email || noEmail}</p>
      </div>

      {/* Quick actions: always on a phone (one button), on hover on desktop (both) */}
      <div className="flex shrink-0 items-center gap-1.5 md:justify-center md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100">
        {client.phone ? (
          <a href={`tel:${client.phone}`} className={iconLink} aria-label={callLabel} title={callLabel}>
            <Phone className="h-4 w-4" />
          </a>
        ) : null}
        {client.email ? (
          <a
            href={`mailto:${client.email}`}
            className={cn(iconLink, client.phone && 'hidden md:inline-flex')}
            aria-label={emailLabel}
            title={emailLabel}
          >
            <Mail className="h-4 w-4" />
          </a>
        ) : null}
      </div>

      <span className="hidden text-right text-sm tabular-nums md:block">{client.project_count}</span>
      <span className={cn('hidden text-right text-sm font-medium tabular-nums md:block', !hasTotal && 'font-normal text-muted-foreground')}>
        {hasTotal ? totalLabel : '—'}
      </span>
      <span className="hidden text-right text-sm text-muted-foreground md:block">{lastLabel || '—'}</span>
    </li>
  )
}
