'use client'

import { useEffect, useState, startTransition } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { toast } from 'sonner'
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
  startTransition(() => {
    setTheme(next)
  })
  saveThemePreference(next).then((res) => {
    if (!res.ok) toast.error(res.message)
  })
}

/**
 * One-click light↔dark toggle.
 * Primary surface: Topbar (desktop) and MobileHeader (mobile).
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const current = (mounted ? theme : 'dark') as Theme
  const Icon = current === 'light' ? Sun : Moon

  function toggle() {
    const next: Theme = current === 'light' ? 'dark' : 'light'
    persist(next, setTheme as (v: Theme) => void)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label="Toggle theme"
      className="cursor-pointer"
    >
      <Icon className="h-4 w-4" aria-hidden={!mounted} />
    </Button>
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
