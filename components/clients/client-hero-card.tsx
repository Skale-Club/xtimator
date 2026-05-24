'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ClientDetailActions } from '@/components/clients/client-detail-actions'
import { ClientNewProjectButton } from '@/components/clients/client-new-project-button'
import { formatMoney } from '@/lib/money/currency'
import type { ClientDetail } from '@/lib/queries/clients'
import { DollarSign, FolderOpen, Calendar } from 'lucide-react'

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
  return (
    <Card variant="stat" className="relative overflow-hidden">
      <div className="p-6">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          {/* Avatar */}
          <Avatar className="h-20 w-20 shrink-0 ring-2 ring-offset-2 ring-offset-background gradient-brand">
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
              <div>
                <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-[-0.02em] leading-[1.1]">
                  {client.name}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {client.project_count} project{client.project_count !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <ClientDetailActions client={client} companyId={companyId} />
                <ClientNewProjectButton clientId={client.id} clientName={client.name} />
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-light)] p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  <span className="text-xs uppercase tracking-wider font-medium">Total Value</span>
                </div>
                <p className="text-xl font-semibold tracking-tight">
                  {formatMoney(totalValue, currencyCode, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>

              <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-light)] p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <FolderOpen className="h-3.5 w-3.5" />
                  <span className="text-xs uppercase tracking-wider font-medium">Active</span>
                </div>
                <p className="text-xl font-semibold tracking-tight">{activeCount}</p>
              </div>

              <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-light)] p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span className="text-xs uppercase tracking-wider font-medium">Since</span>
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
