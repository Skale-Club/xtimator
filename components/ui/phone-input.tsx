'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
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
  enterKeyHint?: React.InputHTMLAttributes<HTMLInputElement>['enterKeyHint']
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
  enterKeyHint,
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
  const [pickerOpen, setPickerOpen] = useState(false)

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
    const raw = e.target.value

    // Paste tolerance. This field holds the NATIONAL number — the dial code
    // lives in the country select. Pasting a full number used to swallow the
    // dial code into the national digits: "+1" selected + "15082058040" pasted
    // truncated to the first 10 digits ("1508205804") and silently rendered
    // the impossible area code "150". Typing is unaffected; both branches
    // below only fire for input that actually carries a country code.

    // "+15082058040" — reparse and switch the select to the matching country.
    if (raw.trimStart().startsWith('+')) {
      const parsed = parseIncoming(raw)
      if (parsed.localNumber) {
        const dial = COUNTRIES.find(c => c.code === parsed.countryCode)?.dial ?? country.dial
        setCountryCode(parsed.countryCode)
        setLocalNumber(parsed.localNumber)
        onChange(`+${dial} ${parsed.localNumber}`)
        return
      }
    }

    let digits = raw.replace(/\D/g, '')
    const max = maxDigits(country.format)

    // "15082058040" — dial code with no '+'. Guarded: only strip when the value
    // is genuinely too long AND dropping the dial makes it fit exactly, so a
    // national number that merely starts with the dial digits (e.g. BR DDD 55)
    // is never touched.
    if (
      digits.length > max &&
      digits.startsWith(country.dial) &&
      digits.length - country.dial.length <= max
    ) {
      digits = digits.slice(country.dial.length)
    }

    digits = digits.slice(0, max)
    const masked = applyMask(digits, country.format)
    setLocalNumber(masked)
    onChange(digits ? `+${country.dial} ${masked}` : '')
  }

  function handleCountryChange(code: string) {
    setPickerOpen(false)
    if (code === countryCode) return
    setCountryCode(code)
    setLocalNumber('')
    onChange('')
  }

  function renderCountry(c: Country) {
    return (
      <CommandItem key={c.code} value={`${c.name} +${c.dial} ${c.code}`} onSelect={() => handleCountryChange(c.code)} className="min-h-10">
        <FlagSvg code={c.code} className="shrink-0 rounded-sm" />
        <span className="truncate">{c.name}</span>
        <span className="ml-auto pl-3 tabular-nums text-muted-foreground">+{c.dial}</span>
        <Check className={`size-4 shrink-0 ${c.code === countryCode ? 'opacity-100' : 'opacity-0'}`} aria-hidden />
      </CommandItem>
    )
  }

  return (
    <div className={`flex gap-2 ${className ?? ''}`}>
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild disabled={disabled}>
          <button
            type="button"
            aria-label={`Country: ${country.name} +${country.dial}`}
            className="flex min-h-[44px] w-[104px] shrink-0 items-center gap-1.5 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-colors hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30"
          >
            <FlagSvg code={countryCode} className="shrink-0 rounded-sm" />
            <span className="tabular-nums text-muted-foreground">+{country.dial}</span>
            <ChevronDown className={`ml-auto size-4 shrink-0 opacity-50 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          collisionPadding={8}
          data-country-picker
          className="w-[min(18rem,calc(100vw-1rem))] p-0"
          onOpenAutoFocus={event => {
            // A touch screen would throw the keyboard up over the list; there the
            // search field is focused only when the person taps it.
            if (window.matchMedia?.('(pointer: coarse)').matches) event.preventDefault()
          }}
        >
          <Command filter={(itemValue, search) => {
            const query = search.trim().toLowerCase().replace(/^\+/, '')
            if (!query) return 1
            return itemValue.toLowerCase().split(' ').some(word => word.replace(/^\+/, '').startsWith(query)) || itemValue.toLowerCase().includes(query) ? 1 : 0
          }}>
            <CommandInput placeholder="Search country or code" className="text-base sm:text-sm" />
            <CommandList className="max-h-[min(18rem,calc(var(--radix-popover-content-available-height,18rem)-3rem))]">
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup heading="Suggested">{preferred.map(renderCountry)}</CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Other countries">{others.map(renderCountry)}</CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Input
        id={id}
        name={name}
        type="tel"
        enterKeyHint={enterKeyHint}
        inputMode="tel"
        autoComplete="tel-national"
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder ?? country.format.replace(/#/g, '0')}
        className="min-h-[44px] flex-1"
        value={localNumber}
        onChange={handleNumberChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            onEnter?.()
          }
        }}
      />
    </div>
  )
}
