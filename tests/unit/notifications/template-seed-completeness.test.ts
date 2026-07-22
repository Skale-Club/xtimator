/**
 * Phase 172 plan 02 (TMPL-01) — CI drift guard, closes Pitfall 1.
 *
 * `lib/notifications/copy.ts`'s exhaustive `switch` (no `default` case) used
 * to make "new EventType, forgotten copy" a `tsc` build failure. Moving copy
 * into `notification_templates` (a DB table) loses that guarantee unless two
 * independent layers replace it:
 *
 *  1. Compile-time: `EVENT_TEMPLATE_SEED`'s `Record<EventType, TemplateSeedEntry>`
 *     type (lib/notifications/template-seed.ts) — a missing key is a `tsc`
 *     error, verified indirectly by this repo's `tsconfig.ci.json` gate.
 *  2. Runtime (THIS FILE): an independent belt-and-suspenders check that (a)
 *     the seed's key set exactly matches `EVENT_CATEGORIES`'s key set, and
 *     (b) the migration SQL text and the TS seed module can never silently
 *     drift apart — every seeded row's (scope, event_type, channel) tuple
 *     and body text must appear verbatim in the migration file.
 *
 * No live DB connection needed — this reads the migration file as plain
 * text, matching the already-configured `vitest run tests/unit` CI scope.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { EVENT_TEMPLATE_SEED } from '@/lib/notifications/template-seed'
import { EVENT_CATEGORIES, type EventType } from '@/lib/notifications/event-types'

const MIGRATION_PATH = join(
  process.cwd(),
  'supabase/migrations/20260721000001_phase172_notification_templates.sql'
)

describe('EVENT_TEMPLATE_SEED exhaustiveness', () => {
  it('has exactly one seed entry per current EventType (matches EVENT_CATEGORIES key set)', () => {
    const seedKeys = Object.keys(EVENT_TEMPLATE_SEED).sort()
    const eventTypeKeys = (Object.keys(EVENT_CATEGORIES) as EventType[]).sort()

    expect(seedKeys).toEqual(eventTypeKeys)
  })

  it('has exactly 17 entries', () => {
    expect(Object.keys(EVENT_TEMPLATE_SEED).length).toBe(17)
  })

  it('admin.bonus_credits_granted carries zero variables (CREDITUI-04 / Pitfall 5 guard)', () => {
    const entry = EVENT_TEMPLATE_SEED['admin.bonus_credits_granted']

    expect(entry.variables).toEqual([])
    expect(entry.body).not.toMatch(/\{\{/)
  })
})

describe('migration SQL / TS seed drift guard', () => {
  const migrationSql = readFileSync(MIGRATION_PATH, 'utf-8')

  it('contains a scope/event_type/channel tuple and a verbatim body for every seed entry', () => {
    for (const [eventType, entry] of Object.entries(EVENT_TEMPLATE_SEED)) {
      const tupleNeedle = `'tenant', '${eventType}', 'in_app'`
      expect(
        migrationSql.includes(tupleNeedle),
        `migration SQL is missing the ('tenant', '${eventType}', 'in_app') row tuple`
      ).toBe(true)

      // SQL-escape single quotes the same way a SQL string literal would
      // (none of the current 17 bodies contain an apostrophe, so this is a
      // no-op today — kept correct for future entries).
      const escapedBody = entry.body.replace(/'/g, "''")
      expect(
        migrationSql.includes(escapedBody),
        `migration SQL is missing the verbatim body for "${eventType}": ${entry.body}`
      ).toBe(true)
    }
  })

  it('contains the CREATE TABLE statement and RLS-enable line', () => {
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.notification_templates')
    expect(migrationSql).toContain('ENABLE ROW LEVEL SECURITY')
  })
})
