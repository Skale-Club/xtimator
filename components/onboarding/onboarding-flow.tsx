'use client'

import React from "react"

import { useState } from 'react'
import { useAppStore, generateId } from '@/lib/store'
import { businessTemplates, generateServicesFromTemplate } from '@/lib/service-templates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { 
  Sparkles, 
  PaintBucket, 
  Trees, 
  Zap, 
  Droplets, 
  Wrench, 
  Settings,
  ArrowRight,
  ArrowLeft,
  Check,
  Building2
} from 'lucide-react'
import { cn } from '@/lib/utils'

const iconMap: Record<string, React.ReactNode> = {
  sparkles: <Sparkles className="h-6 w-6" />,
  paintbrush: <PaintBucket className="h-6 w-6" />,
  tree: <Trees className="h-6 w-6" />,
  zap: <Zap className="h-6 w-6" />,
  droplets: <Droplets className="h-6 w-6" />,
  wrench: <Wrench className="h-6 w-6" />,
  settings: <Settings className="h-6 w-6" />,
}

export function OnboardingFlow() {
  const { 
    onboardingStep, 
    setOnboardingStep, 
    setUser, 
    setCategories, 
    setServices,
    completeOnboarding 
  } = useAppStore()

  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [phone, setPhone] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)

  const handleBusinessInfoNext = () => {
    if (businessName.trim()) {
      setUser({
        id: generateId(),
        email: '',
        businessName: businessName.trim(),
        businessType: businessType || 'Serviços',
        phone: phone || undefined,
        createdAt: new Date(),
      })
      setOnboardingStep('service-selection')
    }
  }

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId)
    const template = businessTemplates.find(t => t.id === templateId)
    
    if (template && template.id !== 'custom') {
      const { categories, services } = generateServicesFromTemplate(template)
      setCategories(categories)
      setServices(services)
    } else {
      setCategories([])
      setServices([])
    }
    
    completeOnboarding()
  }

  if (onboardingStep === 'welcome') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md text-center space-y-8">
          <div className="space-y-4">
            <div className="mx-auto w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center">
              <Building2 className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground text-balance">
              Bem-vindo ao Xtimator
            </h1>
            <p className="text-muted-foreground text-lg text-pretty">
              Crie orçamentos profissionais em minutos. Vamos configurar seu negócio.
            </p>
          </div>
          
          <Button 
            onClick={() => setOnboardingStep('business-info')}
            className="w-full h-14 text-lg gap-2"
          >
            Começar
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    )
  }

  if (onboardingStep === 'business-info') {
    return (
      <div className="min-h-screen bg-background flex flex-col p-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOnboardingStep('welcome')}
          className="self-start -ml-2 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>

        <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              Sobre seu negócio
            </h1>
            <p className="text-muted-foreground">
              Essas informações aparecerão nos seus orçamentos.
            </p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="businessName" className="text-base">
                Nome da empresa *
              </Label>
              <Input
                id="businessName"
                placeholder="Ex: João Pinturas"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="h-14 text-lg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessType" className="text-base">
                Tipo de serviço
              </Label>
              <Input
                id="businessType"
                placeholder="Ex: Pintura Residencial"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="h-14 text-lg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-base">
                Telefone / WhatsApp
              </Label>
              <Input
                id="phone"
                placeholder="(11) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-14 text-lg"
                type="tel"
              />
            </div>
          </div>

          <Button 
            onClick={handleBusinessInfoNext}
            disabled={!businessName.trim()}
            className="w-full h-14 text-lg gap-2"
          >
            Continuar
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    )
  }

  if (onboardingStep === 'service-selection') {
    return (
      <div className="min-h-screen bg-background flex flex-col p-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOnboardingStep('business-info')}
          className="self-start -ml-2 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>

        <div className="flex-1 max-w-md mx-auto w-full space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              Escolha um modelo
            </h1>
            <p className="text-muted-foreground">
              Selecione o tipo de serviço que mais se aproxima do seu negócio.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {businessTemplates.map((template) => (
              <Card
                key={template.id}
                className={cn(
                  'cursor-pointer transition-all hover:border-primary/50',
                  selectedTemplate === template.id && 'border-primary ring-2 ring-primary/20'
                )}
                onClick={() => handleTemplateSelect(template.id)}
              >
                <CardContent className="p-4 text-center space-y-2">
                  <div className={cn(
                    'mx-auto w-12 h-12 rounded-xl flex items-center justify-center',
                    selectedTemplate === template.id 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-secondary text-secondary-foreground'
                  )}>
                    {iconMap[template.icon] || <Settings className="h-6 w-6" />}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{template.name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {template.description}
                    </p>
                  </div>
                  {selectedTemplate === template.id && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return null
}
