// Core Types for Xtimator

export interface User {
  id: string
  email: string
  businessName: string
  businessType: string
  phone?: string
  address?: string
  logo?: string
  createdAt: Date
}

export interface ServiceCategory {
  id: string
  name: string
  description?: string
  icon?: string
  order: number
}

export interface ServiceItem {
  id: string
  categoryId: string
  name: string
  description?: string
  basePrice: number
  unit: 'hour' | 'sqft' | 'sqm' | 'unit' | 'linear_ft' | 'linear_m' | 'job'
  unitLabel: string
  minQuantity?: number
  maxQuantity?: number
  isActive: boolean
  tags?: string[]
}

export interface Customer {
  id: string
  name: string
  email?: string
  phone?: string
  address?: string
  notes?: string
  tags?: string[]
  createdAt: Date
  lastContactedAt?: Date
}

export interface EstimateLineItem {
  id: string
  serviceItemId: string
  serviceName: string
  description?: string
  quantity: number
  unit: string
  unitPrice: number
  total: number
}

export interface EstimatePhoto {
  id: string
  url: string
  caption?: string
  createdAt: Date
}

export interface Estimate {
  id: string
  customerId?: string
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  customerAddress?: string
  title: string
  description?: string
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired'
  lineItems: EstimateLineItem[]
  photos: EstimatePhoto[]
  subtotal: number
  taxRate?: number
  taxAmount?: number
  discountType?: 'percentage' | 'fixed'
  discountValue?: number
  discountAmount?: number
  total: number
  notes?: string
  termsAndConditions?: string
  validUntil?: Date
  createdAt: Date
  updatedAt: Date
  sentAt?: Date
  viewedAt?: Date
  respondedAt?: Date
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  attachments?: {
    type: 'photo' | 'service'
    data: EstimatePhoto | ServiceItem
  }[]
}

export interface AppSettings {
  currency: string
  currencySymbol: string
  taxRate: number
  defaultValidityDays: number
  termsAndConditions: string
  emailSignature?: string
}

export type OnboardingStep = 
  | 'welcome'
  | 'business-info'
  | 'service-selection'
  | 'service-customization'
  | 'complete'
