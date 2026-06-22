import { describe, it, expect } from 'vitest'

/**
 * Phase 104 plan 00 — Wave-0 RED test for the pure category-migration fn (NOTIF-06).
 *
 * `@/lib/notifications/category-migration` does NOT exist yet — Wave 1 creates a
 * PURE function `migrateCategories(categories)` that the SQL data-migration
 * mirrors (OR-merge payment/trial/quota/admin → billing; drop whatsapp/ai_job;
 * carry estimate/system through; idempotent; no null writes; never default-on the
 * paid whatsapp/sms channels).
 *
 * RED form: module-not-found (the import resolves only after Wave 1). The lazy
 * `await import` inside each `it` keeps the file collectable before the module
 * exists.
 *
 * Owner: Wave 1 (104.1 — preferences data migration).
 */

const INPUT = {
  payment: { in_app: true, email: false },
  trial: { in_app: false, email: true },
  quota: { in_app: false, email: false },
  admin: { in_app: false, email: false },
  estimate: { in_app: true, email: true },
  whatsapp: { in_app: true, email: true },
  ai_job: { in_app: true, email: true },
  system: { in_app: true, email: true },
}

describe('lib/notifications/category-migration — migrateCategories() (NOTIF-06 RED)', () => {
  it('OR-merges payment/trial/quota/admin into billing', async () => {
    const { migrateCategories } = await import('@/lib/notifications/category-migration')
    const out = migrateCategories(INPUT)
    // payment had in_app=true → billing.in_app=true (OR-merge)
    expect(out.billing.in_app).toBe(true)
    // trial had email=true → billing.email=true (OR-merge)
    expect(out.billing.email).toBe(true)
  })

  it('drops payment/trial/quota/admin/whatsapp/ai_job keys', async () => {
    const { migrateCategories } = await import('@/lib/notifications/category-migration')
    const out = migrateCategories(INPUT) as Record<string, unknown>
    for (const dropped of ['payment', 'trial', 'quota', 'admin', 'whatsapp', 'ai_job']) {
      expect(out[dropped]).toBeUndefined()
    }
  })

  it('carries estimate and system through unchanged', async () => {
    const { migrateCategories } = await import('@/lib/notifications/category-migration')
    const out = migrateCategories(INPUT)
    expect(out.estimate).toEqual({ in_app: true, email: true })
    expect(out.system).toEqual({ in_app: true, email: true })
  })

  it('is idempotent — migrate(migrate(x)) deep-equals migrate(x)', async () => {
    const { migrateCategories } = await import('@/lib/notifications/category-migration')
    const once = migrateCategories(INPUT)
    const twice = migrateCategories(once as never)
    expect(twice).toEqual(once)
  })

  it('empty input → empty output (no crash, no null writes)', async () => {
    const { migrateCategories } = await import('@/lib/notifications/category-migration')
    const out = migrateCategories({})
    expect(out).toEqual({})
  })

  it('does NOT default-on the paid whatsapp/sms channels on the merged billing object', async () => {
    const { migrateCategories } = await import('@/lib/notifications/category-migration')
    const out = migrateCategories(INPUT) as Record<string, Record<string, unknown>>
    // Source billing categories carried no whatsapp/sms — migration must not invent them.
    expect(out.billing.sms).toBeUndefined()
    expect(out.billing.whatsapp).toBeUndefined()
  })
})
