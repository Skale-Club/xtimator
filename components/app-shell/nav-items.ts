import { LayoutDashboard, Users, FolderPlus, Settings, type LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  primary?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Clients', href: '/clients', icon: Users },
  { label: 'New Project', href: '/projects/new', icon: FolderPlus, primary: true },
  { label: 'Settings', href: '/settings', icon: Settings },
]
