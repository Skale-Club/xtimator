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
  /** On mobile, lives inside the bottom-bar "More" overflow menu instead of on the bar. */
  overflow?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'New Xtimate',  href: '/projects/new', icon: FolderPlus, primary: true, exact: true, modal: 'new-project' },
  { label: 'Dashboard',    href: '/dashboard',    icon: LayoutDashboard },
  { label: 'Projects',     href: '/projects',     icon: FolderOpen, overflow: true },
  { label: 'Clients',      href: '/clients',      icon: Users },
  { label: 'Price Book',   href: '/price-book',   icon: BookOpen, overflow: true },
  { label: 'Settings',     href: '/settings',     icon: Settings,   demoHidden: true, overflow: true },
  { label: 'WhatsApp',     href: '/whatsapp',     icon: MessageCircle, demoHidden: true },
]
