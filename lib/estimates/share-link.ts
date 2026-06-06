/**
 * Share-link expiry helpers.
 *
 * Public estimate links (/estimate/<token>) expose the owner's and client's
 * contact details to anyone holding the URL, so they must not live forever.
 * The expiry window is (re)set on consolidation and on every send — across
 * email, SMS, and WhatsApp — so re-sending an estimate revives/extends its
 * link. That makes "send it again" the natural way to regenerate an expired
 * link, with no extra UI.
 *
 * NULL share_expires_at = never expires (legacy estimates predating this).
 */
export const SHARE_LINK_TTL_DAYS = 90

/** ISO timestamp for a fresh expiry window starting now. */
export function shareLinkExpiryFromNow(): string {
  const d = new Date()
  d.setDate(d.getDate() + SHARE_LINK_TTL_DAYS)
  return d.toISOString()
}

/** True only when an expiry is set AND in the past. NULL/empty = never expires. */
export function isShareLinkExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() < Date.now()
}
