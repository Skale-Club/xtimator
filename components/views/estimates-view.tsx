'use client'

import React from "react"

import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { 
  Plus, 
  Search, 
  FileText,
  Clock,
  Send,
  Eye,
  CheckCircle,
  XCircle,
  Filter
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import type { Estimate } from '@/lib/types'

interface EstimatesViewProps {
  onNavigate: (view: string) => void
  onSelectEstimate: (estimate: Estimate) => void
}

export function EstimatesView({ onNavigate, onSelectEstimate }: EstimatesViewProps) {
  const { estimates, settings } = useAppStore()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string | null>(null)

  const filteredEstimates = estimates
    .filter(e => {
      if (search) {
        const searchLower = search.toLowerCase()
        return (
          e.title?.toLowerCase().includes(searchLower) ||
          e.customerName?.toLowerCase().includes(searchLower)
        )
      }
      return true
    })
    .filter(e => !filter || e.status === filter)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { icon: React.ReactNode; label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      draft: { icon: <Clock className="h-3 w-3" />, label: 'Rascunho', variant: 'secondary' },
      sent: { icon: <Send className="h-3 w-3" />, label: 'Enviado', variant: 'default' },
      viewed: { icon: <Eye className="h-3 w-3" />, label: 'Visualizado', variant: 'outline' },
      accepted: { icon: <CheckCircle className="h-3 w-3" />, label: 'Aceito', variant: 'default' },
      rejected: { icon: <XCircle className="h-3 w-3" />, label: 'Recusado', variant: 'destructive' },
      expired: { icon: <Clock className="h-3 w-3" />, label: 'Expirado', variant: 'secondary' }
    }
    return configs[status] || configs.draft
  }

  const filterOptions = [
    { value: null, label: 'Todos' },
    { value: 'draft', label: 'Rascunhos' },
    { value: 'sent', label: 'Enviados' },
    { value: 'accepted', label: 'Aceitos' },
  ]

  return (
    <div className="flex flex-col min-h-full pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background p-4 border-b space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Orçamentos</h1>
          <Button onClick={() => onNavigate('new-estimate')} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Novo
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar orçamentos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filterOptions.map(opt => (
            <Badge
              key={opt.value || 'all'}
              variant={filter === opt.value ? 'default' : 'outline'}
              className="cursor-pointer whitespace-nowrap"
              onClick={() => setFilter(opt.value)}
            >
              {opt.label}
            </Badge>
          ))}
        </div>
      </div>

      {/* Estimates List */}
      <div className="flex-1 p-4">
        {filteredEstimates.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold text-foreground mb-1">Nenhum orçamento</h3>
            <p className="text-muted-foreground text-sm mb-4">
              {search ? 'Nenhum resultado encontrado' : 'Crie seu primeiro orçamento'}
            </p>
            {!search && (
              <Button onClick={() => onNavigate('new-estimate')} className="gap-2">
                <Plus className="h-4 w-4" />
                Criar Orçamento
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEstimates.map(estimate => {
              const status = getStatusConfig(estimate.status)
              return (
                <Card
                  key={estimate.id}
                  className="cursor-pointer hover:border-primary/50 transition-all"
                  onClick={() => onSelectEstimate(estimate)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-foreground truncate">
                            {estimate.customerName || estimate.title || 'Sem título'}
                          </p>
                          <Badge variant={status.variant} className="gap-1 shrink-0">
                            {status.icon}
                            {status.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {estimate.lineItems.length} {estimate.lineItems.length === 1 ? 'item' : 'itens'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(estimate.createdAt).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <p className="text-lg font-bold text-primary">
                        {formatCurrency(estimate.total, settings.currencySymbol)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
