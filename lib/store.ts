'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  User,
  ServiceCategory,
  ServiceItem,
  Customer,
  Estimate,
  AppSettings,
  OnboardingStep,
} from './types'

interface AppState {
  // Auth & User
  user: User | null
  setUser: (user: User | null) => void
  
  // Onboarding
  onboardingStep: OnboardingStep
  onboardingComplete: boolean
  setOnboardingStep: (step: OnboardingStep) => void
  completeOnboarding: () => void
  
  // Service Catalog
  categories: ServiceCategory[]
  services: ServiceItem[]
  setCategories: (categories: ServiceCategory[]) => void
  addCategory: (category: ServiceCategory) => void
  updateCategory: (id: string, updates: Partial<ServiceCategory>) => void
  deleteCategory: (id: string) => void
  setServices: (services: ServiceItem[]) => void
  addService: (service: ServiceItem) => void
  updateService: (id: string, updates: Partial<ServiceItem>) => void
  deleteService: (id: string) => void
  
  // Customers
  customers: Customer[]
  setCustomers: (customers: Customer[]) => void
  addCustomer: (customer: Customer) => void
  updateCustomer: (id: string, updates: Partial<Customer>) => void
  deleteCustomer: (id: string) => void
  
  // Estimates
  estimates: Estimate[]
  currentEstimate: Estimate | null
  setEstimates: (estimates: Estimate[]) => void
  addEstimate: (estimate: Estimate) => void
  updateEstimate: (id: string, updates: Partial<Estimate>) => void
  deleteEstimate: (id: string) => void
  setCurrentEstimate: (estimate: Estimate | null) => void
  
  // Settings
  settings: AppSettings
  setSettings: (settings: AppSettings) => void
  updateSettings: (updates: Partial<AppSettings>) => void
  
  // Remove helpers
  removeCustomer: (id: string) => void
  removeService: (id: string) => void
  
  // Reset
  resetStore: () => void
}

const defaultSettings: AppSettings = {
  currency: 'BRL',
  currencySymbol: 'R$',
  taxRate: 0,
  defaultValidityDays: 30,
  termsAndConditions: 'Orçamento válido por 30 dias. Pagamento em até 3x sem juros.',
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Auth & User
      user: null,
      setUser: (user) => set({ user }),
      
      // Onboarding
      onboardingStep: 'welcome',
      onboardingComplete: false,
      setOnboardingStep: (step) => set({ onboardingStep: step }),
      completeOnboarding: () => set({ onboardingComplete: true, onboardingStep: 'complete' }),
      
      // Service Catalog
      categories: [],
      services: [],
      setCategories: (categories) => set({ categories }),
      addCategory: (category) => set((state) => ({ 
        categories: [...state.categories, category] 
      })),
      updateCategory: (id, updates) => set((state) => ({
        categories: state.categories.map((c) => 
          c.id === id ? { ...c, ...updates } : c
        ),
      })),
      deleteCategory: (id) => set((state) => ({
        categories: state.categories.filter((c) => c.id !== id),
        services: state.services.filter((s) => s.categoryId !== id),
      })),
      setServices: (services) => set({ services }),
      addService: (service) => set((state) => ({ 
        services: [...state.services, service] 
      })),
      updateService: (id, updates) => set((state) => ({
        services: state.services.map((s) => 
          s.id === id ? { ...s, ...updates } : s
        ),
      })),
      deleteService: (id) => set((state) => ({
        services: state.services.filter((s) => s.id !== id),
      })),
      
      // Customers
      customers: [],
      setCustomers: (customers) => set({ customers }),
      addCustomer: (customer) => set((state) => ({ 
        customers: [...state.customers, customer] 
      })),
      updateCustomer: (id, updates) => set((state) => ({
        customers: state.customers.map((c) => 
          c.id === id ? { ...c, ...updates } : c
        ),
      })),
      deleteCustomer: (id) => set((state) => ({
        customers: state.customers.filter((c) => c.id !== id),
      })),
      
      // Estimates
      estimates: [],
      currentEstimate: null,
      setEstimates: (estimates) => set({ estimates }),
      addEstimate: (estimate) => set((state) => ({ 
        estimates: [...state.estimates, estimate] 
      })),
      updateEstimate: (id, updates) => set((state) => ({
        estimates: state.estimates.map((e) => 
          e.id === id ? { ...e, ...updates } : e
        ),
      })),
      deleteEstimate: (id) => set((state) => ({
        estimates: state.estimates.filter((e) => e.id !== id),
      })),
      setCurrentEstimate: (estimate) => set({ currentEstimate: estimate }),
      
      // Settings
      settings: defaultSettings,
      setSettings: (settings) => set({ settings }),
      updateSettings: (updates) => set((state) => ({
        settings: { ...state.settings, ...updates },
      })),
      
      // Remove helpers
      removeCustomer: (id) => set((state) => ({
        customers: state.customers.filter((c) => c.id !== id),
      })),
      removeService: (id) => set((state) => ({
        services: state.services.filter((s) => s.id !== id),
      })),
      
      // Reset
      resetStore: () => set({
        user: null,
        onboardingStep: 'welcome',
        onboardingComplete: false,
        categories: [],
        services: [],
        customers: [],
        estimates: [],
        currentEstimate: null,
        settings: defaultSettings,
      }),
    }),
    {
      name: 'xtimator-storage',
      partialize: (state) => ({
        user: state.user,
        onboardingComplete: state.onboardingComplete,
        onboardingStep: state.onboardingStep,
        categories: state.categories,
        services: state.services,
        customers: state.customers,
        estimates: state.estimates,
        settings: state.settings,
      }),
    }
  )
)

// Helper to generate unique IDs
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}
