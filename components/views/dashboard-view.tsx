'use client'

import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  Plus, 
  FileText, 
  Users, 
  TrendingUp,
  Clock,
  CheckCircle,
  Send,
  Eye
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface DashboardViewProps {
  onNavigate: (view: string) => void
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const { user, estimates, customers, settings } = useAppStore()

  const stats = {
    totalEstimates: estimates.length,
    pendingEstimates: estimates.filter(e => e.status === 'sent' || e.status === 'viewed').length,
    acceptedEstimates: estimates.filter(e => e.status === 'accepted').length,
    totalCustomers: customers.length,
    totalValue: estimates.reduce((sum, e) => sum + e.total, 0),
    acceptedValue: estimates
      .filter(e => e.status === 'accepted')
      .reduce((sum, e) => sum + e.total, 0),
  }

  const recentEstimates = estimates
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft': return <Clock className="h-4 w-4 text-muted-foreground" />
      case 'sent': return <Send className="h-4 w-4 text-blue-500" />
      case 'viewed': return <Eye className="h-4 w-4 text-amber-500" />
      case 'accepted': return <CheckCircle className="h-4 w-4 text-green-500" />
      default: return <FileText className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: 'Rascunho',
      sent: 'Enviado',
      viewed: 'Visualizado',
      accepted: 'Aceito',
      rejected: 'Recusado',
      expired: 'Expirado'
    }
    return labels[status] || status
  }

  return (
    <div className="flex flex-col min-h-full pb-24">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-6 rounded-b-3xl">
        <p className="text-primary-foreground/80 text-sm">Bem-vindo de volta,</p>
        <h1 className="text-2xl font-bold">{user?.businessName || 'Meu Negócio'}</h1>
      </div>

      <div className="flex-1 p-4 space-y-6 -mt-4">
        {/* Quick Action */}
        <Card className="border-0 shadow-lg">
          <CardContent className="p-4">
            <Button 
              className="w-full h-14 text-lg gap-2" 
              onClick={() => onNavigate('new-estimate')}
            >
              <Plus className="h-5 w-5" />
              Novo Orçamento
            </Button>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.totalEstimates}</p>
                  <p className="text-xs text-muted-foreground">Orçamentos</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.pendingEstimates}</p>
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.acceptedEstimates}</p>
                  <p className="text-xs text-muted-foreground">Aceitos</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.totalCustomers}</p>
                  <p className="text-xs text-muted-foreground">Clientes</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Revenue Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor Total Aceito</p>
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(stats.acceptedValue, settings.currencySymbol)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Estimates */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              Orçamentos Recentes
              <Button variant="ghost" size="sm" onClick={() => onNavigate('estimates')}>
                Ver todos
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {recentEstimates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum orçamento ainda</p>
                <p className="text-sm">Crie seu primeiro orçamento!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentEstimates.map((estimate) => (
                  <div
                    key={estimate.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer"
                    onClick={() => onNavigate(`estimate-${estimate.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      {getStatusIcon(estimate.status)}
                      <div>
                        <p className="font-medium text-foreground text-sm">
                          {estimate.title || estimate.customerName || 'Sem título'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {getStatusLabel(estimate.status)}
                        </p>
                      </div>
                    </div>
                    <p className="font-semibold text-foreground">
                      {formatCurrency(estimate.total, settings.currencySymbol)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
