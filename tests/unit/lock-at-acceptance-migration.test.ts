// Static contract test for 20261116000001_lock_at_acceptance.sql, mirroring
// tests/unit/sign-estimate-atomic-migration.test.ts (no live-DB harness exists
// for migrations in this repo, so the SQL's shape is pinned instead).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (name: string) =>
  readFileSync(join(process.cwd(), 'supabase/migrations', name), 'utf8').replace(/\r\n/g, '\n')

const SQL = read('20261116000001_lock_at_acceptance.sql')
const BASE_SAVE = read('20260717000004_phase165_save_estimate_atomic.sql')
const BASE_SIGN = read('20260729000002_sign_estimate_atomic.sql')

function fn(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  const end = sql.indexOf('\n$$;', start)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe('lock_at_acceptance migration — save_estimate_atomic', () => {
  const next = fn(SQL, 'save_estimate_atomic')
  const base = fn(BASE_SAVE, 'save_estimate_atomic')

  it('locks only on a signature or a client response, no longer on sent_at', () => {
    expect(next).toContain('IF v_has_signature OR v_client_response IS NOT NULL THEN')
    expect(next).not.toMatch(/v_sent_at IS NOT NULL/)
    expect(next).toMatch(/RAISE EXCEPTION 'estimate_locked' USING ERRCODE = 'P0001'/)
  })

  it('is otherwise identical to the previous definition (only the lock condition changed)', () => {
    const rebuilt = base.replace(
      'IF v_has_signature OR v_sent_at IS NOT NULL OR v_client_response IS NOT NULL THEN',
      'IF v_has_signature OR v_client_response IS NOT NULL THEN'
    )
    expect(next).toBe(rebuilt)
  })

  it('keeps the INVOKER posture and the authenticated grant', () => {
    expect(next).toContain('SECURITY INVOKER')
    expect(SQL).toContain(
      'GRANT EXECUTE ON FUNCTION public.save_estimate_atomic(uuid, uuid, timestamptz, jsonb, jsonb) TO authenticated;'
    )
  })
})

describe('lock_at_acceptance migration — sign_estimate_atomic', () => {
  const next = fn(SQL, 'sign_estimate_atomic')

  it('refuses a superseded version with the new P0009 code, under the row lock', () => {
    expect(next).toMatch(/IF v_is_current IS NOT TRUE THEN\s+RAISE EXCEPTION 'estimate_not_current' USING ERRCODE = 'P0009'/)
    expect(next.indexOf('FOR UPDATE')).toBeLessThan(next.indexOf("'P0009'"))
    // ...and before the torn-snapshot compare-and-set.
    expect(next.indexOf("'P0009'")).toBeLessThan(next.indexOf("'P0007'"))
  })

  it('keeps every other guard and the service-role-only posture', () => {
    expect(next).toMatch(/'estimate_not_found' USING ERRCODE = 'P0006'/)
    expect(next).toMatch(/'estimate_conflict' USING ERRCODE = 'P0007'/)
    expect(next).toMatch(/'estimate_already_responded' USING ERRCODE = 'P0008'/)
    expect(next).toContain('SECURITY DEFINER')
    expect(SQL).toMatch(/REVOKE EXECUTE ON FUNCTION public\.sign_estimate_atomic\([\s\S]*?FROM PUBLIC, anon, authenticated;/)
    expect(SQL).toMatch(/GRANT EXECUTE ON FUNCTION public\.sign_estimate_atomic\([\s\S]*?TO service_role;/)
  })

  it('is the previous definition plus the is_current guard and nothing else', () => {
    const base = fn(BASE_SIGN, 'sign_estimate_atomic')
    const rebuilt = base
      .replace(
        'SELECT company_id, project_id, client_response, updated_at, estimate_number\n    INTO v_company_id, v_project_id, v_client_response, v_locked_updated_at, v_estimate_number',
        'SELECT company_id, project_id, client_response, updated_at, estimate_number, is_current\n    INTO v_company_id, v_project_id, v_client_response, v_locked_updated_at, v_estimate_number, v_is_current'
      )
      .replace('  v_client_name        text;\nBEGIN', '  v_client_name        text;\n  v_is_current         boolean;\nBEGIN')
    // Strip the guard block and compare to the rebuilt base.
    const withoutGuard = next.replace(/\n  -- Lock-at-acceptance:[\s\S]*?P0009'\;\n  END IF;\n/, '')
    expect(withoutGuard).toBe(rebuilt)
  })
})

describe('lock_at_acceptance migration — hygiene', () => {
  it('drops nothing and runs no top-level data statements', () => {
    const code = SQL.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
    expect(code).not.toMatch(/\bDROP\b/i)
    expect(code).not.toMatch(/\bTRUNCATE\b/i)
    // Every INSERT/UPDATE/DELETE in the file lives inside a function body.
    const outsideFunctions = code.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\n\$\$;/g, '')
    expect(outsideFunctions).not.toMatch(/^\s*(INSERT|UPDATE|DELETE)\b/im)
  })

  it('documents that it is applied by hand to both databases', () => {
    expect(SQL).toMatch(/BOTH databases/)
  })
})
