'use client'

import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Building2,
  DollarSign,
  FileText,
  Bell,
  HelpCircle,
  LogOut,
  ChevronRight,
  Save
} from 'lucide-react'
import { toast } from 'sonner'

export function SettingsView() {
  const { user, settings, setUser, setSettings, resetStore } = useAppStore()
  
  const [businessName, setBusinessName] = useState(user?.businessName || '')
  const [businessType, setBusinessType] = useState(user?.businessType || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [address, setAddress] = useState(user?.address || '')
  
  const [currency, setCurrency] = useState(settings.currency)
  const [currencySymbol, setCurrencySymbol] = useState(settings.currencySymbol)
  const [taxRate, setTaxRate] = useState(String(settings.taxRate || ''))
  const [validityDays, setValidityDays] = useState(String(settings.defaultValidityDays))
  const [terms, setTerms] = useState(settings.termsAndConditions)

  const handleSaveProfile = () => {
    if (user) {
      setUser({
        ...user,
        businessName: businessName.trim(),
        businessType: businessType.trim(),
        phone: phone || undefined,
        address: address || undefined
      })
      toast.success('Perfil atualizado!')
    }
  }

  const handleSaveSettings = () => {
    setSettings({
      currency,
      currencySymbol,
      taxRate: Number(taxRate) || 0,
      defaultValidityDays: Number(validityDays) || 30,
      termsAndConditions: terms
    })
    toast.success('Configurações salvas!')
  }

  const handleReset = () => {
    if (confirm('Tem certeza que deseja apagar todos os dados? Esta ação não pode ser desfeita.')) {
      resetStore()
      window.location.reload()
    }
  }

  const currencyOptions = [
    { value: 'BRL', symbol: 'R$', label: 'Real (R$)' },
    { value: 'USD', symbol: '$', label: 'Dólar ($)' },
    { value: 'EUR', symbol: '€', label: 'Euro (€)' },
  ]

  return (
    <div className="flex flex-col min-h-full pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background p-4 border-b">
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
      </div>

      <div className="flex-1 p-4 space-y-6">
        {/* Business Profile */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Perfil da Empresa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="biz-name">Nome da empresa</Label>
              <Input
                id="biz-name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Sua empresa"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="biz-type">Tipo de serviço</Label>
              <Input
                id="biz-type"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                placeholder="Ex: Pintura Residencial"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="biz-phone">Telefone / WhatsApp</Label>
              <Input
                id="biz-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                type="tel"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="biz-address">Endereço</Label>
              <Input
                id="biz-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Endereço da empresa"
              />
            </div>
            <Button onClick={handleSaveProfile} className="w-full gap-2">
              <Save className="h-4 w-4" />
              Salvar Perfil
            </Button>
          </CardContent>
        </Card>

        {/* Currency & Tax */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Moeda e Impostos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Moeda</Label>
              <Select
                value={currency}
                onValueChange={(value) => {
                  const opt = currencyOptions.find(o => o.value === value)
                  setCurrency(value)
                  setCurrencySymbol(opt?.symbol || '$')
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencyOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax-rate">Taxa de impostos (%)</Label>
              <Input
                id="tax-rate"
                type="number"
                step="0.1"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="validity">Validade padrão (dias)</Label>
              <Input
                id="validity"
                type="number"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
                placeholder="30"
              />
            </div>
          </CardContent>
        </Card>

        {/* Terms */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Termos e Condições
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Termos e condições que aparecerão nos orçamentos..."
              rows={4}
            />
            <Button onClick={handleSaveSettings} className="w-full gap-2">
              <Save className="h-4 w-4" />
              Salvar Configurações
            </Button>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <Card>
          <CardContent className="p-0">
            <button className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-muted-foreground" />
                <span className="text-foreground">Notificações</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
            <div className="border-t" />
            <button className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors">
              <div className="flex items-center gap-3">
                <HelpCircle className="h-5 w-5 text-muted-foreground" />
                <span className="text-foreground">Ajuda e Suporte</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive/30">
          <CardContent className="p-4">
            <Button 
              variant="destructive" 
              className="w-full gap-2"
              onClick={handleReset}
            >
              <LogOut className="h-4 w-4" />
              Apagar todos os dados
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Esta ação não pode ser desfeita
            </p>
          </CardContent>
        </Card>

        {/* App Info */}
        <div className="text-center text-xs text-muted-foreground py-4">
          <p>Xtimator v1.0.0</p>
          <p>Feito com carinho para seu negócio</p>
        </div>
      </div>
    </div>
  )
}
