'use client'

import { useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { toast } from 'sonner'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { saveThemePreference } from '@/lib/actions/theme'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'

type Theme = 'dark' | 'light' | 'system'

const ITEMS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
]

const subscribeToHydration = () => () => {}
const clientHydrationSnapshot = () => true
const serverHydrationSnapshot = () => false

function useHydrated() {
  // Match the server markup during hydration, then read the browser's theme.
  return useSyncExternalStore(
    subscribeToHydration,
    clientHydrationSnapshot,
    serverHydrationSnapshot,
  )
}

function persist(next: Theme, setTheme: (v: Theme) => void) {
  // Keep the visual update urgent: a transition here would be batched with
  // Next's server-action transition and wait for persistence + the RSC refresh.
  setTheme(next)
  saveThemePreference(next).then((res) => {
    if (!res.ok) toast.error(res.message)
  })
}

/**
 * One-click light↔dark toggle.
 * Primary surface: Topbar (desktop). On mobile the theme lives in the
 * account menu (ThemeSegmentedPicker inside MobileAccountMenu).
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const mounted = useHydrated()

  const current = (mounted ? theme : 'dark') as Theme
  const isLight = current === 'light'
  const Icon = isLight ? Sun : Moon

  function toggle() {
    const next: Theme = isLight ? 'dark' : 'light'
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
  const mounted = useHydrated()
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

/**
 * Compact three-icon picker (light / dark / system) for the mobile account
 * menu. Plain buttons, not menu items, so a tap changes the theme without
 * closing the dropdown. Before hydration nothing is highlighted.
 */
export function ThemeSegmentedPicker() {
  const { theme, setTheme } = useTheme()
  const mounted = useHydrated()
  const { t } = useTranslation()
  const current = mounted ? (theme as Theme) : null

  return (
    <div
      role="radiogroup"
      aria-label={t('Theme')}
      data-testid="theme-picker"
      className="inline-flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5"
    >
      {ITEMS.map(({ value, label, Icon }) => {
        const selected = current === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(label)}
            onClick={() => persist(value, setTheme as (v: Theme) => void)}
            className={cn(
              'inline-flex h-7 w-8 cursor-pointer items-center justify-center rounded-[calc(var(--radius-md)-2px)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        )
      })}
    </div>
  )
}
