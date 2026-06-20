'use client'

import { useState, useTransition } from 'react'
import { LogOut, Loader2, LayoutDashboard } from 'lucide-react'
import Link from 'next/link'
import { AuthDialog } from '@/components/landing/auth-dialog'
import { signOut } from '@/lib/actions/auth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface TopNavAuthProps {
  branding: { appName: string; logoUrl: string | null }
  onOpenAuth?: (mode: 'login' | 'signup') => void
  navUser?: { email: string; avatarUrl: string | null } | null
}

export function TopNavAuth({ branding, onOpenAuth, navUser }: TopNavAuthProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [isPending, startTransition] = useTransition()

  if (navUser) {
    const initial = navUser.email.charAt(0).toUpperCase()
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar className="h-8 w-8">
              {navUser.avatarUrl && <AvatarImage src={navUser.avatarUrl} alt={navUser.email} />}
              <AvatarFallback className="text-sm bg-primary text-white font-semibold">{initial}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">{navUser.email}</div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href="/dashboard" className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="flex cursor-pointer items-center gap-2 text-destructive focus:text-destructive"
            disabled={isPending}
            onClick={() => startTransition(() => signOut())}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  function openLogin() {
    if (onOpenAuth) { onOpenAuth('login'); return }
    setMode('login')
    setOpen(true)
  }

  return (
    <>
      <button
        onClick={openLogin}
        className="text-sm font-medium text-white/60 transition-colors hover:text-white"
      >
        Login
      </button>
      <AuthDialog
        branding={branding}
        open={open}
        onClose={() => setOpen(false)}
        initialMode={mode}
      />
    </>
  )
}
