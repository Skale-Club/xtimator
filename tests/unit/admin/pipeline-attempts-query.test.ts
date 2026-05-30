/**
 * Wave 0 — ADMINLOG-01/02/03: pipeline_attempts query builder contract.
 * Tests: buildSearchOr, filter→.eq mapping, .range pagination, count queries, email-lookup branch.
 * RED until Plan 93-02 implements buildSearchOr in lib/admin/events-helpers.ts
 * and Plan 93-03 implements events/page.tsx.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildSearchOr } from '@/lib/admin/events-helpers'

// ── buildSearchOr pure-function tests ────────────────────────────────────────
// These tests import the function directly now that it exists.

describe('ADMINLOG-02: buildSearchOr', () => {
  it('emits ILIKE clauses for error_message and error_code on plain text', () => {
    const result = buildSearchOr('test message')
    expect(result).toContain('error_message.ilike.%test message%')
    expect(result).toContain('error_code.ilike.%test message%')
  })

  it('does NOT emit ilike on uuid columns for a plain text term (no UUID shape)', () => {
    const result = buildSearchOr('test message')
    expect(result).not.toContain('attempt_id.eq')
    expect(result).not.toContain('project_id.eq')
    expect(result).not.toContain('estimate_id.eq')
    expect(result).not.toContain('user_id.eq')
  })

  it('emits .eq clauses for attempt_id, project_id, estimate_id, user_id ONLY when term is a valid UUID', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    const result = buildSearchOr(uuid)
    expect(result).toContain(`attempt_id.eq.${uuid}`)
    expect(result).toContain(`project_id.eq.${uuid}`)
    expect(result).toContain(`estimate_id.eq.${uuid}`)
    expect(result).toContain(`user_id.eq.${uuid}`)
    expect(result).toContain(`error_message.ilike.%${uuid}%`)
  })

  it('strips PostgREST meta-chars (%, comma, parens) from the term before building clauses', () => {
    const result = buildSearchOr('foo%bar,baz')
    // meta-chars stripped: % and , removed, resulting in 'foobarbaz'
    expect(result).toContain('error_message.ilike.%foobarbaz%')
    expect(result).toContain('error_code.ilike.%foobarbaz%')
    // must NOT contain the raw meta-chars in the filter values
    expect(result).not.toContain('%foo%bar')
    expect(result).not.toContain(',baz')
  })
})

describe('ADMINLOG-02: email-lookup branch', () => {
  it('triggers listUsers path when term contains @ (static source)', () => {
    try {
      const src = readFileSync(resolve(process.cwd(), 'app/admin/events/page.tsx'), 'utf8')
      // Email detection guard: includes('@') triggers the listUsers branch
      expect(src).toMatch(/includes\(['"]@['"]\)/)
      // listUsers must be called somewhere in the file
      expect(src).toMatch(/listUsers/)
    } catch {
      expect.fail('Wave 0: app/admin/events/page.tsx not yet written')
    }
  })

  it('does NOT call listUsers when term does not contain @ (static source)', () => {
    try {
      const src = readFileSync(resolve(process.cwd(), 'app/admin/events/page.tsx'), 'utf8')
      // The listUsers call must be inside an if-block guarded by includes('@')
      expect(src).toMatch(/if\s*\(search\.includes\(['"]@['"]\)\)/)
    } catch {
      expect.fail('Wave 0: app/admin/events/page.tsx not yet written')
    }
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
