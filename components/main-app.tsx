'use client'

import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import type { Estimate } from '@/lib/types'
import { BottomNav } from '@/components/navigation/bottom-nav'
import { DashboardView } from '@/components/views/dashboard-view'
import { EstimatesView } from '@/components/views/estimates-view'
import { CustomersView } from '@/components/views/customers-view'
import { ServicesView } from '@/components/views/services-view'
import { SettingsView } from '@/components/views/settings-view'
import { EstimateCreatorView } from '@/components/views/estimate-creator-view'
import { EstimateDetailView } from '@/components/views/estimate-detail-view'

export type AppView = 'dashboard' | 'estimates' | 'customers' | 'services' | 'settings' | 'new-estimate' | 'estimate-detail'

export function MainApp() {
  const [currentView, setCurrentView] = useState<AppView>('dashboard')
  const [selectedEstimate, setSelectedEstimate] = useState<Estimate | null>(null)

  const handleNavigate = (view: string) => {
    if (view === 'new-estimate') {
      setCurrentView('new-estimate')
    } else if (view.startsWith('estimate-')) {
      const estimateId = view.replace('estimate-', '')
      const { estimates } = useAppStore.getState()
      const estimate = estimates.find(e => e.id === estimateId)
      if (estimate) {
        setSelectedEstimate(estimate)
        setCurrentView('estimate-detail')
      }
    } else {
      setCurrentView(view as AppView)
    }
  }

  const handleSelectEstimate = (estimate: Estimate) => {
    setSelectedEstimate(estimate)
    setCurrentView('estimate-detail')
  }

  const handleEstimateComplete = (estimate: Estimate) => {
    setSelectedEstimate(estimate)
    setCurrentView('estimate-detail')
  }

  // Full screen views (no bottom nav)
  if (currentView === 'new-estimate') {
    return (
      <div className="min-h-screen bg-background">
        <EstimateCreatorView
          onBack={() => setCurrentView('dashboard')}
          onComplete={handleEstimateComplete}
        />
      </div>
    )
  }

  if (currentView === 'estimate-detail' && selectedEstimate) {
    return (
      <div className="min-h-screen bg-background">
        <EstimateDetailView
          estimate={selectedEstimate}
          onBack={() => {
            setSelectedEstimate(null)
            setCurrentView('estimates')
          }}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {currentView === 'dashboard' && (
        <DashboardView onNavigate={handleNavigate} />
      )}
      {currentView === 'estimates' && (
        <EstimatesView 
          onNavigate={handleNavigate}
          onSelectEstimate={handleSelectEstimate}
        />
      )}
      {currentView === 'customers' && (
        <CustomersView onNavigate={handleNavigate} />
      )}
      {currentView === 'services' && (
        <ServicesView onNavigate={handleNavigate} />
      )}
      {currentView === 'settings' && <SettingsView />}

      <BottomNav 
        currentView={currentView} 
        onViewChange={(view) => setCurrentView(view as AppView)}
        onNewEstimate={() => setCurrentView('new-estimate')}
      />
    </div>
  )
}
