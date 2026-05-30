import { LayoutDashboard, Users, FolderPlus, FolderOpen, BookOpen, Settings, MessageCircle, type LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  primary?: boolean
  exact?: boolean
  /** When set, clicking the item opens a modal via `?modal=<value>` instead of navigating. */
  modal?: string
  /** Hidden from the read-only public demo (sensitive / non-functional there). */
  demoHidden?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'New Project', href: '/projects/new', icon: FolderPlus, primary: true, exact: true, modal: 'new-project' },
  { label: 'Dashboard',   href: '/dashboard',    icon: LayoutDashboard },
  { label: 'Projects',    href: '/projects',     icon: FolderOpen },
  { label: 'Clients',     href: '/clients',      icon: Users },
  { label: 'Price Book',  href: '/price-book', icon: BookOpen },
  { label: 'Settings',    href: '/settings',     icon: Settings, demoHidden: true },
  { label: 'WhatsApp',    href: '/whatsapp',     icon: MessageCircle, demoHidden: true },
]
