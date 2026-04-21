'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { Settings2, Palette, Users, LogOut, Loader2 } from 'lucide-react'
import { signOut } from '@/lib/actions/auth'

const NAV_ITEMS = [
  { href: '/admin/integrations', label: 'Integrations', Icon: Settings2 },
  { href: '/admin/branding', label: 'Branding', Icon: Palette },
  { href: '/admin/admins', label: 'Admins', Icon: Users },
] as const

function LogoFallbackSvg() {
  // Mirrors the inline logomark from components/auth/auth-card.tsx.
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="8" fill="hsl(240 5.9% 10%)" />
      <path
        d="M12 28L20 12L28 28"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 23H25"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

interface AdminNavProps {
  appName: string
  logoUrl: string | null
  adminEmail: string
}

export function AdminNav({ appName, logoUrl, adminEmail }: AdminNavProps) {
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  return (
    <nav
      aria-label="Platform admin navigation"
      className="w-[240px] flex-shrink-0 border-r border-border bg-card flex flex-col"
    >
      <div className="px-4 pt-6 pb-6 flex items-center gap-2">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt=""
            width={40}
            height={40}
            aria-hidden="true"
          />
        ) : (
          <LogoFallbackSvg />
        )}
        <span className="font-semibold text-sm">{appName} Admin</span>
      </div>
      <ul className="flex-1 flex flex-col gap-1 px-2">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const isActive =
            pathname === href || pathname.startsWith(href + '/')
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={[
                  'flex items-center gap-3 h-[44px] px-4 rounded-md text-sm',
                  isActive
                    ? 'bg-primary/12 border-l-2 border-primary text-foreground'
                    : 'hover:bg-accent text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                <Icon size={16} /> {label}
              </Link>
            </li>
          )
        })}
      </ul>
      <div className="mt-auto border-t border-border px-4 py-4 text-xs">
        <div className="text-muted-foreground truncate">{adminEmail}</div>
        <button
          type="button"
          onClick={() => startTransition(() => signOut())}
          disabled={isPending}
          aria-label="Sign out"
          className="flex items-center gap-2 mt-2 hover:text-foreground text-muted-foreground disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <LogOut size={14} />
          )}
          Sign out
        </button>
      </div>
    </nav>
  )
}
