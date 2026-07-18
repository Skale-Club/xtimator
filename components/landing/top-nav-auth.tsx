'use client'

import { useEffect, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { LogOut, Loader2, LayoutDashboard } from 'lucide-react'
import Link from 'next/link'
import { signOut } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'

const AuthDialog = dynamic(() =>
  import('@/components/landing/auth-dialog').then((module) => module.AuthDialog),
)

interface TopNavAuthProps {
  branding: { appName: string; logoUrl: string | null }
  onOpenAuth?: (mode: 'login' | 'signup') => void
  navUser?: { email: string; avatarUrl: string | null } | null
  /** Signup CTA label — same DB-driven value as the hero CTA. */
  ctaLabel?: string
}

export function TopNavAuth({ branding, onOpenAuth, navUser, ctaLabel = 'Start' }: TopNavAuthProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [isPending, startTransition] = useTransition()
  const [resolvedUser, setResolvedUser] = useState(navUser)

  useEffect(() => {
    const supabase = createClient()
    let active = true

    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return
      const user = data.user
      setResolvedUser(
        user
          ? {
              email: user.email ?? '',
              avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
            }
          : null,
      )
    })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      setResolvedUser(
        user
          ? {
              email: user.email ?? '',
              avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
            }
          : null,
      )
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  if (resolvedUser) {
    const initial = resolvedUser.email.charAt(0).toUpperCase()
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar className="h-8 w-8">
              {resolvedUser.avatarUrl && <AvatarImage src={resolvedUser.avatarUrl} alt={resolvedUser.email} />}
              <AvatarFallback className="text-sm bg-primary text-white font-semibold">{initial}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">{resolvedUser.email}</div>
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

  function openSignup() {
    if (onOpenAuth) { onOpenAuth('signup'); return }
    setMode('signup')
    setOpen(true)
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <button
          onClick={openLogin}
          className="text-sm font-medium text-white/60 transition-colors hover:text-white"
        >
          Login
        </button>
        <Button variant="primary" size="sm" className="px-4" onClick={openSignup}>
          {ctaLabel}
        </Button>
      </div>
      {open && (
        <AuthDialog
          branding={branding}
          open
          onClose={() => setOpen(false)}
          initialMode={mode}
        />
      )}
    </>
  )
}
