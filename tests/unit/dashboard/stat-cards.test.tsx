import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatCards } from '@/components/dashboard/stat-cards'
import { StatCard } from '@/components/dashboard/stat-card'
import { FolderOpen } from 'lucide-react'
import type { DashboardStats } from '@/lib/queries/dashboard'

describe('StatCard', () => {
  it('renders label and value correctly', () => {
    render(<StatCard icon={FolderOpen} label="Test Label" value={42} />)
    expect(screen.getByText('Test Label')).toBeDefined()
    expect(screen.getByText('42')).toBeDefined()
  })

  it('renders string value', () => {
    render(<StatCard icon={FolderOpen} label="Revenue" value="$1,500" />)
    expect(screen.getByText('$1,500')).toBeDefined()
  })
})

describe('StatCards', () => {
  const mockStats: DashboardStats = {
    totalProjects: 12,
    pendingEstimates: 5,
    acceptedEstimates: 7,
    totalRevenue: 1500,
  }

  it('renders 4 stat cards', () => {
    render(<StatCards stats={mockStats} />)
    expect(screen.getByText('Total Projects')).toBeDefined()
    expect(screen.getByText('Pending Estimates')).toBeDefined()
    expect(screen.getByText('Accepted')).toBeDefined()
    expect(screen.getByText('Total Revenue')).toBeDefined()
  })

  it('displays correct values', () => {
    render(<StatCards stats={mockStats} />)
    expect(screen.getByText('12')).toBeDefined()
    expect(screen.getByText('5')).toBeDefined()
    expect(screen.getByText('7')).toBeDefined()
  })

  it('formats Total Revenue as USD', () => {
    render(<StatCards stats={mockStats} />)
    expect(screen.getByText('$1,500')).toBeDefined()
  })

  it('renders zero stats without errors', () => {
    const zeroStats: DashboardStats = {
      totalProjects: 0,
      pendingEstimates: 0,
      acceptedEstimates: 0,
      totalRevenue: 0,
    }
    render(<StatCards stats={zeroStats} />)
    expect(screen.getByText('$0')).toBeDefined()
    // All zeros should render
    const zeros = screen.getAllByText('0')
    expect(zeros.length).toBe(3) // totalProjects, pending, accepted
  })
})
