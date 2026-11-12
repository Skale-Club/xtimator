import { LayoutDashboard, Users, FolderPlus, FolderOpen, BookOpen, Settings, type LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  /** Shorter label for the mobile bottom bar, where each slot is ~64px wide. */
  shortLabel?: string
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
  /** Fully prefetch read-only list data, rather than only its loading shell. */
  prefetch?: true
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'New Xtimate',  shortLabel: 'New', href: '/projects/new', icon: FolderPlus, primary: true, exact: true, modal: 'new-project' },
  { label: 'Dashboard',    href: '/dashboard',    icon: LayoutDashboard },
  { label: 'Projects',     href: '/projects',     icon: FolderOpen, prefetch: true },
  { label: 'Clients',      href: '/clients',      icon: Users, prefetch: true },
  { label: 'Price Book',   shortLabel: 'Prices', href: '/price-book', icon: BookOpen },
  // Phase 181: Settings IS reachable in demo (filtered to Company/Team/Notifications
  // by settings-nav.tsx). No `demoHidden` here — it would contradict that, and the
  // account-menu entry points render it for demo sessions on purpose.
  { label: 'Settings',     href: '/settings',     icon: Settings,   userMenu: true },
]
