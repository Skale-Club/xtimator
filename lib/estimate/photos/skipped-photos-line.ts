/**
 * The one plain line the owner sees when photos could not be read during
 * generation (count comes from the generate_estimate/succeeded journal row via
 * getAttemptOutcome). Says only what happened and what it means: no internals.
 * Static pt/es copy lives in lib/i18n/capture-translations.ts.
 */
export function skippedPhotosLine(t: (text: string) => string, count: number): string {
  if (count === 1) return t("1 photo couldn't be read, so the estimate doesn't use it.")
  return t("{count} photos couldn't be read, so the estimate doesn't use them.").replace(
    '{count}',
    String(count)
  )
}
