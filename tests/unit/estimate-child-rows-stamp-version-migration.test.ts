// Static contract test for 20261121130000_estimate_child_rows_stamp_version.sql,
// mirroring tests/unit/save-estimate-scope-child-rows-migration.test.ts (no
// live-DB harness exists for migrations in this repo, so the SQL's shape is
// pinned instead). The behaviour itself was checked on the development database
// inside a rolled-back transaction (see the journal entry of 2026-11-21).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (name: string) =>
  readFileSync(join(process.cwd(), 'supabase/migrations', name), 'utf8').replace(/\r\n/g, '\n')

const SQL = read('20261121130000_estimate_child_rows_stamp_version.sql')
const BASE = read('20261121120001_save_estimate_scope_child_rows.sql')

function fn(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  const end = sql.indexOf('\n$$;', start)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe('child rows stamp the estimate content version', () => {
  it('stamps with now() and skips a row already stamped in this transaction', () => {
    const stamp = fn(SQL, 'stamp_estimate_version')
    expect(stamp).toMatch(
      /UPDATE public\.estimates\s+SET updated_at = now\(\)\s+WHERE id = p_estimate_id\s+AND updated_at IS DISTINCT FROM now\(\);/
    )
  })

  it.each(['estimate_sections', 'estimate_items'])(
    '%s: stamps on INSERT and DELETE, and on UPDATE only when the row really changed',
    (table) => {
      const fnName = table === 'estimate_sections' ? 'stamp_estimate_version_from_section' : 'stamp_estimate_version_from_item'
      expect(SQL).toMatch(
        new RegExp(
          `CREATE TRIGGER trg_${table}_stamp_version_ins_del\\s+AFTER INSERT OR DELETE ON public\\.${table}\\s+FOR EACH ROW\\s+EXECUTE FUNCTION public\\.${fnName}\\(\\);`
        )
      )
      expect(SQL).toMatch(
        new RegExp(
          `CREATE TRIGGER trg_${table}_stamp_version_upd\\s+AFTER UPDATE ON public\\.${table}\\s+FOR EACH ROW\\s+WHEN \\(OLD\\.\\* IS DISTINCT FROM NEW\\.\\*\\)\\s+EXECUTE FUNCTION public\\.${fnName}\\(\\);`
        )
      )
      // Idempotent: each CREATE TRIGGER is preceded by its DROP IF EXISTS.
      for (const suffix of ['ins_del', 'upd']) {
        expect(SQL).toContain(`DROP TRIGGER IF EXISTS trg_${table}_stamp_version_${suffix} ON public.${table};`)
      }
    }
  )

  it('an item reaches its estimate through its section', () => {
    const item = fn(SQL, 'stamp_estimate_version_from_item')
    expect(item).toContain('SELECT estimate_id INTO v_estimate_id FROM public.estimate_sections WHERE id = NEW.section_id;')
    expect(item).toContain('SELECT estimate_id INTO v_estimate_id FROM public.estimate_sections WHERE id = OLD.section_id;')
  })

  it('the stamp functions run as their owner and are not callable through PostgREST', () => {
    for (const name of ['stamp_estimate_version', 'stamp_estimate_version_from_section', 'stamp_estimate_version_from_item']) {
      expect(fn(SQL, name)).toContain('SECURITY DEFINER')
      expect(fn(SQL, name)).toContain('SET search_path = public, pg_temp')
    }
    expect(SQL).toContain('REVOKE EXECUTE ON FUNCTION public.stamp_estimate_version(uuid) FROM PUBLIC, anon, authenticated;')
    expect(SQL).toContain('REVOKE EXECUTE ON FUNCTION public.stamp_estimate_version_from_section() FROM PUBLIC, anon, authenticated;')
    expect(SQL).toContain('REVOKE EXECUTE ON FUNCTION public.stamp_estimate_version_from_item() FROM PUBLIC, anon, authenticated;')
  })
})

describe('save_estimate_atomic returns the final version token', () => {
  const next = fn(SQL, 'save_estimate_atomic')
  const base = fn(BASE, 'save_estimate_atomic')
  const REREAD = 'SELECT updated_at INTO v_new_updated_at FROM public.estimates WHERE id = p_estimate_id;'

  it('re-reads updated_at after every child write and before returning it', () => {
    const reread = next.indexOf(REREAD)
    expect(reread).toBeGreaterThan(next.lastIndexOf('DELETE FROM public.estimate_sections'))
    expect(reread).toBeGreaterThan(next.lastIndexOf('UPDATE public.projects SET total'))
    expect(reread).toBeLessThan(next.indexOf("'updated_at', v_new_updated_at"))
  })

  it('is otherwise identical to the 20261121120001 definition', () => {
    const stripped = next.replace(/  -- Step 7b:[\s\S]*?WHERE id = p_estimate_id;\n\n/, '')
    expect(stripped).toBe(base)
  })

  it('keeps the INVOKER posture and the authenticated grant', () => {
    expect(next).toContain('SECURITY INVOKER')
    expect(SQL).toContain(
      'GRANT EXECUTE ON FUNCTION public.save_estimate_atomic(uuid, uuid, timestamptz, jsonb, jsonb) TO authenticated;'
    )
  })
})
