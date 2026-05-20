'use client'

import { useState } from 'react'
import { Bell } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useNotifications } from './use-notifications'
import { NotificationPanel } from './notification-panel'

interface NotificationBellProps {
  companyId: string
  userId: string
}

/**
 * Topbar bell trigger + Popover container.
 *
 *  - Unread badge: red gradient pill (hidden at 0, "9+" when >9)
 *  - 400px panel (glass-strong) anchored to the right
 *  - Clicking an item closes the popover via NotificationPanel.onItemClick
 */
export function NotificationBell({ companyId, userId }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const state = useNotifications({ companyId, userId })

  const badge = state.unreadCount === 0
    ? null
    : state.unreadCount > 9
      ? '9+'
      : String(state.unreadCount)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          data-testid="notification-bell"
          data-unread-count={state.unreadCount}
          className="relative inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="h-4 w-4" />
          {badge && (
            <span
              data-testid="notification-bell-badge"
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--gradient-danger,theme(colors.destructive.DEFAULT))] bg-destructive text-white text-[10px] font-semibold leading-none flex items-center justify-center pointer-events-none"
            >
              {badge}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[400px] p-0 glass-strong border border-[var(--glass-border)] shadow-glass"
      >
        <NotificationPanel
          state={state}
          onItemClick={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}
