// Static contract test for 20261121130001_block_locked_estimate_child_writes.sql
// (same approach as the other *-migration tests: the SQL's shape is pinned; the
// behaviour was checked on the development database in a rolled-back transaction).

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'supabase/migrations')
const FILE = '20261121130001_block_locked_estimate_child_writes.sql'
const SQL = readFileSync(join(DIR, FILE), 'utf8').replace(/\r\n/g, '\n')

function fn(name: string): string {
  const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  const end = SQL.indexOf('\n$$;', start)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return SQL.slice(start, end)
}

describe('an answered or signed estimate refuses line writes in the database', () => {
  const guard = fn('assert_estimate_children_writable')

  it('locks the parent estimate row before judging it', () => {
    const lock = guard.indexOf('FOR UPDATE;')
    expect(lock).toBeGreaterThan(guard.indexOf('FROM public.estimates'))
    expect(lock).toBeLessThan(guard.indexOf("RAISE EXCEPTION 'estimate_locked'"))
  })

  it('refuses when the client answered OR a signature exists, with P0022', () => {
    expect(guard).toMatch(
      /IF v_client_response IS NOT NULL OR EXISTS \(\s*SELECT 1 FROM public\.estimate_signatures WHERE estimate_id = p_estimate_id\s*\) THEN\s*RAISE EXCEPTION 'estimate_locked' USING ERRCODE = 'P0022';/
    )
  })

  it('lets a cascade through: a parent already deleted is nothing to protect', () => {
    expect(guard).toMatch(/IF NOT FOUND THEN\s+RETURN;\s+END IF;/)
    expect(guard.indexOf('IF NOT FOUND THEN')).toBeLessThan(guard.indexOf("RAISE EXCEPTION 'estimate_locked'"))
  })

  it('has a transaction-local escape hatch for deliberate maintenance', () => {
    expect(guard).toContain("IF current_setting('app.allow_locked_estimate_write', true) = 'on' THEN")
  })

  it.each([
    ['estimate_sections', 'block_locked_estimate_section_write'],
    ['estimate_items', 'block_locked_estimate_item_write'],
  ])('%s: BEFORE triggers on INSERT, DELETE and a real UPDATE', (table, fnName) => {
    expect(SQL).toMatch(
      new RegExp(
        `CREATE TRIGGER trg_${table}_block_locked_ins_del\\s+BEFORE INSERT OR DELETE ON public\\.${table}\\s+FOR EACH ROW\\s+EXECUTE FUNCTION public\\.${fnName}\\(\\);`
      )
    )
    expect(SQL).toMatch(
      new RegExp(
        `CREATE TRIGGER trg_${table}_block_locked_upd\\s+BEFORE UPDATE ON public\\.${table}\\s+FOR EACH ROW\\s+WHEN \\(OLD\\.\\* IS DISTINCT FROM NEW\\.\\*\\)\\s+EXECUTE FUNCTION public\\.${fnName}\\(\\);`
      )
    )
    for (const suffix of ['ins_del', 'upd']) {
      expect(SQL).toContain(`DROP TRIGGER IF EXISTS trg_${table}_block_locked_${suffix} ON public.${table};`)
    }
    // BEFORE row triggers must hand the row back, or the write is silently dropped.
    const body = fn(fnName)
    expect(body).toContain('RETURN NEW;')
    expect(body).toContain('RETURN OLD;')
    expect(body).not.toContain('RETURN NULL;')
  })

  it('the guard functions run as their owner and are not callable through PostgREST', () => {
    for (const name of [
      'assert_estimate_children_writable',
      'block_locked_estimate_section_write',
      'block_locked_estimate_item_write',
    ]) {
      expect(fn(name)).toContain('SECURITY DEFINER')
      expect(fn(name)).toContain('SET search_path = public, pg_temp')
    }
    expect(SQL).toContain('REVOKE EXECUTE ON FUNCTION public.assert_estimate_children_writable(uuid) FROM PUBLIC, anon, authenticated;')
  })

  it('uses a SQLSTATE no earlier migration raises', () => {
    const earlier = readdirSync(DIR).filter((f) => f.endsWith('.sql') && f < FILE)
    for (const f of earlier) {
      expect(readFileSync(join(DIR, f), 'utf8'), f).not.toContain("'P0022'")
    }
  })

  it('the seed that inserts accepted estimates opts in to the escape hatch', () => {
    const seed = readFileSync(join(process.cwd(), 'scripts/seed-video-workspace.mjs'), 'utf8')
    expect(seed).toContain("set_config('app.allow_locked_estimate_write', 'on', true)")
  })
})
