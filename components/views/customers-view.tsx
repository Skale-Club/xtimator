'use client'

import { useState } from 'react'
import { useAppStore, generateId } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { 
  Plus, 
  Search, 
  Users,
  User,
  Phone,
  Mail,
  MapPin,
  MoreVertical,
  FileText
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import type { Customer } from '@/lib/types'

interface CustomersViewProps {
  onNavigate: (view: string) => void
}

export function CustomersView({ onNavigate }: CustomersViewProps) {
  const { customers, estimates, addCustomer, removeCustomer } = useAppStore()
  const [search, setSearch] = useState('')
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    notes: ''
  })

  const filteredCustomers = customers
    .filter(c => {
      if (search) {
        const searchLower = search.toLowerCase()
        return (
          c.name.toLowerCase().includes(searchLower) ||
          c.phone?.toLowerCase().includes(searchLower) ||
          c.email?.toLowerCase().includes(searchLower)
        )
      }
      return true
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const getCustomerEstimatesCount = (customerId: string) => {
    return estimates.filter(e => e.customerId === customerId).length
  }

  const handleAddCustomer = () => {
    if (!newCustomer.name.trim()) {
      toast.error('Nome é obrigatório')
      return
    }

    const customer: Customer = {
      id: generateId(),
      name: newCustomer.name.trim(),
      phone: newCustomer.phone || undefined,
      email: newCustomer.email || undefined,
      address: newCustomer.address || undefined,
      notes: newCustomer.notes || undefined,
      createdAt: new Date()
    }

    addCustomer(customer)
    toast.success('Cliente adicionado!')
    setNewCustomer({ name: '', phone: '', email: '', address: '', notes: '' })
    setIsAddDialogOpen(false)
  }

  const handleDeleteCustomer = (customer: Customer) => {
    removeCustomer(customer.id)
    toast.success('Cliente removido')
  }

  return (
    <div className="flex flex-col min-h-full pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background p-4 border-b space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Novo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Cliente</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    placeholder="Nome do cliente"
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    placeholder="(11) 99999-9999"
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))}
                    type="tel"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    placeholder="email@exemplo.com"
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, email: e.target.value }))}
                    type="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Endereço</Label>
                  <Input
                    id="address"
                    placeholder="Endereço completo"
                    value={newCustomer.address}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, address: e.target.value }))}
                  />
                </div>
                <Button onClick={handleAddCustomer} className="w-full">
                  Adicionar Cliente
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar clientes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Customers List */}
      <div className="flex-1 p-4">
        {filteredCustomers.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold text-foreground mb-1">Nenhum cliente</h3>
            <p className="text-muted-foreground text-sm mb-4">
              {search ? 'Nenhum resultado encontrado' : 'Adicione seu primeiro cliente'}
            </p>
            {!search && (
              <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Adicionar Cliente
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCustomers.map(customer => {
              const estimatesCount = getCustomerEstimatesCount(customer.id)
              return (
                <Card key={customer.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-foreground truncate">{customer.name}</p>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => onNavigate('new-estimate')}>
                                <FileText className="h-4 w-4 mr-2" />
                                Novo Orçamento
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => handleDeleteCustomer(customer)}
                              >
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="space-y-1 mt-1">
                          {customer.phone && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              <span>{customer.phone}</span>
                            </div>
                          )}
                          {customer.email && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              <span className="truncate">{customer.email}</span>
                            </div>
                          )}
                          {customer.address && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate">{customer.address}</span>
                            </div>
                          )}
                        </div>
                        {estimatesCount > 0 && (
                          <Badge variant="secondary" className="mt-2">
                            {estimatesCount} {estimatesCount === 1 ? 'orçamento' : 'orçamentos'}
                          </Badge>
                        )}
                      </div>
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
