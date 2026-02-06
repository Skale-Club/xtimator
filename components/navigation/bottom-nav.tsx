'use client'

import React from "react"

import { cn } from '@/lib/utils'
import type { AppView } from '@/components/main-app'
import { 
  LayoutDashboard, 
  FileText, 
  Users, 
  Layers, 
  Settings,
  Plus
} from 'lucide-react'

interface BottomNavProps {
  currentView: string
  onViewChange: (view: string) => void
  onNewEstimate: () => void
}

const navItems: { view: AppView; icon: React.ReactNode; label: string }[] = [
  { view: 'dashboard', icon: <LayoutDashboard className="h-5 w-5" />, label: 'Início' },
  { view: 'estimates', icon: <FileText className="h-5 w-5" />, label: 'Orçamentos' },
  { view: 'customers', icon: <Users className="h-5 w-5" />, label: 'Clientes' },
  { view: 'services', icon: <Layers className="h-5 w-5" />, label: 'Serviços' },
  { view: 'settings', icon: <Settings className="h-5 w-5" />, label: 'Config' },
]

export function BottomNav({ currentView, onViewChange, onNewEstimate }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-2">
        {navItems.slice(0, 2).map((item) => (
          <button
            key={item.view}
            onClick={() => onViewChange(item.view)}
            className={cn(
              'flex flex-col items-center justify-center min-w-[64px] min-h-[48px] rounded-lg transition-colors',
              currentView === item.view
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {item.icon}
            <span className="text-xs mt-1">{item.label}</span>
          </button>
        ))}

        <button
          onClick={onNewEstimate}
          className="flex items-center justify-center w-14 h-14 -mt-6 bg-primary text-primary-foreground rounded-full shadow-lg active:scale-95 transition-transform"
        >
          <Plus className="h-7 w-7" />
        </button>

        {navItems.slice(2).map((item) => (
          <button
            key={item.view}
            onClick={() => onViewChange(item.view)}
            className={cn(
              'flex flex-col items-center justify-center min-w-[64px] min-h-[48px] rounded-lg transition-colors',
              currentView === item.view
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {item.icon}
            <span className="text-xs mt-1">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
