/**
 * Phase 176 Plan 03 — recipient-local timezone derivation.
 *
 * Pure module: callers pass in already-fetched strings (no DB access here).
 * Feeds lib/notifications/quiet-hours.ts's isWithinQuietHours() and, via
 * that, 176-04's customer-send-gate.
 *
 * Precedence chain (first tier that resolves wins):
 *   1. clients.state         (STATE_TIMEZONES)
 *   2. clients.phone NPA     (AREA_CODE_TIMEZONES)
 *   3. companies.state       (STATE_TIMEZONES, tenant fallback)
 *
 * If NONE of the three resolve, resolveRecipientZones() returns `null`.
 * Callers MUST treat `null` as "block the send" — never default to a
 * guessed timezone (ET/UTC/etc). Per research: guessing wrong is materially
 * worse than a delayed send.
 */

export type ZoneSource = 'client_state' | 'area_code' | 'company_state'

export interface ZoneResolution {
  zones: string[]
  source: ZoneSource
}

/**
 * USPS 2-letter state/territory code -> IANA timezone(s).
 * Single-zone states get a 1-element array; states whose territory spans
 * multiple zones (e.g. FL, TX) get 2 elements — resolveRecipientZones()
 * returns ALL of them and isWithinQuietHours() requires every zone in the
 * array to independently pass, so split states are evaluated against the
 * MOST RESTRICTIVE zone (over-block, never under-block).
 *
 * Known deliberate simplification: AZ ships as single-zone
 * 'America/Phoenix'. The Navajo Nation portion of AZ observes DST and is
 * technically Mountain time part of the year — a documented, low-population
 * edge case not resolved in v1.
 */
export const STATE_TIMEZONES: Record<string, string[]> = {
  AL: ['America/Chicago'], AK: ['America/Anchorage'], AZ: ['America/Phoenix'],
  AR: ['America/Chicago'], CA: ['America/Los_Angeles'], CO: ['America/Denver'],
  CT: ['America/New_York'], DE: ['America/New_York'], DC: ['America/New_York'],
  FL: ['America/New_York', 'America/Chicago'], GA: ['America/New_York'],
  HI: ['Pacific/Honolulu'], IA: ['America/Chicago'],
  ID: ['America/Denver', 'America/Los_Angeles'], IL: ['America/Chicago'],
  IN: ['America/New_York', 'America/Chicago'], KS: ['America/Chicago', 'America/Denver'],
  KY: ['America/New_York', 'America/Chicago'], LA: ['America/Chicago'],
  MA: ['America/New_York'], MD: ['America/New_York'], ME: ['America/New_York'],
  MI: ['America/New_York', 'America/Chicago'], MN: ['America/Chicago'],
  MO: ['America/Chicago'], MS: ['America/Chicago'], MT: ['America/Denver'],
  NC: ['America/New_York'], ND: ['America/Chicago', 'America/Denver'],
  NE: ['America/Chicago', 'America/Denver'], NH: ['America/New_York'],
  NJ: ['America/New_York'], NM: ['America/Denver'], NV: ['America/Los_Angeles'],
  NY: ['America/New_York'], OH: ['America/New_York'], OK: ['America/Chicago'],
  OR: ['America/Los_Angeles', 'America/Denver'], PA: ['America/New_York'],
  RI: ['America/New_York'], SC: ['America/New_York'],
  SD: ['America/Chicago', 'America/Denver'], TN: ['America/New_York', 'America/Chicago'],
  TX: ['America/Chicago', 'America/Denver'], UT: ['America/Denver'],
  VA: ['America/New_York'], VT: ['America/New_York'], WA: ['America/Los_Angeles'],
  WI: ['America/Chicago'], WV: ['America/New_York'], WY: ['America/Denver'],
}

/**
 * NANP area code (NPA) -> single IANA timezone. Deliberately
 * non-exhaustive — curated major-metro codes covering the most populous
 * NPAs, one per zone-cluster. An unmapped NPA falls through to tier 3
 * (company_state); it does NOT fail the whole resolution. Expanding
 * coverage is a safe, low-risk future addition.
 */
export const AREA_CODE_TIMEZONES: Record<string, string> = {
  // Eastern
  '201':'America/New_York','202':'America/New_York','212':'America/New_York','215':'America/New_York',
  '239':'America/New_York','267':'America/New_York','301':'America/New_York','305':'America/New_York',
  '315':'America/New_York','401':'America/New_York','404':'America/New_York','407':'America/New_York',
  '410':'America/New_York','412':'America/New_York','443':'America/New_York','470':'America/New_York',
  '516':'America/New_York','610':'America/New_York','617':'America/New_York','646':'America/New_York',
  '678':'America/New_York','703':'America/New_York','704':'America/New_York','718':'America/New_York',
  '727':'America/New_York','754':'America/New_York','770':'America/New_York','786':'America/New_York',
  '813':'America/New_York','845':'America/New_York','856':'America/New_York','857':'America/New_York',
  '860':'America/New_York','908':'America/New_York','914':'America/New_York','917':'America/New_York',
  '954':'America/New_York','978':'America/New_York',
  // Central
  '205':'America/Chicago','214':'America/Chicago','225':'America/Chicago','251':'America/Chicago',
  '281':'America/Chicago','312':'America/Chicago','314':'America/Chicago','318':'America/Chicago',
  '325':'America/Chicago','337':'America/Chicago','361':'America/Chicago','405':'America/Chicago',
  '409':'America/Chicago','414':'America/Chicago','469':'America/Chicago','501':'America/Chicago',
  '512':'America/Chicago','608':'America/Chicago','612':'America/Chicago','615':'America/Chicago',
  '618':'America/Chicago','630':'America/Chicago','651':'America/Chicago','701':'America/Chicago',
  '713':'America/Chicago','731':'America/Chicago','773':'America/Chicago','779':'America/Chicago',
  '815':'America/Chicago','832':'America/Chicago','847':'America/Chicago','901':'America/Chicago',
  '913':'America/Chicago','918':'America/Chicago','952':'America/Chicago',
  // Mountain
  '303':'America/Denver','307':'America/Denver','385':'America/Denver','406':'America/Denver',
  '435':'America/Denver','505':'America/Denver','575':'America/Denver','719':'America/Denver',
  '720':'America/Denver','801':'America/Denver','970':'America/Denver',
  // Arizona (no DST)
  '480':'America/Phoenix','520':'America/Phoenix','602':'America/Phoenix','623':'America/Phoenix','928':'America/Phoenix',
  // Pacific
  '206':'America/Los_Angeles','209':'America/Los_Angeles','213':'America/Los_Angeles','253':'America/Los_Angeles',
  '310':'America/Los_Angeles','323':'America/Los_Angeles','360':'America/Los_Angeles','408':'America/Los_Angeles',
  '415':'America/Los_Angeles','424':'America/Los_Angeles','510':'America/Los_Angeles','530':'America/Los_Angeles',
  '559':'America/Los_Angeles','562':'America/Los_Angeles','619':'America/Los_Angeles','626':'America/Los_Angeles',
  '650':'America/Los_Angeles','657':'America/Los_Angeles','661':'America/Los_Angeles','669':'America/Los_Angeles',
  '707':'America/Los_Angeles','714':'America/Los_Angeles','747':'America/Los_Angeles','760':'America/Los_Angeles',
  '805':'America/Los_Angeles','818':'America/Los_Angeles','858':'America/Los_Angeles','909':'America/Los_Angeles',
  '916':'America/Los_Angeles','925':'America/Los_Angeles','949':'America/Los_Angeles','951':'America/Los_Angeles',
  '971':'America/Los_Angeles',
  // Alaska / Hawaii
  '907':'America/Anchorage','808':'Pacific/Honolulu',
}

/** Extracts the 3-digit NANP area code (NPA) from a phone number string. */
function extractAreaCode(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return null
  const last10 = digits.slice(-10)
  return last10.slice(0, 3)
}

/**
 * Derives the recipient's plausible local timezone(s) via the three-tier
 * precedence chain. Returns `null` (fail closed) when no tier resolves —
 * callers MUST block the send in that case, never guess a default zone.
 */
export function resolveRecipientZones(input: {
  clientState?: string | null
  clientPhone?: string | null
  companyState?: string | null
}): ZoneResolution | null {
  const { clientState, clientPhone, companyState } = input

  if (clientState) {
    const normalized = clientState.trim().toUpperCase()
    const zones = STATE_TIMEZONES[normalized]
    if (zones) return { zones, source: 'client_state' }
  }

  if (clientPhone) {
    const npa = extractAreaCode(clientPhone)
    if (npa) {
      const zone = AREA_CODE_TIMEZONES[npa]
      if (zone) return { zones: [zone], source: 'area_code' }
    }
  }

  if (companyState) {
    const normalized = companyState.trim().toUpperCase()
    const zones = STATE_TIMEZONES[normalized]
    if (zones) return { zones, source: 'company_state' }
  }

  return null
}
