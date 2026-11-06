'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * A 6-digit code shown as six boxes. Underneath is one real input, so the phone's
 * "code from Messages" suggestion, paste and the numeric keyboard all keep working;
 * the boxes only draw what it holds.
 */
export function CodeInput({ id, value, onChange, disabled, length = 6, label = '6-digit code' }: {
  id?: string; value: string; onChange: (value: string) => void; disabled?: boolean; length?: number; label?: string
}) {
  const [focused, setFocused] = useState(false)
  const active = Math.min(value.length, length - 1)
  return <div className="relative mx-auto flex w-full max-w-[22rem] justify-between gap-2">
    {Array.from({ length }, (_, index) => {
      const isActive = focused && index === active
      return <div
        key={index}
        aria-hidden
        className={cn(
          'flex aspect-square w-full max-w-14 items-center justify-center rounded-xl border bg-muted/30 font-mono text-2xl font-semibold transition-colors dark:bg-input/30',
          isActive ? 'border-primary ring-[3px] ring-primary/25' : 'border-input',
          disabled && 'opacity-60',
        )}
      >
        {value[index] ?? (isActive ? <span className="h-6 w-px animate-pulse bg-foreground/70" /> : null)}
      </div>
    })}
    <input
      id={id}
      autoFocus
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={length}
      aria-label={label}
      value={value}
      disabled={disabled}
      required
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={event => onChange(event.target.value)}
      // Keeps the caret at the end, so typing always fills the next box.
      onSelect={event => { const el = event.currentTarget; el.setSelectionRange(el.value.length, el.value.length) }}
      className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 outline-none selection:bg-transparent"
    />
  </div>
}
