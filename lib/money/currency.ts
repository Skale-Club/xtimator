export const DEFAULT_CURRENCY_CODE = 'USD'

export const SUPPORTED_CURRENCIES = [
  { code: 'USD', label: 'US Dollar', locale: 'en-US', minorUnit: 2 },
  { code: 'BRL', label: 'Brazilian Real', locale: 'pt-BR', minorUnit: 2 },
  { code: 'EUR', label: 'Euro', locale: 'de-DE', minorUnit: 2 },
  { code: 'GBP', label: 'British Pound', locale: 'en-GB', minorUnit: 2 },
  { code: 'CAD', label: 'Canadian Dollar', locale: 'en-CA', minorUnit: 2 },
  { code: 'AUD', label: 'Australian Dollar', locale: 'en-AU', minorUnit: 2 },
  { code: 'MXN', label: 'Mexican Peso', locale: 'es-MX', minorUnit: 2 },
  { code: 'CHF', label: 'Swiss Franc', locale: 'de-CH', minorUnit: 2 },
  { code: 'JPY', label: 'Japanese Yen', locale: 'ja-JP', minorUnit: 0 },
  { code: 'NZD', label: 'New Zealand Dollar', locale: 'en-NZ', minorUnit: 2 },
] as const

export type SupportedCurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]['code']

export const SUPPORTED_CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code) as readonly SupportedCurrencyCode[]

export function isSupportedCurrencyCode(value: unknown): value is SupportedCurrencyCode {
  return typeof value === 'string' && SUPPORTED_CURRENCY_CODES.includes(value as SupportedCurrencyCode)
}

export function normalizeCurrencyCode(value: unknown): SupportedCurrencyCode {
  const upper = typeof value === 'string' ? value.toUpperCase() : ''
  return isSupportedCurrencyCode(upper) ? upper : DEFAULT_CURRENCY_CODE
}

export function getCurrencyConfig(code: unknown) {
  const normalized = normalizeCurrencyCode(code)
  return SUPPORTED_CURRENCIES.find((c) => c.code === normalized) ?? SUPPORTED_CURRENCIES[0]
}

export function getCurrencyLabel(code: unknown): string {
  const currency = getCurrencyConfig(code)
  return `${currency.code} - ${currency.label}`
}

export function getCurrencySymbol(code: unknown): string {
  const currency = getCurrencyConfig(code)
  const parts = new Intl.NumberFormat(currency.locale, {
    style: 'currency',
    currency: currency.code,
    minimumFractionDigits: currency.minorUnit,
    maximumFractionDigits: currency.minorUnit,
  }).formatToParts(0)
  return parts.find((part) => part.type === 'currency')?.value ?? currency.code
}

export function formatMoney(
  value: number | null | undefined,
  currencyCode: unknown,
  options: { minimumFractionDigits?: number; maximumFractionDigits?: number } = {},
): string {
  const currency = getCurrencyConfig(currencyCode)
  const amount = typeof value === 'number' && Number.isFinite(value) ? value : 0

  return new Intl.NumberFormat(currency.locale, {
    style: 'currency',
    currency: currency.code,
    minimumFractionDigits: options.minimumFractionDigits ?? currency.minorUnit,
    maximumFractionDigits: options.maximumFractionDigits ?? currency.minorUnit,
  }).format(amount)
}

export function formatMoneyNumber(value: number | null | undefined, currencyCode: unknown): string {
  const currency = getCurrencyConfig(currencyCode)
  const amount = typeof value === 'number' && Number.isFinite(value) ? value : 0

  return new Intl.NumberFormat(currency.locale, {
    minimumFractionDigits: currency.minorUnit,
    maximumFractionDigits: currency.minorUnit,
  }).format(amount)
}

export function toMinorUnits(value: number | null | undefined, currencyCode: unknown): number {
  const currency = getCurrencyConfig(currencyCode)
  const amount = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return Math.round(amount * 10 ** currency.minorUnit)
}

export function fromMinorUnits(value: number | null | undefined, currencyCode: unknown): number {
  const currency = getCurrencyConfig(currencyCode)
  const amount = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return amount / 10 ** currency.minorUnit
}

export function formatMinorUnits(value: number | null | undefined, currencyCode: unknown): string {
  return formatMoney(fromMinorUnits(value, currencyCode), currencyCode)
}

export function parseMoneyInput(raw: string, currencyCode: unknown): number | null {
  // Reject scientific notation BEFORE the strip below runs — `1e3`.replace(/[^\d,.-]/g, '')
  // drops the "e", silently collapsing "1e3" ($1,000, pasted from a spreadsheet)
  // into "13" ($13). Detected as an [eE] with a digit on each side (allowing an
  // optional sign after the e, e.g. "1e+3" / "1E-3") anywhere in the raw input.
  if (/\d\s*[eE]\s*[-+]?\d/.test(raw)) return null

  const currency = getCurrencyConfig(currencyCode)
  const decimalSeparator =
    new Intl.NumberFormat(currency.locale)
      .formatToParts(1.1)
      .find((part) => part.type === 'decimal')?.value ?? '.'

  let normalized = raw
    .replace(/[^\d,.-]/g, '')
    .replace(/(?!^)-/g, '')

  if (decimalSeparator === ',') {
    normalized = normalized.replace(/\./g, '').replace(',', '.')
  } else {
    normalized = normalized.replace(/,/g, '')
  }

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return 0
  return Math.round(parsed * 10 ** currency.minorUnit) / 10 ** currency.minorUnit
}
