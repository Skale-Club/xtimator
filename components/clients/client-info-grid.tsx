'use client'

import { Mail, Phone, MapPin, FileText, Languages } from 'lucide-react'
import type { ClientDetail } from '@/lib/queries/clients'
import { formatClientPhone } from '@/lib/phone/format'
import { useTranslation } from '@/lib/i18n/use-translation'

interface ClientInfoGridProps {
  client: ClientDetail
}

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', pt: 'Português', es: 'Español' }

/**
 * Contact and details of a client in one card: the side column on desktop,
 * after the projects on a phone. Phone, email and address are links (call,
 * write, open in Maps); empty fields say so in muted text.
 */
export function ClientInfoGrid({ client }: ClientInfoGridProps) {
  const { t } = useTranslation()
  const addressParts = [client.address, client.city, client.state, client.zip].filter(Boolean)
  const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : null
  const phone = formatClientPhone(client.phone)

  const rows: Array<{ key: string; icon: typeof Mail; content: React.ReactNode; empty: boolean }> = [
    {
      key: 'phone',
      icon: Phone,
      empty: !client.phone,
      content: client.phone ? (
        <a href={`tel:${client.phone}`} className="hover:underline">{phone}</a>
      ) : t('No phone'),
    },
    {
      key: 'email',
      icon: Mail,
      empty: !client.email,
      content: client.email ? (
        <a href={`mailto:${client.email}`} className="break-all hover:underline">{client.email}</a>
      ) : t('No email'),
    },
    {
      key: 'address',
      icon: MapPin,
      empty: !fullAddress,
      content: fullAddress ? (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {fullAddress}
        </a>
      ) : t('No address'),
    },
  ]
  if (client.preferred_language) {
    rows.push({
      key: 'language',
      icon: Languages,
      empty: false,
      content: `${t('Estimates in')} ${LANGUAGE_NAMES[client.preferred_language] ?? client.preferred_language}`,
    })
  }

  return (
    <section
      aria-labelledby="client-details-heading"
      className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-glass)] sm:p-5"
    >
      <h2 id="client-details-heading" className="mb-3 text-sm font-semibold">{t('Contact and details')}</h2>
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.key} className="flex items-start gap-3 text-sm">
            <row.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className={row.empty ? 'text-muted-foreground' : 'min-w-0 break-words'}>{row.content}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-[var(--glass-border)] pt-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('Notes')}
        </h3>
        {client.notes ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{client.notes}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{t('No notes')}</p>
        )}
      </div>
    </section>
  )
}
