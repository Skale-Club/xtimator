'use client'

import { Phone, MessageSquare, Mail } from 'lucide-react'
import { ClientAvatarUpload } from '@/components/clients/client-avatar-upload'
import { ClientDetailActions } from '@/components/clients/client-detail-actions'
import { ClientNewProjectButton } from '@/components/clients/client-new-project-button'
import { formatShortDate, localeFor } from '@/components/clients/client-list'
import { formatMoney } from '@/lib/money/currency'
import type { ClientDetail } from '@/lib/queries/clients'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'

interface ClientHeaderProps {
  client: ClientDetail
  companyId: string
  currencyCode: string
  totalValue: number
  activeCount: number
  lastActivityAt: string | null
}

/**
 * Top of the client page. Desktop: avatar, name and place on the left; call /
 * message / email, ⋯ (edit, delete) and New project on the right; a slim stats
 * strip underneath. Phone: name with ⋯, three big contact buttons, the stats
 * as a 2x2 grid and New project full width.
 */
export function ClientHeader({ client, companyId, currencyCode, totalValue, activeCount, lastActivityAt }: ClientHeaderProps) {
  const { t, language } = useTranslation()
  const locale = localeFor(language)
  const place = [client.city, client.state].filter(Boolean).join(', ')
  const since = new Date(client.created_at).toLocaleDateString(locale, { month: 'short', year: 'numeric' })

  const contacts = [
    client.phone && { key: 'call', href: `tel:${client.phone}`, icon: Phone, label: t('Call') },
    client.phone && { key: 'message', href: `sms:${client.phone}`, icon: MessageSquare, label: t('Message') },
    client.email && { key: 'email', href: `mailto:${client.email}`, icon: Mail, label: t('Email') },
  ].filter(Boolean) as Array<{ key: string; href: string; icon: typeof Phone; label: string }>

  const stats = [
    { label: t('Total in estimates'), value: formatMoney(totalValue, currencyCode, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) },
    { label: t('Active projects'), value: String(activeCount) },
    { label: t('Projects'), value: String(client.project_count) },
    { label: t('Last activity'), value: lastActivityAt ? formatShortDate(lastActivityAt, locale) : '—' },
  ]

  return (
    <section
      aria-label={client.name}
      className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg)] shadow-[var(--shadow-glass)]"
    >
      <div className="flex flex-col gap-4 p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <ClientAvatarUpload clientId={client.id} clientName={client.name} logoUrl={client.logo_url} className="size-14 sm:size-16" />
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-[clamp(22px,3vw,32px)] font-semibold leading-tight tracking-[-0.02em]">{client.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {place ? `${place} · ` : ''}{t('Client since')} {since}
            </p>
          </div>
          {/* Phone: edit/delete next to the name */}
          <div className="self-start md:hidden">
            <ClientDetailActions client={client} companyId={companyId} />
          </div>
        </div>

        {/* Desktop actions */}
        <div className="hidden shrink-0 items-center gap-2 md:flex">
          {contacts.map((c) => (
            <a
              key={c.key}
              href={c.href}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--glass-border)] px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <c.icon className="h-4 w-4 text-muted-foreground" />
              {c.label}
            </a>
          ))}
          <ClientDetailActions client={client} companyId={companyId} />
          <ClientNewProjectButton clientId={client.id} clientName={client.name} />
        </div>

        {/* Phone: big contact buttons */}
        {contacts.length > 0 && (
          <div className={cn('grid gap-2 md:hidden', contacts.length === 3 ? 'grid-cols-3' : contacts.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
            {contacts.map((c) => (
              <a
                key={c.key}
                href={c.href}
                className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border border-[var(--glass-border)] bg-card text-sm font-medium active:bg-muted"
              >
                <c.icon className="h-5 w-5 text-primary" />
                {c.label}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Stats: slim strip on desktop, 2x2 on a phone */}
      <dl className="grid grid-cols-2 border-t border-[var(--glass-border)] md:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={cn(
              'min-w-0 px-4 py-3 sm:px-6',
              i % 2 === 1 && 'border-l border-[var(--glass-border)]',
              i >= 2 && 'border-t border-[var(--glass-border)] md:border-t-0',
              i === 2 && 'md:border-l',
            )}
          >
            <dt className="truncate text-xs text-muted-foreground">{s.label}</dt>
            <dd className="mt-0.5 truncate text-lg font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      {/* Phone: New project full width */}
      <div className="border-t border-[var(--glass-border)] p-4 md:hidden [&_button]:w-full">
        <ClientNewProjectButton clientId={client.id} clientName={client.name} />
      </div>
    </section>
  )
}
