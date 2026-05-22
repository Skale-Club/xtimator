export interface Country {
  code: string
  name: string
  dial: string
  flag: string
  format: string
  preferred: boolean
}

// Locked list — order, dials, flags, and masks must not change without a follow-up plan.
export const COUNTRIES: readonly Country[] = [
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

export function applyMask(digits: string, format: string): string {
  let result = ''
  let di = 0
  for (const char of format) {
    if (di >= digits.length) break
    result += char === '#' ? digits[di++] : char
  }
  return result
}

export function maxDigits(format: string): number {
  return format.split('').filter(c => c === '#').length
}
