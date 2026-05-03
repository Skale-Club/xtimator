'use client'

import { useState } from 'react'
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

const COUNTRIES = [
  { code: 'US', name: 'United States', dial: '1',   flag: '🇺🇸', format: '(###) ###-####',   preferred: true },
  { code: 'BR', name: 'Brazil',         dial: '55',  flag: '🇧🇷', format: '(##) #####-####',  preferred: true },
  { code: 'CA', name: 'Canada',         dial: '1',   flag: '🇨🇦', format: '(###) ###-####',   preferred: true },
  { code: 'MX', name: 'Mexico',         dial: '52',  flag: '🇲🇽', format: '(##) ####-####',   preferred: false },
  { code: 'GB', name: 'United Kingdom', dial: '44',  flag: '🇬🇧', format: '#### ######',       preferred: false },
  { code: 'DE', name: 'Germany',        dial: '49',  flag: '🇩🇪', format: '#### ########',     preferred: false },
  { code: 'FR', name: 'France',         dial: '33',  flag: '🇫🇷', format: '## ## ## ## ##',    preferred: false },
  { code: 'AU', name: 'Australia',      dial: '61',  flag: '🇦🇺', format: '#### ### ###',      preferred: false },
  { code: 'ES', name: 'Spain',          dial: '34',  flag: '🇪🇸', format: '### ### ###',       preferred: false },
  { code: 'IT', name: 'Italy',          dial: '39',  flag: '🇮🇹', format: '### #######',       preferred: false },
  { code: 'JP', name: 'Japan',          dial: '81',  flag: '🇯🇵', format: '##-####-####',      preferred: false },
  { code: 'IN', name: 'India',          dial: '91',  flag: '🇮🇳', format: '#####-#####',       preferred: false },
  { code: 'AR', name: 'Argentina',      dial: '54',  flag: '🇦🇷', format: '(##) ####-####',    preferred: false },
  { code: 'CL', name: 'Chile',          dial: '56',  flag: '🇨🇱', format: '# ####-####',       preferred: false },
  { code: 'CO', name: 'Colombia',       dial: '57',  flag: '🇨🇴', format: '### ### ####',      preferred: false },
  { code: 'PT', name: 'Portugal',       dial: '351', flag: '🇵🇹', format: '### ### ###',       preferred: false },
  { code: 'NL', name: 'Netherlands',    dial: '31',  flag: '🇳🇱', format: '## ### ####',       preferred: false },
  { code: 'UY', name: 'Uruguay',        dial: '598', flag: '🇺🇾', format: '# ### ####',        preferred: false },
]

const preferred = COUNTRIES.filter(c => c.preferred)
const others = COUNTRIES.filter(c => !c.preferred)

function applyMask(digits: string, format: string): string {
  let result = ''
  let di = 0
  for (const char of format) {
    if (di >= digits.length) break
    result += char === '#' ? digits[di++] : char
  }
  return result
}

function maxDigits(format: string): number {
  return format.split('').filter(c => c === '#').length
}

interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  onEnter?: () => void
}

export function PhoneInput({ onChange, onEnter }: PhoneInputProps) {
  const [countryCode, setCountryCode] = useState('US')
  const [localNumber, setLocalNumber] = useState('')

  const country = COUNTRIES.find(c => c.code === countryCode) ?? COUNTRIES[0]

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
    <div className="flex gap-2">
      <Select value={countryCode} onValueChange={handleCountryChange}>
        <SelectTrigger className="w-[108px] shrink-0 gap-1.5">
          <span className="flex items-center gap-1.5 text-sm">
            <span>{country.flag}</span>
            <span className="text-muted-foreground">+{country.dial}</span>
          </span>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectGroup>
            <SelectLabel>Suggested</SelectLabel>
            {preferred.map(c => (
              <SelectItem key={c.code} value={c.code}>
                <span className="flex items-center gap-2 min-w-0">
                  <span>{c.flag}</span>
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
                  <span>{c.flag}</span>
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto pl-3 text-muted-foreground shrink-0">+{c.dial}</span>
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Input
        id="survey-phone"
        type="tel"
        autoFocus
        autoComplete="tel"
        placeholder={country.format.replace(/#/g, '0')}
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
