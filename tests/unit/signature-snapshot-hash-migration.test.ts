// Static contract test for 20261121140000_signature_snapshot_hash.sql (same
// approach as the other *-migration tests; behaviour was checked on the dev
// database in a rolled-back transaction).

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'supabase/migrations')
const FILE = '20261121140000_signature_snapshot_hash.sql'
const read = (name: string) => readFileSync(join(DIR, name), 'utf8').replace(/\r\n/g, '\n')
const SQL = read(FILE)

function fn(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  const end = sql.indexOf('\n$$;', start)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe('signature rows carry their own snapshot hash', () => {
  it.each(['estimate_signatures', 'change_order_signatures'])('%s gains snapshot_sha256', (table) => {
    expect(SQL).toContain(`ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS snapshot_sha256 text;`)
  })

  it('backfills only empty values, only well-formed hashes, before the immutability trigger', () => {
    const firstBackfill = SQL.indexOf('UPDATE public.estimate_signatures s')
    const trigger = SQL.indexOf('CREATE TRIGGER trg_estimate_signatures_immutable')
    expect(firstBackfill).toBeGreaterThan(0)
    expect(firstBackfill).toBeLessThan(trigger)
    expect(SQL.match(/AND s\.snapshot_sha256 IS NULL/g)).toHaveLength(2)
    expect(SQL.match(/a\.sha ~ '\^\[0-9a-f\]\{64\}\$'/g)).toHaveLength(2)
  })

  it.each([
    ['sign_estimate_atomic', '20261116000001_lock_at_acceptance.sql', 'estimate_signatures'],
    ['sign_change_order_atomic', '20261117000001_change_orders.sql', 'change_order_signatures'],
  ])('%s writes the hash in the signature INSERT and is otherwise unchanged', (name, baseFile, table) => {
    const next = fn(SQL, name)
    const base = fn(read(baseFile), name)
    expect(next).toMatch(
      new RegExp(`INSERT INTO public\\.${table} \\([\\s\\S]*?signed_total, snapshot_sha256\\n\\s+\\) VALUES \\([\\s\\S]*?p_signed_total, p_snapshot_sha256\\n`)
    )
    const restored = next.replace('signed_total, snapshot_sha256\n', 'signed_total\n').replace('p_signed_total, p_snapshot_sha256\n', 'p_signed_total\n')
    expect(restored).toBe(base)
    expect(next).toContain('SECURITY DEFINER')
  })

  it('keeps both sign functions service-role only', () => {
    for (const name of ['sign_estimate_atomic', 'sign_change_order_atomic']) {
      expect(SQL).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${name}\\([\\s\\S]*?\\) FROM PUBLIC, anon, authenticated;`))
      expect(SQL).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([\\s\\S]*?\\) TO service_role;`))
    }
  })
})

describe('signature rows are immutable', () => {
  const guard = fn(SQL, 'block_signature_rewrite')

  it.each(['estimate_signatures', 'change_order_signatures'])('%s: BEFORE UPDATE OR DELETE trigger', (table) => {
    expect(SQL).toMatch(
      new RegExp(`CREATE TRIGGER trg_${table}_immutable\\s+BEFORE UPDATE OR DELETE ON public\\.${table}\\s+FOR EACH ROW\\s+EXECUTE FUNCTION public\\.block_signature_rewrite\\(\\);`)
    )
    expect(SQL).toContain(`DROP TRIGGER IF EXISTS trg_${table}_immutable ON public.${table};`)
  })

  it('refuses every UPDATE and a direct DELETE with P0023, lets a cascade and the compliance hatch through', () => {
    expect(guard).toMatch(/IF TG_OP = 'UPDATE' THEN\s+RAISE EXCEPTION 'signature_immutable' USING ERRCODE = 'P0023';/)
    expect(guard).toContain("IF current_setting('app.allow_signed_estimate_delete', true) = 'on' THEN")
    expect(guard).toContain('IF EXISTS (SELECT 1 FROM public.estimates WHERE id = OLD.estimate_id) THEN')
    expect(guard).toContain('IF EXISTS (SELECT 1 FROM public.change_orders WHERE id = OLD.change_order_id) THEN')
  })

  it('uses a SQLSTATE no earlier migration raises', () => {
    for (const f of readdirSync(DIR).filter((f) => f.endsWith('.sql') && f < FILE)) {
      expect(read(f), f).not.toContain("'P0023'")
    }
  })
})
