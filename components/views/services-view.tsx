'use client'

import { useState } from 'react'
import { useAppStore, generateId } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Plus, 
  Search, 
  Package,
  MoreVertical,
  Pencil,
  Trash2
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import type { ServiceItem, ServiceCategory } from '@/lib/types'

interface ServicesViewProps {
  onNavigate: (view: string) => void
}

const unitOptions = [
  { value: 'hour', label: 'Hora' },
  { value: 'sqm', label: 'm²' },
  { value: 'sqft', label: 'ft²' },
  { value: 'unit', label: 'Unidade' },
  { value: 'linear_m', label: 'm linear' },
  { value: 'job', label: 'Serviço' },
]

export function ServicesView({ onNavigate }: ServicesViewProps) {
  const { services, categories, settings, addService, updateService, removeService, addCategory } = useAppStore()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingService, setEditingService] = useState<ServiceItem | null>(null)
  const [newService, setNewService] = useState({
    name: '',
    description: '',
    basePrice: '',
    unit: 'hour',
    categoryId: ''
  })

  const filteredServices = services
    .filter(s => {
      if (search) {
        const searchLower = search.toLowerCase()
        return (
          s.name.toLowerCase().includes(searchLower) ||
          s.description?.toLowerCase().includes(searchLower)
        )
      }
      return true
    })
    .filter(s => !selectedCategory || s.categoryId === selectedCategory)

  const getCategoryName = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId)
    return category?.name || 'Sem categoria'
  }

  const handleAddService = () => {
    if (!newService.name.trim()) {
      toast.error('Nome é obrigatório')
      return
    }
    if (!newService.basePrice || Number(newService.basePrice) <= 0) {
      toast.error('Preço deve ser maior que zero')
      return
    }

    const unitOption = unitOptions.find(u => u.value === newService.unit)
    
    const service: ServiceItem = {
      id: generateId(),
      name: newService.name.trim(),
      description: newService.description || undefined,
      basePrice: Number(newService.basePrice),
      unit: newService.unit as ServiceItem['unit'],
      unitLabel: unitOption?.label || 'Unidade',
      categoryId: newService.categoryId || categories[0]?.id || '',
      isActive: true
    }

    addService(service)
    toast.success('Serviço adicionado!')
    setNewService({ name: '', description: '', basePrice: '', unit: 'hour', categoryId: '' })
    setIsAddDialogOpen(false)
  }

  const handleUpdateService = () => {
    if (!editingService) return
    
    updateService(editingService.id, editingService)
    toast.success('Serviço atualizado!')
    setEditingService(null)
  }

  const handleDeleteService = (serviceId: string) => {
    removeService(serviceId)
    toast.success('Serviço removido')
  }

  const handleToggleActive = (service: ServiceItem) => {
    updateService(service.id, { isActive: !service.isActive })
  }

  return (
    <div className="flex flex-col min-h-full pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background p-4 border-b space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Serviços</h1>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Novo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Serviço</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="service-name">Nome *</Label>
                  <Input
                    id="service-name"
                    placeholder="Nome do serviço"
                    value={newService.name}
                    onChange={(e) => setNewService(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="service-desc">Descrição</Label>
                  <Input
                    id="service-desc"
                    placeholder="Descrição opcional"
                    value={newService.description}
                    onChange={(e) => setNewService(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="service-price">Preço *</Label>
                    <Input
                      id="service-price"
                      placeholder="0.00"
                      type="number"
                      step="0.01"
                      value={newService.basePrice}
                      onChange={(e) => setNewService(prev => ({ ...prev, basePrice: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Unidade</Label>
                    <Select
                      value={newService.unit}
                      onValueChange={(value) => setNewService(prev => ({ ...prev, unit: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {unitOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {categories.length > 0 && (
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select
                      value={newService.categoryId || categories[0]?.id}
                      onValueChange={(value) => setNewService(prev => ({ ...prev, categoryId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button onClick={handleAddService} className="w-full">
                  Adicionar Serviço
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar serviços..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Category Filter */}
        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Badge
              variant={selectedCategory === null ? 'default' : 'outline'}
              className="cursor-pointer whitespace-nowrap"
              onClick={() => setSelectedCategory(null)}
            >
              Todos
            </Badge>
            {categories.map(cat => (
              <Badge
                key={cat.id}
                variant={selectedCategory === cat.id ? 'default' : 'outline'}
                className="cursor-pointer whitespace-nowrap"
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.name}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Services List */}
      <div className="flex-1 p-4">
        {filteredServices.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold text-foreground mb-1">Nenhum serviço</h3>
            <p className="text-muted-foreground text-sm mb-4">
              {search ? 'Nenhum resultado encontrado' : 'Adicione seu primeiro serviço'}
            </p>
            {!search && (
              <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Adicionar Serviço
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredServices.map(service => (
              <Card key={service.id} className={!service.isActive ? 'opacity-60' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-foreground truncate">{service.name}</p>
                        {!service.isActive && (
                          <Badge variant="secondary">Inativo</Badge>
                        )}
                      </div>
                      {service.description && (
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {service.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">{getCategoryName(service.categoryId)}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatCurrency(service.basePrice, settings.currencySymbol)} / {service.unitLabel}
                        </span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditingService(service)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleActive(service)}>
                          {service.isActive ? 'Desativar' : 'Ativar'}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-destructive"
                          onClick={() => handleDeleteService(service.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingService} onOpenChange={(open) => !open && setEditingService(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Serviço</DialogTitle>
          </DialogHeader>
          {editingService && (
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={editingService.name}
                  onChange={(e) => setEditingService(prev => prev ? { ...prev, name: e.target.value } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input
                  value={editingService.description || ''}
                  onChange={(e) => setEditingService(prev => prev ? { ...prev, description: e.target.value } : null)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Preço</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editingService.basePrice}
                    onChange={(e) => setEditingService(prev => prev ? { ...prev, basePrice: Number(e.target.value) } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unidade</Label>
                  <Select
                    value={editingService.unit}
                    onValueChange={(value) => {
                      const unitOption = unitOptions.find(u => u.value === value)
                      setEditingService(prev => prev ? { 
                        ...prev, 
                        unit: value as ServiceItem['unit'],
                        unitLabel: unitOption?.label || 'Unidade'
                      } : null)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {unitOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleUpdateService} className="w-full">
                Salvar Alterações
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
