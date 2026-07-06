'use client'

import { useEffect, useState } from 'react'
import type React from 'react'
import {
  IconArgentina,
  IconAustralia,
  IconBrazil,
  IconCanada,
  IconChile,
  IconColombia,
  IconFrance,
  IconGermany,
  IconIndia,
  IconItaly,
  IconJapan,
  IconMexico,
  IconNetherlands,
  IconPortugal,
  IconSpain,
  IconUnitedKingdom,
  IconUnitedStates,
  IconUruguay,
} from 'nucleo-flags'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { COUNTRIES, applyMask, maxDigits, type Country } from '@/lib/phone/countries'

type FlagComponent = React.ComponentType<React.SVGProps<SVGSVGElement> & { size?: number | string }>

const FLAG_MAP: Record<string, FlagComponent> = {
  AR: IconArgentina,
  AU: IconAustralia,
  BR: IconBrazil,
  CA: IconCanada,
  CL: IconChile,
  CO: IconColombia,
  DE: IconGermany,
  ES: IconSpain,
  FR: IconFrance,
  GB: IconUnitedKingdom,
  IN: IconIndia,
  IT: IconItaly,
  JP: IconJapan,
  MX: IconMexico,
  NL: IconNetherlands,
  PT: IconPortugal,
  US: IconUnitedStates,
  UY: IconUruguay,
}

function FlagSvg({ code, className }: { code: string; className?: string }) {
  const Comp = FLAG_MAP[code] ?? IconUnitedStates
  return <Comp className={className} size={20} />
}

const preferred = COUNTRIES.filter(c => c.preferred)
const others = COUNTRIES.filter(c => !c.preferred)

// Pre-sorted dial codes (longest-first) for prefix matching.
const SORTED_DIALS = [...new Set(COUNTRIES.map(c => c.dial))].sort(
  (a, b) => b.length - a.length,
)

function findCountryByDial(dial: string): Country | undefined {
  // First match wins — US precedes CA in COUNTRIES so US wins for dial '1'.
  return COUNTRIES.find(c => c.dial === dial)
}

interface ParseResult {
  countryCode: string
  localNumber: string
}

/**
 * Parse an incoming phone value into { countryCode, localNumber } for UI state.
 *
 * Accepts:
 *   - '+1 (508) 301-3010' (formatted with dial)
 *   - '+15083013010'      (E.164)
 *   - '5083013010'        (10-digit US bare)
 *   - ''                  (empty) or whitespace
 *   - anything else       (returns US/empty fallback without clobbering parent)
 */
function parseIncoming(value: string): ParseResult {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return { countryCode: 'US', localNumber: '' }

  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '')
    if (!digits) return { countryCode: 'US', localNumber: '' }

    for (const dial of SORTED_DIALS) {
      if (digits.startsWith(dial)) {
        const country = findCountryByDial(dial)
        if (!country) continue
        const remaining = digits.slice(dial.length).slice(0, maxDigits(country.format))
        return {
          countryCode: country.code,
          localNumber: applyMask(remaining, country.format),
        }
      }
    }
    // No dial match — fallback to US/empty; parent value preserved by skipping synthetic onChange.
    return { countryCode: 'US', localNumber: '' }
  }

  // No leading '+': if exactly 10 digits, assume US.
  const bareDigits = trimmed.replace(/\D/g, '')
  if (bareDigits.length === 10) {
    const us = COUNTRIES.find(c => c.code === 'US')!
    return {
      countryCode: 'US',
      localNumber: applyMask(bareDigits, us.format),
    }
  }

  return { countryCode: 'US', localNumber: '' }
}

export interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  onEnter?: () => void
  id?: string
  name?: string
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  className?: string
}

export function PhoneInput({
  value,
  onChange,
  onEnter,
  id,
  name,
  placeholder,
  disabled,
  autoFocus,
  className,
}: PhoneInputProps) {
  const initial = parseIncoming(value ?? '')
  const [countryCode, setCountryCode] = useState(initial.countryCode)
  const [localNumber, setLocalNumber] = useState(initial.localNumber)

  const country = COUNTRIES.find(c => c.code === countryCode) ?? COUNTRIES[0]

  // Controlled-component sync: re-parse from `value` whenever it changes externally
  // and doesn't match what our internal state would emit. Prevents loops by comparing
  // against the canonical `+{dial} {masked}` emission shape.
  useEffect(() => {
    const internalEmit = localNumber ? `+${country.dial} ${localNumber}` : ''
    if ((value ?? '') === internalEmit) return

    const parsed = parseIncoming(value ?? '')
    setCountryCode(parsed.countryCode)
    setLocalNumber(parsed.localNumber)
    // We deliberately don't depend on `country.dial` / `localNumber` to avoid feedback —
    // they're derived state that recomputes naturally on the next render after setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function handleNumberChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, maxDigits(country.format))
    const masked = applyMask(digits, country.format)
    setLocalNumber(masked)
    onChange(digits ? `+${country.dial} ${masked}` : '')
  }

  function handleCountryChange(code: string) {
    setCountryCode(code)
    setLocalNumber('')
    onChange('')
  }

  return (
    <div className={`flex gap-2 ${className ?? ''}`}>
      <Select value={countryCode} onValueChange={handleCountryChange} disabled={disabled}>
        <SelectTrigger className="w-[100px] shrink-0 min-h-[44px] gap-1.5">
          <span className="flex items-center gap-1.5 text-sm">
            <FlagSvg code={countryCode} className="shrink-0 rounded-sm" />
            <span className="text-muted-foreground">+{country.dial}</span>
          </span>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectGroup>
            <SelectLabel>Suggested</SelectLabel>
            {preferred.map(c => (
              <SelectItem key={c.code} value={c.code}>
                <span className="flex items-center gap-2 min-w-0">
                  <FlagSvg code={c.code} className="shrink-0 rounded-sm" />
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto pl-3 text-muted-foreground shrink-0">+{c.dial}</span>
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Other countries</SelectLabel>
            {others.map(c => (
              <SelectItem key={c.code} value={c.code}>
                <span className="flex items-center gap-2 min-w-0">
                  <FlagSvg code={c.code} className="shrink-0 rounded-sm" />
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto pl-3 text-muted-foreground shrink-0">+{c.dial}</span>
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Input
        id={id}
        name={name}
        type="tel"
        autoComplete="tel"
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder ?? country.format.replace(/#/g, '0')}
        className="min-h-[44px] flex-1"
        value={localNumber}
        onChange={handleNumberChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onEnter?.()
          }
        }}
      />
    </div>
  )
}
