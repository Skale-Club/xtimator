import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Account consolidation contract tests.
 *
 * Proves:
 * - General removed from nav
 * - General page redirects to Account
 * - Account page renders both ProfileSection and AccountSection
 * - updateProfile revalidates /settings/account
 * - No tenant WhatsApp profile writer (saveWhatsAppNumber removed from exports)
 * - No whatsappPhone in profile-section props or UI
 */

const root = resolve(__dirname, '..', '..', '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('Account consolidation (142.1-02)', () => {
  it('removes General from settings navigation', () => {
    const nav = read('components/settings/settings-nav.tsx')
    expect(nav).not.toContain("value: 'general'")
    expect(nav).not.toContain("href: '/settings/general'")
    expect(nav).toContain("value: 'account'")
    expect(nav).toContain("href: '/settings/account'")
  })

  it('redirects General page to Account', () => {
    const general = read('app/(app)/settings/(tabs)/general/page.tsx')
    expect(general).toContain("redirect('/settings/account')")
    expect(general).not.toContain('ProfileSection')
    expect(general).not.toContain('getAuthClaims')
  })

  it('Account page renders both ProfileSection and AccountSection', () => {
    const account = read('app/(app)/settings/(tabs)/account/page.tsx')
    expect(account).toContain('ProfileSection')
    expect(account).toContain('AccountSection')
  })

  it('updateProfile revalidates /settings/account', () => {
    const settings = read('lib/actions/settings.ts')
    expect(settings).toContain("revalidatePath('/settings/account')")
    expect(settings).not.toContain("revalidatePath('/settings/general')")
  })

  it('does not export saveWhatsAppNumber from settings actions', () => {
    const settings = read('lib/actions/settings.ts')
    // The function body should not exist (no export async function saveWhatsAppNumber)
    expect(settings).not.toMatch(/export\s+async\s+function\s+saveWhatsAppNumber/)
  })

  it('profile-section has no WhatsApp phone props or UI', () => {
    const profile = read('components/settings/profile-section.tsx')
    expect(profile).not.toContain('whatsappPhone')
    expect(profile).not.toContain('saveWhatsAppNumber')
    expect(profile).not.toContain('WhatsApp Number')
    expect(profile).not.toContain('whatsappValue')
    expect(profile).not.toContain('isWhatsAppPending')
  })

  it('account page profile has no WhatsApp data', () => {
    const account = read('app/(app)/settings/(tabs)/account/page.tsx')
    expect(account).not.toContain('whatsappPhone')
    expect(account).not.toContain('company_whatsapp')
  })

  it('account loading represents both profile and security sections', () => {
    const loading = read('app/(app)/settings/(tabs)/account/loading.tsx')
    expect(loading).toContain('Profile Photo')
    expect(loading).toContain('Change Password')
    expect(loading).toContain('Change Email')
    expect(loading).not.toContain('WhatsApp')
  })

  it('general loading is a no-op redirect boundary', () => {
    const loading = read('app/(app)/settings/(tabs)/general/loading.tsx')
    // Should not render WhatsApp-related skeleton sections
    expect(loading).not.toContain('WhatsApp')
  })
})
