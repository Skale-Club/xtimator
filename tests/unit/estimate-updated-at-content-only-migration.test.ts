// Static contract test for 20261121120000_estimate_updated_at_content_only.sql
// (no live-DB harness exists for migrations in this repo, so the SQL's shape is
// pinned instead, as in tests/unit/lock-at-acceptance-migration.test.ts).
//
// estimates.updated_at is the content version: the client's signature carries
// the value the page rendered (contentVersion) and the sign route refuses a
// mismatch with 409 estimate_updated. Any column a NON-content path writes must
// therefore be excluded from the trigger, or that write silently invalidates the
// client's signature and the owner's in-flight editor save.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n')

const SQL = read('supabase/migrations/20261121120000_estimate_updated_at_content_only.sql')

function excludedColumns(side: 'OLD' | 'NEW'): string[] {
  const match = SQL.match(new RegExp(`\\(to_jsonb\\(${side}\\)([^)]*)\\)`))
  expect(match).not.toBeNull()
  return [...match![1].matchAll(/-\s*'([a-z_]+)'/g)].map((m) => m[1])
}

// Each entry: a non-content write path and the estimates columns it sets.
const NON_CONTENT_WRITES: Array<{ path: string; pattern: RegExp; columns: string[] }> = [
  {
    path: 'app/estimate/[token]/actions.ts',
    pattern: /\.update\(\{ viewed_at: /,
    columns: ['viewed_at'],
  },
  {
    path: 'lib/actions/estimate.ts',
    pattern: /\.update\(\{ sent_at: new Date\(\)\.toISOString\(\), share_expires_at: /,
    columns: ['sent_at', 'share_expires_at'],
  },
  {
    path: 'app/api/estimates/[id]/send/route.ts',
    pattern: /\.update\(\{ sent_at: sentAt, share_expires_at: /,
    columns: ['sent_at', 'share_expires_at'],
  },
  {
    path: 'app/api/estimates/[id]/send-sms/route.ts',
    pattern: /\.update\(\{ sent_at: new Date\(\)\.toISOString\(\) \}\)/,
    columns: ['sent_at', 'share_expires_at'],
  },
  {
    path: 'lib/actions/estimate.ts',
    pattern: /share_password_hash: hashSharePassword\(trimmed\),\s+share_password_set_at:/,
    columns: ['share_password_hash', 'share_password_set_at'],
  },
]

describe('estimate updated_at counts only content changes', () => {
  it('excludes the same columns on both sides of the comparison', () => {
    expect(excludedColumns('OLD')).toEqual(excludedColumns('NEW'))
  })

  it('keeps the earlier engagement-counter exclusions', () => {
    const cols = excludedColumns('NEW')
    for (const c of ['view_count', 'last_viewed_at', 'updated_at']) expect(cols).toContain(c)
  })

  it.each(NON_CONTENT_WRITES)('excludes what $path writes ($columns)', ({ path, pattern, columns }) => {
    // The write still exists where we think it does (guards against this test
    // silently going stale when the code moves).
    expect(read(path)).toMatch(pattern)
    const cols = excludedColumns('NEW')
    for (const c of columns) expect(cols).toContain(c)
  })

  it('does not exclude any column the documents render or the client signs', () => {
    const cols = excludedColumns('NEW')
    for (const content of [
      'summary', 'notes', 'timeline', 'payment_terms', 'warranty_terms', 'total', 'subtotal',
      'tax_rate', 'discount_value', 'deposit_value', 'estimate_date', 'estimate_number',
      'presentation_settings', 'language', 'client_response', 'is_current',
    ]) {
      expect(cols).not.toContain(content)
    }
  })

  it('reuses the shared set_updated_at() without redefining it', () => {
    expect(SQL).toContain('EXECUTE FUNCTION public.set_updated_at();')
    expect(SQL).not.toMatch(/CREATE (OR REPLACE )?FUNCTION/)
    expect(SQL).toContain('DROP TRIGGER IF EXISTS trg_estimates_set_updated_at ON public.estimates;')
  })
})
