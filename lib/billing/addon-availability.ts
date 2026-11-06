/**
 * SEED-055 D9: Pro is 1 company + 1 user. Extra companies and extra seats are
 * add-ons that do not exist yet, so both are unavailable to everyone. Existing
 * extra companies / members stay as they are; only NEW ones are refused.
 *
 * A plain module (not a 'use server' file, so it can export a constant) and a
 * function (so callers do not get a constant-folded branch). Flip a value here,
 * in the same change that ships the matching add-on, to re-open the flow; the
 * code paths behind the gate are kept intact and stay covered by their tests.
 */
const ADDON_AVAILABILITY = {
  /** createOrUpdateCompany({ mode: 'add' }) */
  extraCompanies: false,
  /** inviteMember + acceptInvite */
  extraSeats: false,
} as const

export type AddonKey = keyof typeof ADDON_AVAILABILITY

export function isAddonAvailable(key: AddonKey): boolean {
  return ADDON_AVAILABILITY[key]
}

export const ADD_COMPANY_UNAVAILABLE_ERROR = 'Adding companies is not available yet'
export const INVITE_UNAVAILABLE_ERROR = 'Inviting teammates is not available yet'
export const ACCEPT_INVITE_UNAVAILABLE_ERROR =
  'Joining a company by invite is not available yet. Ask the owner to contact support.'
