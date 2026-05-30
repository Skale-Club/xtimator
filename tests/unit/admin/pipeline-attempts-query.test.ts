/**
 * Wave 0 — ADMINLOG-01/02/03: pipeline_attempts query builder contract.
 * Tests: buildSearchOr, filter→.eq mapping, .range pagination, count queries, email-lookup branch.
 * RED until Plan 93-02 implements buildSearchOr in lib/admin/events-query.ts
 * and Plan 93-03 implements events/page.tsx.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── buildSearchOr pure-function tests ────────────────────────────────────────
// These tests import the function directly once it exists. Until then they use
// static source assertion or expect.fail().

describe('ADMINLOG-02: buildSearchOr', () => {
  it('emits ILIKE clauses for error_message and error_code on plain text', () => {
    expect.fail('Wave 0: lib/admin/events-query.ts not yet written')
  })

  it('does NOT emit ilike on uuid columns for a plain text term (no UUID shape)', () => {
    expect.fail('Wave 0: lib/admin/events-query.ts not yet written')
  })

  it('emits .eq clauses for attempt_id, project_id, estimate_id, user_id ONLY when term is a valid UUID', () => {
    expect.fail('Wave 0: lib/admin/events-query.ts not yet written')
  })

  it('strips PostgREST meta-chars (%, comma, parens) from the term before building clauses', () => {
    expect.fail('Wave 0: lib/admin/events-query.ts not yet written')
  })
})

describe('ADMINLOG-02: email-lookup branch', () => {
  it('triggers listUsers path when term contains @', () => {
    expect.fail('Wave 0: events/page.tsx not yet written')
  })

  it('does NOT call listUsers when term does not contain @', () => {
    expect.fail('Wave 0: events/page.tsx not yet written')
  })
})

describe('ADMINLOG-01/03: events/page.tsx query builder (static source)', () => {
  it('page.tsx uses .range() for offset pagination', () => {
    try {
      const src = readFileSync(resolve(process.cwd(), 'app/admin/events/page.tsx'), 'utf8')
      expect(src).toMatch(/\.range\(/)
    } catch {
      expect.fail('Wave 0: app/admin/events/page.tsx not yet written')
    }
  })

  it('page.tsx orders by last_at descending', () => {
    try {
      const src = readFileSync(resolve(process.cwd(), 'app/admin/events/page.tsx'), 'utf8')
      expect(src).toMatch(/order\(.*last_at/)
    } catch {
      expect.fail('Wave 0: app/admin/events/page.tsx not yet written')
    }
  })

  it('page.tsx uses count:exact on the main query', () => {
    try {
      const src = readFileSync(resolve(process.cwd(), 'app/admin/events/page.tsx'), 'utf8')
      expect(src).toMatch(/count.*exact/)
    } catch {
      expect.fail('Wave 0: app/admin/events/page.tsx not yet written')
    }
  })

  it('page.tsx applies filter-scoped count queries with head:true per terminal_status', () => {
    try {
      const src = readFileSync(resolve(process.cwd(), 'app/admin/events/page.tsx'), 'utf8')
      expect(src).toMatch(/head.*true/)
    } catch {
      expect.fail('Wave 0: app/admin/events/page.tsx not yet written')
    }
  })

  it('page.tsx maps status searchParam to .eq(terminal_status)', () => {
    try {
      const src = readFileSync(resolve(process.cwd(), 'app/admin/events/page.tsx'), 'utf8')
      expect(src).toMatch(/terminal_status/)
    } catch {
      expect.fail('Wave 0: app/admin/events/page.tsx not yet written')
    }
  })

  it('page.tsx maps input_type searchParam to .eq(input_type)', () => {
    try {
      const src = readFileSync(resolve(process.cwd(), 'app/admin/events/page.tsx'), 'utf8')
      expect(src).toMatch(/input_type/)
    } catch {
      expect.fail('Wave 0: app/admin/events/page.tsx not yet written')
    }
  })

  it('page.tsx maps step searchParam to .eq(step_reached)', () => {
    try {
      const src = readFileSync(resolve(process.cwd(), 'app/admin/events/page.tsx'), 'utf8')
      expect(src).toMatch(/step_reached/)
    } catch {
      expect.fail('Wave 0: app/admin/events/page.tsx not yet written')
    }
  })

  it('page.tsx awaits searchParams (Next async prop)', () => {
    try {
      const src = readFileSync(resolve(process.cwd(), 'app/admin/events/page.tsx'), 'utf8')
      expect(src).toMatch(/await\s+searchParams/)
    } catch {
      expect.fail('Wave 0: app/admin/events/page.tsx not yet written')
    }
  })
})
