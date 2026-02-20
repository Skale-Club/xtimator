'use client'

import React from "react"

import { useState, useRef, useEffect } from 'react'
import { useAppStore, generateId } from '@/lib/store'
import type { EstimateLineItem, EstimatePhoto, ChatMessage, Estimate } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { 
  ArrowLeft, 
  Send, 
  Camera, 
  ImageIcon,
  Plus,
  Minus,
  X,
  FileText,
  User,
  ChevronRight,
  Sparkles,
  Package
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

interface EstimateCreatorViewProps {
  onBack: () => void
  onComplete: (estimate: Estimate) => void
}

export function EstimateCreatorView({ onBack, onComplete }: EstimateCreatorViewProps) {
  const { services, categories, customers, settings, addEstimate } = useAppStore()
  
  const [step, setStep] = useState<'customer' | 'items' | 'review'>('customer')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [lineItems, setLineItems] = useState<EstimateLineItem[]>([])
  const [photos, setPhotos] = useState<EstimatePhoto[]>([])
  const [notes, setNotes] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: generateId(),
      role: 'assistant',
      content: 'Hello! I\'ll help you create an estimate. You can add services from the list or describe what you need.',
      timestamp: new Date()
    }
  ])
  const [chatInput, setChatInput] = useState('')
  const [showServiceSheet, setShowServiceSheet] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  
  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0)
  const taxAmount = settings.taxRate ? subtotal * (settings.taxRate / 100) : 0
  const total = subtotal + taxAmount

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const handleSelectCustomer = (customer: typeof customers[0]) => {
    setSelectedCustomerId(customer.id)
    setCustomerName(customer.name)
    setCustomerPhone(customer.phone || '')
    setCustomerAddress(customer.address || '')
  }

  const handleAddService = (service: typeof services[0], quantity: number = 1) => {
    const existingIndex = lineItems.findIndex(item => item.serviceItemId === service.id)
    
    if (existingIndex >= 0) {
      const updated = [...lineItems]
      updated[existingIndex].quantity += quantity
      updated[existingIndex].total = updated[existingIndex].quantity * updated[existingIndex].unitPrice
      setLineItems(updated)
    } else {
      const newItem: EstimateLineItem = {
        id: generateId(),
        serviceItemId: service.id,
        serviceName: service.name,
        description: service.description,
        quantity,
        unit: service.unitLabel,
        unitPrice: service.basePrice,
        total: quantity * service.basePrice
      }
      setLineItems([...lineItems, newItem])
    }
    
    // Add chat message
    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: `Added "${service.name}" to the estimate. ${lineItems.length === 0 ? 'Want to add another service?' : `You now have ${lineItems.length + 1} items in the estimate.`}`,
      timestamp: new Date()
    }
    setChatMessages(prev => [...prev, assistantMessage])
    setShowServiceSheet(false)
  }

  const handleUpdateQuantity = (itemId: string, delta: number) => {
    setLineItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const newQty = Math.max(1, item.quantity + delta)
        return { ...item, quantity: newQty, total: newQty * item.unitPrice }
      }
      return item
    }))
  }

  const handleRemoveItem = (itemId: string) => {
    setLineItems(prev => prev.filter(item => item.id !== itemId))
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = (event) => {
        const newPhoto: EstimatePhoto = {
          id: generateId(),
          url: event.target?.result as string,
          createdAt: new Date()
        }
        setPhotos(prev => [...prev, newPhoto])
        
        const assistantMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: 'Photo added to estimate! Photos help the client better understand the work.',
          timestamp: new Date()
        }
        setChatMessages(prev => [...prev, assistantMessage])
      }
      reader.readAsDataURL(file)
    })
  }

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim()) return

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: chatInput,
      timestamp: new Date()
    }
    setChatMessages(prev => [...prev, userMessage])
    
    // Simple AI response simulation
    setTimeout(() => {
      let response = ''
      const input = chatInput.toLowerCase()
      
      if (input.includes('help') || input.includes('how')) {
        response = 'You can:\n- Add services by clicking the "+" button below\n- Send photos of the work\n- Adjust item quantities\n- When finished, click "Review Estimate"'
      } else if (input.includes('done') || input.includes('finish') || input.includes('review')) {
        response = 'Great! Click the "Review Estimate" button to see the summary and generate the PDF.'
        setStep('review')
      } else if (input.includes('discount')) {
        response = 'You can apply discounts in the estimate review screen.'
      } else {
        const matchedService = services.find(s => 
          s.name.toLowerCase().includes(input) || 
          (s.description && s.description.toLowerCase().includes(input))
        )
        if (matchedService) {
          response = `Found "${matchedService.name}" for ${formatCurrency(matchedService.basePrice, settings.currencySymbol)}/${matchedService.unitLabel}. Would you like me to add it to the estimate?`
        } else {
          response = 'Got it! To add specific services, use the "+" button below or describe what you need in more detail.'
        }
      }
      
      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: response,
        timestamp: new Date()
      }
      setChatMessages(prev => [...prev, assistantMessage])
    }, 500)
    
    setChatInput('')
  }

  const handleCreateEstimate = () => {
    if (lineItems.length === 0) {
      toast.error('Add at least one service to the estimate')
      return
    }

    const estimate: Estimate = {
      id: generateId(),
      customerId: selectedCustomerId || undefined,
      customerName: customerName || 'Customer',
      customerPhone: customerPhone || undefined,
      customerAddress: customerAddress || undefined,
      title: `Estimate - ${customerName || 'Customer'}`,
      status: 'draft',
      lineItems,
      photos,
      subtotal,
      taxRate: settings.taxRate,
      taxAmount,
      total,
      notes,
      termsAndConditions: settings.termsAndConditions,
      validUntil: new Date(Date.now() + settings.defaultValidityDays * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date()
    }

    addEstimate(estimate)
    toast.success('Estimate created successfully!')
    onComplete(estimate)
  }

  // Customer Step
  if (step === 'customer') {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex items-center gap-3 p-4 border-b bg-card">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-semibold text-foreground">New Estimate</h1>
            <p className="text-xs text-muted-foreground">Customer information</p>
          </div>
        </div>

        <div className="flex-1 p-4 space-y-6 overflow-auto">
          {customers.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Recent Customers</p>
              <div className="space-y-2">
                {customers.slice(0, 3).map(customer => (
                  <Card 
                    key={customer.id}
                    className={cn(
                      'cursor-pointer transition-all',
                      selectedCustomerId === customer.id && 'border-primary ring-2 ring-primary/20'
                    )}
                    onClick={() => handleSelectCustomer(customer)}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                        <User className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{customer.name}</p>
                        <p className="text-xs text-muted-foreground">{customer.phone || customer.email}</p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <p className="text-sm font-medium text-foreground">
              {customers.length > 0 ? 'Or add new customer' : 'Customer Information'}
            </p>
            
            <div className="space-y-3">
              <Input
                placeholder="Customer name *"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="h-12"
              />
              <Input
                placeholder="Phone / WhatsApp"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="h-12"
                type="tel"
              />
              <Input
                placeholder="Address"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="h-12"
              />
            </div>
          </div>
        </div>

        <div className="p-4 border-t bg-card">
          <Button 
            className="w-full h-12"
            onClick={() => setStep('items')}
            disabled={!customerName.trim()}
          >
            Continue
            <ChevronRight className="h-5 w-5 ml-2" />
          </Button>
        </div>
      </div>
    )
  }

  // Items Step (Chat Interface)
  if (step === 'items') {
    return (
      <div className="flex flex-col h-full bg-background">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-card">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setStep('customer')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="font-semibold text-foreground">{customerName}</h1>
              <p className="text-xs text-muted-foreground">
                {lineItems.length} {lineItems.length === 1 ? 'item' : 'items'} - {formatCurrency(total, settings.currencySymbol)}
              </p>
            </div>
          </div>
          <Button onClick={() => setStep('review')} disabled={lineItems.length === 0}>
            Review
          </Button>
        </div>

        {/* Line Items Summary (collapsible) */}
        {lineItems.length > 0 && (
          <div className="border-b bg-card/50">
            <ScrollArea className="max-h-32">
              <div className="p-3 space-y-2">
                {lineItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleRemoveItem(item.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                      <span className="text-foreground">{item.serviceName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6 bg-transparent"
                        onClick={() => handleUpdateQuantity(item.id, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-foreground">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6 bg-transparent"
                        onClick={() => handleUpdateQuantity(item.id, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <span className="w-20 text-right font-medium text-foreground">
                        {formatCurrency(item.total, settings.currencySymbol)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Chat Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {chatMessages.map(message => (
              <div
                key={message.id}
                className={cn(
                  'flex',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-3',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-secondary text-secondary-foreground rounded-bl-md'
                  )}
                >
                  {message.role === 'assistant' && (
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium text-primary">Assistant</span>
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-line">{message.content}</p>
                </div>
              </div>
            ))}
            
            {/* Photos Preview */}
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-2 p-2">
                {photos.map(photo => (
                  <div key={photo.id} className="relative">
                    <img 
                      src={photo.url || "/placeholder.svg"} 
                      alt="Estimate photo"
                      className="w-16 h-16 object-cover rounded-lg"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-5 w-5"
                      onClick={() => setPhotos(prev => prev.filter(p => p.id !== photo.id))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            
            <div ref={chatEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t bg-card p-3 space-y-3">
          {/* Quick Actions */}
          <div className="flex gap-2">
            <Sheet open={showServiceSheet} onOpenChange={setShowServiceSheet}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                  <Package className="h-4 w-4" />
                  Services
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[70vh]">
                <SheetHeader>
                  <SheetTitle>Add Service</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-full py-4">
                  <div className="space-y-4">
                    {/* Category Tabs */}
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      <Badge
                        variant={selectedCategory === null ? 'default' : 'outline'}
                        className="cursor-pointer whitespace-nowrap"
                        onClick={() => setSelectedCategory(null)}
                      >
                        All
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

                    {/* Services List */}
                    <div className="space-y-2">
                      {services
                        .filter(s => s.isActive && (!selectedCategory || s.categoryId === selectedCategory))
                        .map(service => (
                          <Card
                            key={service.id}
                            className="cursor-pointer hover:border-primary/50 transition-all"
                            onClick={() => handleAddService(service)}
                          >
                            <CardContent className="p-3 flex items-center justify-between">
                              <div>
                                <p className="font-medium text-foreground">{service.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatCurrency(service.basePrice, settings.currencySymbol)} / {service.unitLabel}
                                </p>
                              </div>
                              <Button variant="ghost" size="icon">
                                <Plus className="h-5 w-5" />
                              </Button>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotoUpload}
            />
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2 bg-transparent"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="h-4 w-4" />
              Photo
            </Button>
          </div>

          {/* Chat Input */}
          <form onSubmit={handleChatSubmit} className="flex gap-2">
            <Input
              placeholder="Describe the service or ask questions..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    )
  }

  // Review Step
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-3 p-4 border-b bg-card">
        <Button variant="ghost" size="icon" onClick={() => setStep('items')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="font-semibold text-foreground">Review Estimate</h1>
          <p className="text-xs text-muted-foreground">{lineItems.length} items</p>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Customer Info */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{customerName}</p>
                  {customerPhone && <p className="text-sm text-muted-foreground">{customerPhone}</p>}
                  {customerAddress && <p className="text-sm text-muted-foreground">{customerAddress}</p>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="font-semibold text-foreground">Services</h3>
              <div className="space-y-3">
                {lineItems.map(item => (
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
          {photos.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold text-foreground">Photos</h3>
                <div className="flex flex-wrap gap-2">
                  {photos.map(photo => (
                    <img
                      key={photo.id}
                      src={photo.url || "/placeholder.svg"}
                      alt="Work photo"
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
                <span className="text-foreground">{formatCurrency(subtotal, settings.currencySymbol)}</span>
              </div>
              {settings.taxRate > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Taxes ({settings.taxRate}%)</span>
                  <span className="text-foreground">{formatCurrency(taxAmount, settings.currencySymbol)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-2 border-t">
                <span className="text-foreground">Total</span>
                <span className="text-primary">{formatCurrency(total, settings.currencySymbol)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold text-foreground">Notes</h3>
              <Input
                placeholder="Add notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-20"
              />
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-card">
        <Button className="w-full h-12 text-lg gap-2" onClick={handleCreateEstimate}>
          <FileText className="h-5 w-5" />
          Create Estimate
        </Button>
      </div>
    </div>
  )
}
