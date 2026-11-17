// Static contract test for 20261117000001_change_orders.sql (no live-DB harness
// exists for migrations in this repo, so the SQL's shape is pinned instead,
// like tests/unit/lock-at-acceptance-migration.test.ts).
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS = join(process.cwd(), 'supabase/migrations')
const SQL = readFileSync(join(MIGRATIONS, '20261117000001_change_orders.sql'), 'utf8').replace(/\r\n/g, '\n')

function fn(name: string): string {
  const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  expect(start, `${name} defined`).toBeGreaterThanOrEqual(0)
  const end = SQL.indexOf('\n$$;', start)
  expect(end).toBeGreaterThan(start)
  return SQL.slice(start, end)
}

describe('change_orders migration: tables', () => {
  it('creates the three tables with the contract columns and constraints', () => {
    for (const t of ['change_orders', 'change_order_items', 'change_order_signatures']) {
      expect(SQL).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t} \\(`))
      expect(SQL).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`)
    }
    expect(SQL).toContain('CONSTRAINT change_orders_estimate_number_key UNIQUE (estimate_id, number)')
    expect(SQL).toContain('CHECK (number > 0)')
    expect(SQL).toContain("CHECK (status IN ('draft', 'sent', 'accepted', 'declined'))")
    expect(SQL).toContain("client_response IN ('accepted', 'declined')")
    expect(SQL).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_change_orders_share_token')
    expect(SQL).toContain('idx_change_orders_estimate_id')
    expect(SQL).toContain('idx_change_orders_company_id')
    expect(SQL).toMatch(/ip_address\s+inet/)
    expect(SQL).toMatch(/signed_content\s+jsonb\s+NOT NULL/)
    expect(SQL).toMatch(/signed_total\s+numeric\(12,2\) NOT NULL/)
    expect(SQL).toContain('CONSTRAINT change_order_signatures_one_per_change_order UNIQUE (change_order_id)')
  })

  it('cascades from estimates/companies like estimates do', () => {
    expect(SQL).toMatch(/estimate_id\s+uuid\s+NOT NULL REFERENCES public\.estimates\(id\) ON DELETE CASCADE/)
    expect(SQL).toMatch(/company_id\s+uuid\s+NOT NULL REFERENCES public\.companies\(id\) ON DELETE CASCADE/)
  })

  it('keeps view counters out of the concurrency token (updated_at trigger WHEN clause)', () => {
    expect(SQL).toContain('CREATE TRIGGER trg_change_orders_set_updated_at')
    expect(SQL).toContain("(to_jsonb(OLD) - 'view_count' - 'viewed_at' - 'updated_at')")
    expect(SQL).toContain('EXECUTE FUNCTION public.set_updated_at()')
  })

  it('blocks deleting a signed change order with P0010 and honours the erasure escape hatch', () => {
    const f = fn('block_signed_change_order_delete')
    expect(f).toContain("current_setting('app.allow_signed_estimate_delete', true) = 'on'")
    expect(f).toContain("RAISE EXCEPTION 'change_order_signed_undeletable' USING ERRCODE = 'P0010'")
    expect(SQL).toContain('BEFORE DELETE ON public.change_orders')
  })
})

describe('change_orders migration: RLS and grants', () => {
  it('has the company-member policy set on change_orders and change_order_items', () => {
    for (const t of ['change_orders', 'change_order_items']) {
      for (const op of ['select', 'insert', 'update', 'delete']) {
        expect(SQL).toContain(`CREATE POLICY "${t}_${op}" ON public.${t}`)
      }
    }
    expect(SQL).toContain('company_members.user_id = ( SELECT auth.uid() AS uid )')
  })

  it('lets members only SELECT signatures (no write policy, no write grant)', () => {
    expect(SQL).toContain('CREATE POLICY "change_order_signatures_select" ON public.change_order_signatures')
    expect(SQL).not.toMatch(/CREATE POLICY "change_order_signatures_(insert|update|delete)"/)
    expect(SQL).toContain('GRANT SELECT ON public.change_order_signatures TO authenticated')
    expect(SQL).not.toMatch(/GRANT [A-Z, ]*(INSERT|UPDATE|DELETE)[A-Z, ]* ON public\.change_order_signatures/)
  })

  it('adds the RESTRICTIVE owned-session and demo policies to every new table', () => {
    expect(SQL).toContain("ARRAY['change_orders', 'change_order_items', 'change_order_signatures']")
    expect(SQL).toContain('CREATE POLICY xtimator_owned_session ON public.%I AS RESTRICTIVE FOR ALL TO authenticated')
    expect(SQL).toContain('public.xtimator_session_active()')
    for (const p of ['demo_block_insert', 'demo_block_update', 'demo_block_delete']) {
      expect(SQL).toContain(`CREATE POLICY ${p} ON public.%I AS RESTRICTIVE`)
    }
    for (const p of ['demo_company_block_insert', 'demo_company_block_update', 'demo_company_block_delete']) {
      expect(SQL).toContain(`CREATE POLICY ${p} ON public.%I AS RESTRICTIVE`)
    }
  })

  it('revokes everything from anon on every new table and re-grants narrowly', () => {
    for (const t of ['change_orders', 'change_order_items', 'change_order_signatures']) {
      expect(SQL).toContain(`REVOKE ALL ON public.${t} FROM PUBLIC, anon, authenticated;`)
      expect(SQL).toContain(`GRANT ALL ON public.${t} TO service_role;`)
    }
    expect(SQL).not.toMatch(/GRANT [^;]* TO [^;]*\banon\b/)
  })
})

describe('change_orders migration: RPCs', () => {
  it('create_change_order: SECURITY INVOKER, locks the estimate, requires accepted + current', () => {
    const f = fn('create_change_order')
    expect(f).toContain('SECURITY INVOKER')
    expect(f).toContain('FOR UPDATE')
    expect(f).toContain("v_is_current IS NOT TRUE OR v_client_response IS DISTINCT FROM 'accepted'")
    expect(f).toContain('COALESCE(MAX(number), 0) + 1')
    expect(f).toContain("ERRCODE = 'P0014'")
    expect(f).toContain("ERRCODE = 'P0016'")
    expect(SQL).toContain('GRANT EXECUTE ON FUNCTION public.create_change_order(uuid) TO authenticated, service_role')
  })

  it('save_change_order_atomic: locked / conflict / not found, totals like computeChangeOrderTotals', () => {
    const f = fn('save_change_order_atomic')
    expect(f).toContain('SECURITY INVOKER')
    expect(f).toContain('FOR UPDATE')
    expect(f).toContain("RAISE EXCEPTION 'change_order_locked' USING ERRCODE = 'P0011'")
    expect(f).toContain("RAISE EXCEPTION 'change_order_conflict' USING ERRCODE = 'P0012'")
    expect(f).toContain("RAISE EXCEPTION 'change_order_not_found' USING ERRCODE = 'P0013'")
    expect(f).toContain('IF v_has_signature OR v_client_response IS NOT NULL THEN')
    expect(f).toContain('p_expected_updated_at IS NOT NULL AND v_locked_updated_at <> p_expected_updated_at')
    expect(f).toContain('floor(v_qty * v_price * 100 + 0.5) / 100')
    expect(f).toContain('v_taxable_sum * COALESCE(v_tax_rate, 0))')
    expect(f).toContain('updated_at = GREATEST(clock_timestamp()')
    expect(SQL).toContain(
      'GRANT EXECUTE ON FUNCTION public.save_change_order_atomic(uuid, uuid, timestamptz, jsonb, jsonb) TO authenticated, service_role',
    )
  })

  it('sign_change_order_atomic: SECURITY DEFINER, service_role only, all guards and writes', () => {
    const f = fn('sign_change_order_atomic')
    expect(f).toContain('SECURITY DEFINER')
    expect(f).toContain('AND share_token = p_share_token')
    expect(f).toContain("v_est_response IS DISTINCT FROM 'accepted'")
    expect(f).toContain("RAISE EXCEPTION 'contract_not_accepted' USING ERRCODE = 'P0014'")
    expect(f).toContain("RAISE EXCEPTION 'change_order_already_responded' USING ERRCODE = 'P0015'")
    expect(f).toContain("RAISE EXCEPTION 'change_order_conflict' USING ERRCODE = 'P0012'")
    expect(f).toContain('INSERT INTO public.change_order_signatures')
    expect(f).toContain("SET client_response = 'accepted', responded_at = now(), status = 'accepted'")
    expect(f).toContain('UPDATE public.projects SET total = v_contract_total')
    expect(f).toContain("'change_order_signed'")
    expect(f).toContain("'snapshot_sha256', p_snapshot_sha256")
    // Guards run before the signature insert.
    expect(f.indexOf('P0014')).toBeLessThan(f.indexOf('INSERT INTO public.change_order_signatures'))
    expect(f.indexOf('P0015')).toBeLessThan(f.indexOf('INSERT INTO public.change_order_signatures'))
    expect(f.indexOf('P0012')).toBeLessThan(f.indexOf('INSERT INTO public.change_order_signatures'))
    expect(SQL).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.sign_change_order_atomic\(\n\s+uuid, uuid, timestamptz, text, text, text, inet, text, jsonb, numeric, text\n\) FROM PUBLIC, anon, authenticated;/,
    )
    expect(SQL).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.sign_change_order_atomic\([^)]*\) TO service_role;/,
    )
  })

  it('bump_change_order_view: service_role only and never touches updated_at', () => {
    const f = fn('bump_change_order_view')
    expect(f).toContain('SECURITY DEFINER')
    expect(f).toContain('view_count = COALESCE(view_count, 0) + 1')
    expect(f).toContain('viewed_at = COALESCE(viewed_at, now())')
    expect(f).not.toContain('updated_at')
    expect(SQL).toContain('REVOKE ALL ON FUNCTION public.bump_change_order_view(uuid) FROM PUBLIC, anon, authenticated;')
    expect(SQL).toContain('GRANT EXECUTE ON FUNCTION public.bump_change_order_view(uuid) TO service_role;')
  })
})

describe('change_orders migration: SQLSTATE registry', () => {
  it('documents P0010-P0016 in the header and no other migration uses them', () => {
    for (const code of ['P0010', 'P0011', 'P0012', 'P0013', 'P0014', 'P0015', 'P0016']) {
      expect(SQL.slice(0, SQL.indexOf('CREATE TABLE'))).toContain(code)
    }
    const others = readdirSync(MIGRATIONS).filter((f) => f !== '20261117000001_change_orders.sql')
    for (const file of others) {
      const text = readFileSync(join(MIGRATIONS, file), 'utf8')
      expect(text, file).not.toMatch(/ERRCODE = 'P001[0-6]'/)
    }
  })
})
