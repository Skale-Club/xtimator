'use client'

import { useEffect, useState, startTransition } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { saveThemePreference } from '@/lib/actions/theme'

type Theme = 'dark' | 'light' | 'system'

const ITEMS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
]

function persist(next: Theme, setTheme: (v: Theme) => void) {
  // Use startTransition so the <html> class swap + full-page re-paint is
  // treated as a non-urgent update and won't block input responsiveness (INP).
  startTransition(() => {
    setTheme(next)
  })
  // Fire-and-forget server persistence — never blocks the click handler.
  saveThemePreference(next).then((res) => {
    if (!res.ok) toast.error(res.message)
  })
}

/**
 * 3-way theme toggle rendered as a ghost icon button with a dropdown.
 * Primary surface: Topbar (desktop) and MobileHeader (mobile).
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const current = (mounted ? theme : undefined) as Theme | undefined
  const Icon =
    current === 'light' ? Sun : current === 'dark' ? Moon : Monitor

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          className="cursor-pointer"
        >
          <Icon className="h-4 w-4" aria-hidden={!mounted} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="glass-strong border border-[var(--glass-border)] shadow-glass"
      >
        {ITEMS.map(({ value, label, Icon: ItemIcon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() =>
              persist(value, setTheme as (v: Theme) => void)
            }
            aria-checked={current === value}
            role="menuitemradio"
            className="cursor-pointer"
          >
            <ItemIcon className="h-4 w-4 mr-2" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * 3-way theme toggle rendered as an inline vertical radio group.
 * Primary surface: /settings/appearance page.
 */
export function ThemeToggleRadioGroup() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const current = (mounted ? theme : 'system') as Theme

  return (
    <RadioGroup
      value={current}
      onValueChange={(v) =>
        persist(v as Theme, setTheme as (v: Theme) => void)
      }
      className="flex flex-col gap-3"
      aria-label="Theme preference"
    >
      {ITEMS.map(({ value, label, Icon }) => (
        <div key={value} className="flex items-center gap-3">
          <RadioGroupItem value={value} id={`theme-${value}`} />
          <Label
            htmlFor={`theme-${value}`}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Icon className="h-4 w-4" />
            {label}
            {value === 'system' && (
              <span className="text-xs text-muted-foreground ml-1">
                (follow device)
              </span>
            )}
          </Label>
        </div>
      ))}
    </RadioGroup>
  )
}
