/**
 * Launch switches for plan features that are configured but not offered yet.
 * Flip CUSTOM_DOMAIN_ENABLED to bring Settings > Custom domain and its plan
 * bullet back (owner decision 2026-11-21: custom domain is not a priority).
 */
export const CUSTOM_DOMAIN_ENABLED = false

const CUSTOM_DOMAIN_BULLET = /custom domain/i
/**
 * Online payments are not a plan feature (owner decision
 * XTM-D-20261121-feature-switches): they are switched per company, so a stored
 * bullet that still advertises them is always dropped.
 */
const CONNECT_BULLET = /stripe connect|online payments/i

/**
 * Render-time filter for plan feature bullets. The stored billing_config
 * (admin panel) can carry its own featureBullets, so code defaults alone are
 * not enough: every surface that renders bullets runs them through here.
 */
export function filterPlanBullets(bullets: readonly string[]): string[] {
  return bullets.filter((b) => {
    if (!CUSTOM_DOMAIN_ENABLED && CUSTOM_DOMAIN_BULLET.test(b)) return false
    if (CONNECT_BULLET.test(b)) return false
    return true
  })
}
