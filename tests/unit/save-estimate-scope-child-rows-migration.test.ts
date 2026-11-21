// Static contract test for 20261121120001_save_estimate_scope_child_rows.sql,
// mirroring tests/unit/lock-at-acceptance-migration.test.ts (no live-DB harness
// exists for migrations in this repo, so the SQL's shape is pinned instead).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (name: string) =>
  readFileSync(join(process.cwd(), 'supabase/migrations', name), 'utf8').replace(/\r\n/g, '\n')

const SQL = read('20261121120001_save_estimate_scope_child_rows.sql')
const BASE = read('20261116000001_lock_at_acceptance.sql')

function fn(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  const end = sql.indexOf('\n$$;', start)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

const next = fn(SQL, 'save_estimate_atomic')
const base = fn(BASE, 'save_estimate_atomic')

describe('save_estimate_atomic scopes child rows to the estimate being saved', () => {
  it('writes an existing section only when it belongs to p_estimate_id', () => {
    expect(next).toMatch(
      /UPDATE public\.estimate_sections[\s\S]*?WHERE id = v_section_id\s+AND estimate_id = p_estimate_id;/
    )
  })

  it('writes an existing item only when it belongs to the section being saved', () => {
    expect(next).toMatch(
      /UPDATE public\.estimate_items[\s\S]*?WHERE id = v_item_id\s+AND section_id = v_section_id;/
    )
  })

  it('refuses a row that exists elsewhere with P0021, and keeps the no-op for a vanished row', () => {
    expect(next).toMatch(
      /IF NOT FOUND AND EXISTS \(\s*SELECT 1 FROM public\.estimate_sections WHERE id = v_section_id\s*\) THEN\s*RAISE EXCEPTION 'estimate_foreign_row' USING ERRCODE = 'P0021';/
    )
    expect(next).toMatch(
      /IF NOT FOUND AND EXISTS \(\s*SELECT 1 FROM public\.estimate_items WHERE id = v_item_id\s*\) THEN\s*RAISE EXCEPTION 'estimate_foreign_row' USING ERRCODE = 'P0021';/
    )
  })

  it('requires the caller company to own the estimate before any write', () => {
    const guard = next.indexOf('WHERE id = p_estimate_id AND company_id = p_company_id')
    expect(guard).toBeGreaterThan(0)
    expect(guard).toBeLessThan(next.indexOf('UPDATE public.estimates'))
    expect(guard).toBeGreaterThan(next.indexOf('FOR UPDATE'))
  })

  it('refuses foreign rows before the per-section orphan delete can run', () => {
    expect(next.indexOf("AND estimate_id = p_estimate_id;")).toBeLessThan(
      next.indexOf('DELETE FROM public.estimate_items')
    )
  })

  it('is otherwise identical to the 20261116000001 definition', () => {
    // Strip exactly what this migration adds; the rest must match byte for byte.
    const stripped = next
      .replace(/\n  -- Step 1b:[\s\S]*?\n  END IF;\n/, '')
      .replace(
        /\n        AND estimate_id = p_estimate_id;\n\n[\s\S]*?\n      END IF;\n    END IF;\n/,
        ';\n    END IF;\n'
      )
      .replace(
        /\n          AND section_id = v_section_id;\n\n[\s\S]*?\n        END IF;\n      END IF;\n/,
        ';\n      END IF;\n'
      )
    expect(stripped).toBe(base)
  })

  it('keeps the INVOKER posture and the authenticated grant', () => {
    expect(next).toContain('SECURITY INVOKER')
    expect(SQL).toContain(
      'GRANT EXECUTE ON FUNCTION public.save_estimate_atomic(uuid, uuid, timestamptz, jsonb, jsonb) TO authenticated;'
    )
  })

  it('uses a SQLSTATE no other migration raises', () => {
    expect(BASE).not.toContain("'P0021'")
  })
})
