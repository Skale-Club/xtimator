'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { LogOut, Loader2 } from 'lucide-react'
import { signOut } from '@/lib/actions/auth'
import { useTranslation } from '@/lib/i18n/use-translation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { NAV_ITEMS } from './nav-items'

interface NavUserDropdownProps {
  email: string
  avatarUrl: string | null
  isDemo?: boolean
}

export function NavUserDropdown({ email, avatarUrl, isDemo }: NavUserDropdownProps) {
  const [isPending, startTransition] = useTransition()
  const { t } = useTranslation()
  const initial = email.charAt(0).toUpperCase()

  // quick-260724 (SEED-050): Trash + Settings moved off the mobile bottom bar
  // into this dropdown (items flagged `userMenu`), placed between the email row
  // and Sign Out. demoHidden items stay hidden in the read-only demo.
  const menuItems = NAV_ITEMS.filter((item) => item.userMenu && !(isDemo && item.demoHidden))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer">
          <Avatar className="h-8 w-8">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={email} />}
            <AvatarFallback className="text-sm bg-primary text-white font-semibold">{initial}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 glass-strong border border-[var(--glass-border)] shadow-glass">
        <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">{email}</div>
        <DropdownMenuSeparator />
        {menuItems.map((item) => {
          const Icon = item.icon
          return (
            <DropdownMenuItem key={item.href} asChild className="cursor-pointer gap-2">
              <Link href={item.href}>
                <Icon className="h-4 w-4" />
                {t(item.label)}
              </Link>
            </DropdownMenuItem>
          )
        })}
        {menuItems.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem
          className="flex cursor-pointer items-center gap-2 text-[hsl(var(--danger))] focus:text-[hsl(var(--danger))]"
          disabled={isPending}
          onClick={() => startTransition(() => signOut())}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          {t('Sign Out')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
