import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SQL = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260602000003_backfill_company_whatsapp_owner_phone.sql'),
  'utf8'
)

describe('company_whatsapp owner_phone migration', () => {
  it('backfills owner_phone from existing companies without overwriting explicit owner phones', () => {
    expect(SQL).toMatch(/WITH\s+normalized_companies/i)
    expect(SQL).toMatch(/FROM\s+companies/i)
    expect(SQL).toMatch(/INSERT\s+INTO\s+company_whatsapp\s*\(\s*company_id,\s*owner_phone,\s*status\s*\)/i)
    expect(SQL).toMatch(/ON\s+CONFLICT\s*\(\s*company_id\s*\)\s+DO\s+UPDATE/i)
    expect(SQL).toMatch(/COALESCE\s*\(\s*company_whatsapp\.owner_phone,\s*EXCLUDED\.owner_phone\s*\)/i)
    expect(SQL).toMatch(/WHERE\s+company_whatsapp\.owner_phone\s+IS\s+NULL/i)
    expect(SQL).toMatch(/existing\.company_id\s+<>\s+company_whatsapp\.company_id/i)
  })
})
