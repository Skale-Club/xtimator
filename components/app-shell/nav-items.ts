import { LayoutDashboard, Users, FolderPlus, FolderOpen, BookOpen, Trash2, Settings, type LucideIcon } from 'lucide-react'

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
  /** On mobile, lives in the top-right avatar (user) dropdown instead of the bottom bar. */
  userMenu?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'New Xtimate',  href: '/projects/new', icon: FolderPlus, primary: true, exact: true, modal: 'new-project' },
  { label: 'Dashboard',    href: '/dashboard',    icon: LayoutDashboard },
  { label: 'Projects',     href: '/projects',     icon: FolderOpen },
  { label: 'Clients',      href: '/clients',      icon: Users },
  { label: 'Price Book',   href: '/price-book',   icon: BookOpen },
  { label: 'Trash',        href: '/trash',        icon: Trash2,     demoHidden: true, userMenu: true },
  // Phase 181: Settings IS reachable in demo (filtered to Company/Team/Notifications
  // by settings-nav.tsx). No `demoHidden` here — it would contradict that, and the
  // account-menu entry points render it for demo sessions on purpose.
  { label: 'Settings',     href: '/settings',     icon: Settings,   userMenu: true },
]
