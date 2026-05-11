/**
 * Phase 52 (SEED-016): Per-estimate language cascade resolver.
 *
 * Resolves the target language for a new estimate following the cascade:
 *
 *   1. Explicit override (param)
 *   2. clientPreferred (clients.preferred_language)
 *   3. companyDefault (companies.default_estimate_language)
 *   4. userAppLanguage IF explicitly non-EN (i.e., user actively chose PT/ES)
 *   5. 'en' (final fallback — English-first principle)
 *
 * No layer below #1 EVER auto-detects from browser locale or signup hints.
 * Non-English is always a deliberate opt-in somewhere in the cascade.
 */

export type EstimateLanguage = 'en' | 'pt' | 'es'

export const SUPPORTED_LANGUAGES: readonly EstimateLanguage[] = ['en', 'pt', 'es']

export interface CascadeInputs {
  /** Explicit per-estimate override (e.g., from the generation modal dropdown) */
  override?: EstimateLanguage | null
  /** clients.preferred_language */
  clientPreferred?: EstimateLanguage | null
  /** companies.default_estimate_language */
  companyDefault?: EstimateLanguage | null
  /** User's current app language from localStorage. ONLY consulted if non-EN. */
  userAppLanguage?: EstimateLanguage | null
}

export function isSupportedLanguage(v: unknown): v is EstimateLanguage {
  return typeof v === 'string' && SUPPORTED_LANGUAGES.includes(v as EstimateLanguage)
}

/**
 * Run the cascade and return the resolved target language.
 *
 * English-first: any layer providing a non-supported or null value is skipped.
 * `userAppLanguage === 'en'` is ALSO skipped (treated as "no explicit preference"
 * since 'en' is the default app state).
 */
export function resolveEstimateLanguage(inputs: CascadeInputs): EstimateLanguage {
  if (isSupportedLanguage(inputs.override)) return inputs.override
  if (isSupportedLanguage(inputs.clientPreferred)) return inputs.clientPreferred
  if (isSupportedLanguage(inputs.companyDefault)) return inputs.companyDefault
  if (
    isSupportedLanguage(inputs.userAppLanguage) &&
    inputs.userAppLanguage !== 'en'
  ) {
    return inputs.userAppLanguage
  }
  return 'en'
}

/**
 * Returns the cascade layer that "won" — useful for UI hints
 * (e.g., "Defaulted to Portuguese from your app language").
 */
export type CascadeSource = 'override' | 'client' | 'company' | 'user' | 'fallback'

export function resolveEstimateLanguageWithSource(
  inputs: CascadeInputs
): { language: EstimateLanguage; source: CascadeSource } {
  if (isSupportedLanguage(inputs.override))
    return { language: inputs.override, source: 'override' }
  if (isSupportedLanguage(inputs.clientPreferred))
    return { language: inputs.clientPreferred, source: 'client' }
  if (isSupportedLanguage(inputs.companyDefault))
    return { language: inputs.companyDefault, source: 'company' }
  if (
    isSupportedLanguage(inputs.userAppLanguage) &&
    inputs.userAppLanguage !== 'en'
  ) {
    return { language: inputs.userAppLanguage, source: 'user' }
  }
  return { language: 'en', source: 'fallback' }
}

/**
 * Human-readable label for a language (used in UI hints, never in AI prompts).
 */
export const LANGUAGE_LABELS: Record<EstimateLanguage, string> = {
  en: 'English',
  pt: 'Portuguese (Brazil)',
  es: 'Spanish (Latin American)',
}
