'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ClientDetailActions } from '@/components/clients/client-detail-actions'
import { ClientNewProjectButton } from '@/components/clients/client-new-project-button'
import { formatMoney } from '@/lib/money/currency'
import type { ClientDetail } from '@/lib/queries/clients'
import { DollarSign, FolderOpen, Calendar } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'

interface ClientHeroCardProps {
  client: ClientDetail
  companyId: string
  currencyCode: string
  totalValue: number
  activeCount: number
}

export function ClientHeroCard({
  client,
  companyId,
  currencyCode,
  totalValue,
  activeCount,
}: ClientHeroCardProps) {
  const { t } = useTranslation()
  return (
    // Card carries its own py-6; on a phone the inner p-4 is enough on its
    // own, so the vertical padding is trimmed there (desktop is unchanged).
    <Card variant="stat" className="relative overflow-hidden py-2 sm:py-6">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
          {/* Avatar */}
          <Avatar className="h-16 w-16 sm:h-20 sm:w-20 shrink-0 ring-2 ring-offset-2 ring-offset-background gradient-brand">
            {client.logo_url && (
              <AvatarImage src={client.logo_url} alt={client.name} />
            )}
            <AvatarFallback className="text-2xl bg-transparent text-white">
              {client.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Name + Actions */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="break-words text-[clamp(24px,3.5vw,40px)] font-semibold tracking-[-0.02em] leading-[1.1]">
                  {client.name}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {client.project_count} {client.project_count !== 1 ? t('projects') : t('project')}
                </p>
              </div>

              {/* flex-wrap: Edit / Delete / New Project wrap to a second line on a
                  narrow phone instead of running past the card's edge. */}
              <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                <ClientDetailActions client={client} companyId={companyId} />
                <ClientNewProjectButton clientId={client.id} clientName={client.name} />
              </div>
            </div>

            {/* Stats row: Total value spans the full width on a phone (a 7-digit
                amount does not fit a third of the card), then two small tiles. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
              <div className="col-span-2 sm:col-span-1 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-light)] p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  <span className="text-xs uppercase tracking-wider font-medium">{t('Total Value')}</span>
                </div>
                <p className="truncate text-xl font-semibold tracking-tight">
                  {formatMoney(totalValue, currencyCode, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>

              <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-light)] p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <FolderOpen className="h-3.5 w-3.5" />
                  <span className="text-xs uppercase tracking-wider font-medium">{t('Active')}</span>
                </div>
                <p className="text-xl font-semibold tracking-tight">{activeCount}</p>
              </div>

              <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-light)] p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span className="text-xs uppercase tracking-wider font-medium">{t('Since')}</span>
                </div>
                <p className="text-xl font-semibold tracking-tight">
                  {new Date(client.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
