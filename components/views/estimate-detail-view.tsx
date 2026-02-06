'use client'

import React from "react"

import { useAppStore } from '@/lib/store'
import type { Estimate } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  ArrowLeft, 
  Send, 
  Download,
  Copy,
  User,
  Phone,
  MapPin,
  Calendar,
  CheckCircle,
  Clock,
  Eye,
  Share2
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

interface EstimateDetailViewProps {
  estimate: Estimate
  onBack: () => void
}

export function EstimateDetailView({ estimate, onBack }: EstimateDetailViewProps) {
  const { settings, updateEstimate } = useAppStore()

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
      draft: { icon: <Clock className="h-4 w-4" />, label: 'Rascunho', color: 'bg-secondary text-secondary-foreground' },
      sent: { icon: <Send className="h-4 w-4" />, label: 'Enviado', color: 'bg-blue-100 text-blue-700' },
      viewed: { icon: <Eye className="h-4 w-4" />, label: 'Visualizado', color: 'bg-amber-100 text-amber-700' },
      accepted: { icon: <CheckCircle className="h-4 w-4" />, label: 'Aceito', color: 'bg-green-100 text-green-700' },
      rejected: { icon: <Clock className="h-4 w-4" />, label: 'Recusado', color: 'bg-red-100 text-red-700' },
      expired: { icon: <Clock className="h-4 w-4" />, label: 'Expirado', color: 'bg-secondary text-secondary-foreground' }
    }
    return configs[status] || configs.draft
  }

  const status = getStatusConfig(estimate.status)

  const handleMarkAsSent = () => {
    updateEstimate(estimate.id, { status: 'sent', sentAt: new Date() })
    toast.success('Orçamento marcado como enviado')
  }

  const handleMarkAsAccepted = () => {
    updateEstimate(estimate.id, { status: 'accepted', respondedAt: new Date() })
    toast.success('Orçamento marcado como aceito!')
  }

  const handleShare = async () => {
    const text = `Orçamento - ${estimate.customerName}\n\n` +
      estimate.lineItems.map(item => 
        `${item.serviceName}: ${item.quantity} ${item.unit} - ${formatCurrency(item.total, settings.currencySymbol)}`
      ).join('\n') +
      `\n\nTotal: ${formatCurrency(estimate.total, settings.currencySymbol)}`

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Orçamento - ${estimate.customerName}`,
          text
        })
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(text)
      toast.success('Orçamento copiado!')
    }
  }

  const handleCopyLink = () => {
    const text = `Orçamento - ${estimate.customerName}\nTotal: ${formatCurrency(estimate.total, settings.currencySymbol)}`
    navigator.clipboard.writeText(text)
    toast.success('Copiado!')
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-card">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="font-semibold text-foreground">{estimate.customerName || 'Orçamento'}</h1>
          <p className="text-xs text-muted-foreground">
            {new Date(estimate.createdAt).toLocaleDateString('pt-BR')}
          </p>
        </div>
        <Badge className={`${status.color} gap-1`}>
          {status.icon}
          {status.label}
        </Badge>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Customer Info */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{estimate.customerName}</p>
                  {estimate.customerPhone && (
                    <a 
                      href={`tel:${estimate.customerPhone}`}
                      className="flex items-center gap-1 text-sm text-primary"
                    >
                      <Phone className="h-3 w-3" />
                      {estimate.customerPhone}
                    </a>
                  )}
                </div>
              </div>
              {estimate.customerAddress && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 mt-0.5" />
                  <span>{estimate.customerAddress}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="font-semibold text-foreground">Serviços</h3>
              <div className="space-y-3">
                {estimate.lineItems.map(item => (
                  <div key={item.id} className="flex justify-between items-start pb-3 border-b last:border-0 last:pb-0">
                    <div>
                      <p className="font-medium text-foreground">{item.serviceName}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.quantity} {item.unit} x {formatCurrency(item.unitPrice, settings.currencySymbol)}
                      </p>
                    </div>
                    <p className="font-semibold text-foreground">
                      {formatCurrency(item.total, settings.currencySymbol)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Photos */}
          {estimate.photos.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold text-foreground">Fotos</h3>
                <div className="flex flex-wrap gap-2">
                  {estimate.photos.map(photo => (
                    <img
                      key={photo.id}
                      src={photo.url || '/placeholder.svg'}
                      alt="Foto do trabalho"
                      className="w-20 h-20 object-cover rounded-lg"
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Totals */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-foreground">{formatCurrency(estimate.subtotal, settings.currencySymbol)}</span>
              </div>
              {estimate.taxAmount && estimate.taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Impostos ({estimate.taxRate}%)</span>
                  <span className="text-foreground">{formatCurrency(estimate.taxAmount, settings.currencySymbol)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-2 border-t">
                <span className="text-foreground">Total</span>
                <span className="text-primary">{formatCurrency(estimate.total, settings.currencySymbol)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Validity */}
          {estimate.validUntil && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center">
              <Calendar className="h-4 w-4" />
              <span>Válido até {new Date(estimate.validUntil).toLocaleDateString('pt-BR')}</span>
            </div>
          )}

          {/* Notes */}
          {estimate.notes && (
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold text-foreground mb-2">Observações</h3>
                <p className="text-sm text-muted-foreground">{estimate.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>

      {/* Actions */}
      <div className="p-4 border-t bg-card space-y-3">
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 gap-2 bg-transparent" onClick={handleShare}>
            <Share2 className="h-4 w-4" />
            Compartilhar
          </Button>
          <Button variant="outline" className="flex-1 gap-2 bg-transparent" onClick={handleCopyLink}>
            <Copy className="h-4 w-4" />
            Copiar
          </Button>
        </div>
        
        {estimate.status === 'draft' && (
          <Button className="w-full gap-2" onClick={handleMarkAsSent}>
            <Send className="h-4 w-4" />
            Marcar como Enviado
          </Button>
        )}
        
        {(estimate.status === 'sent' || estimate.status === 'viewed') && (
          <Button className="w-full gap-2" onClick={handleMarkAsAccepted}>
            <CheckCircle className="h-4 w-4" />
            Marcar como Aceito
          </Button>
        )}
      </div>
    </div>
  )
}
