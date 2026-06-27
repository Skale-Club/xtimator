import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SQL = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260627000001_whatsapp_admin_registry_expand.sql'),
  'utf8'
)

describe('whatsapp_admin_registry_expand migration', () => {
  // ── Table creation ──────────────────────────────────────────────────────
  describe('tables', () => {
    it('creates whatsapp_company_configs', () => {
      expect(SQL).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+whatsapp_company_configs/i)
    })

    it('creates whatsapp_authorized_senders', () => {
      expect(SQL).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+whatsapp_authorized_senders/i)
    })
  })

  // ── Column contracts ────────────────────────────────────────────────────
  describe('whatsapp_company_configs columns', () => {
    it('has company_id with UNIQUE constraint and FK to companies', () => {
      expect(SQL).toMatch(/company_id\s+UUID\s+NOT\s+NULL\s+UNIQUE\s+REFERENCES\s+companies/i)
    })

    it('has status with CHECK constraint', () => {
      expect(SQL).toMatch(/status\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'pending_review'/i)
      expect(SQL).toMatch(/CHECK\s*\(\s*status\s+IN\s*\(\s*'pending_review',\s*'active',\s*'suspended'\s*\)\s*\)/i)
    })

    it('has delivery_format with CHECK constraint', () => {
      expect(SQL).toMatch(/delivery_format\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'share_link'/i)
      expect(SQL).toMatch(/CHECK\s*\(\s*delivery_format\s+IN\s*\(\s*'share_link',\s*'formatted_text',\s*'pdf_attachment'\s*\)\s*\)/i)
    })

    it('has nullable review_reason', () => {
      expect(SQL).toMatch(/review_reason\s+TEXT/i)
    })

    it('has timestamps', () => {
      expect(SQL).toMatch(/created_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+NOW\(\)/i)
      expect(SQL).toMatch(/updated_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+NOW\(\)/i)
    })
  })

  describe('whatsapp_authorized_senders columns', () => {
    it('has config_id FK to whatsapp_company_configs', () => {
      expect(SQL).toMatch(/config_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+whatsapp_company_configs/i)
    })

    it('has company_id FK to companies', () => {
      expect(SQL).toMatch(/company_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+companies/i)
    })

    it('has nullable user_id FK to auth.users', () => {
      expect(SQL).toMatch(/user_id\s+UUID\s+REFERENCES\s+auth\.users/i)
    })

    it('has phone_e164', () => {
      expect(SQL).toMatch(/phone_e164\s+TEXT\s+NOT\s+NULL/i)
    })

    it('has status with CHECK constraint', () => {
      expect(SQL).toMatch(/CHECK\s*\(\s*status\s+IN\s*\(\s*'pending_review',\s*'active',\s*'suspended'\s*\)\s*\)/i)
    })

    it('has nullable verified_at', () => {
      expect(SQL).toMatch(/verified_at\s+TIMESTAMPTZ/i)
    })

    it('has nullable created_by_admin', () => {
      expect(SQL).toMatch(/created_by_admin\s+BOOLEAN/i)
    })

    it('has nullable source_row_id for legacy traceability', () => {
      expect(SQL).toMatch(/source_row_id\s+UUID/i)
    })

    it('has timestamps', () => {
      expect(SQL).toMatch(/created_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+NOW\(\)/i)
      expect(SQL).toMatch(/updated_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+NOW\(\)/i)
    })
  })

  // ── RLS ─────────────────────────────────────────────────────────────────
  describe('RLS', () => {
    it('enables RLS on whatsapp_company_configs', () => {
      expect(SQL).toMatch(/ALTER\s+TABLE\s+whatsapp_company_configs\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)
    })

    it('enables RLS on whatsapp_authorized_senders', () => {
      expect(SQL).toMatch(/ALTER\s+TABLE\s+whatsapp_authorized_senders\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)
    })

    it('creates no authenticated tenant policy on either table', () => {
      // Deny-all: no FOR ALL/SELECT/INSERT/UPDATE/DELETE policy for authenticated role
      const policies = SQL.match(/CREATE\s+POLICY\s+.*ON\s+whatsapp_(company_configs|authorized_senders)/gi) ?? []
      expect(policies).toHaveLength(0)
    })
  })

  // ── Indexes ─────────────────────────────────────────────────────────────
  describe('indexes', () => {
    it('creates a partial unique index on active phone_e164', () => {
      expect(SQL).toMatch(/CREATE\s+UNIQUE\s+INDEX/i)
      expect(SQL).toMatch(/whatsapp_active_sender_phone_unique/i)
      expect(SQL).toMatch(/phone_e164/i)
      expect(SQL).toMatch(/WHERE\s+status\s*=\s*'active'/i)
    })

    it('creates a company/status lookup index', () => {
      expect(SQL).toMatch(/whatsapp_sender_company_status_idx/i)
    })
  })

  // ── Backfill: config per company ────────────────────────────────────────
  describe('backfill — config per company', () => {
    it('creates one config per distinct company_whatsapp.company_id', () => {
      expect(SQL).toMatch(/INSERT\s+INTO\s+whatsapp_company_configs/i)
      expect(SQL).toMatch(/DISTINCT\s+ON\s+\(cw\.company_id\)/i)
      expect(SQL).toMatch(/FROM\s+company_whatsapp\s+cw/i)
    })

    it('is idempotent via ON CONFLICT DO NOTHING', () => {
      expect(SQL).toMatch(/ON\s+CONFLICT\s*\(\s*company_id\s*\)\s+DO\s+NOTHING/i)
    })

    it('preserves existing active status as active', () => {
      expect(SQL).toMatch(/CASE\s+WHEN\s+cw\.status\s*=\s*'active'\s+THEN\s*'active'\s+ELSE\s*'pending_review'/i)
    })

    it('preserves existing delivery_format', () => {
      expect(SQL).toMatch(/COALESCE\s*\(\s*cw\.delivery_format,\s*'share_link'\s*\)/i)
    })
  })

  // ── Backfill: senders from owner_phone ──────────────────────────────────
  describe('backfill — senders from owner_phone', () => {
    it('copies non-null owner_phone rows into authorized senders', () => {
      expect(SQL).toMatch(/INSERT\s+INTO\s+whatsapp_authorized_senders/i)
      expect(SQL).toMatch(/cw\.owner_phone/i)
      expect(SQL).toMatch(/WHERE\s+cw\.owner_phone\s+IS\s+NOT\s+NULL/i)
    })

    it('sets source_row_id to the legacy row id', () => {
      expect(SQL).toMatch(/source_row_id/i)
      expect(SQL).toMatch(/cw\.id/i)
    })

    it('sets created_by_admin to FALSE for migrated rows', () => {
      // FALSE is the last value in the SELECT list for the senders INSERT
      expect(SQL).toMatch(/FALSE\s+FROM\s+company_whatsapp/i)
    })

    it('is idempotent via ON CONFLICT DO NOTHING', () => {
      // The second INSERT (senders) uses ON CONFLICT DO NOTHING
      const senderInsert = SQL.match(/INSERT\s+INTO\s+whatsapp_authorized_senders[\s\S]*?ON\s+CONFLICT[\s\S]*?;/i)
      expect(senderInsert).toBeTruthy()
      expect(senderInsert![0]).toMatch(/ON\s+CONFLICT\s+DO\s+NOTHING/i)
    })
  })

  // ── Multi-phone classification ──────────────────────────────────────────
  describe('multi-phone classification', () => {
    it('marks companies with multiple distinct phones as pending_review', () => {
      expect(SQL).toMatch(/COUNT\s*\(\s*DISTINCT\s+cw\.owner_phone\s*\)/i)
      expect(SQL).toMatch(/multiple\s+distinct\s+owner\s+phones/i)
    })

    it('sets review_reason on multi-phone companies', () => {
      expect(SQL).toMatch(/review_reason\s*=\s*'Multiple distinct owner phones detected; requires admin review'/i)
    })

    it('marks corresponding senders as pending_review too', () => {
      // Second UPDATE block for senders
      const senderUpdate = SQL.match(/UPDATE\s+whatsapp_authorized_senders[\s\S]*?;/i)
      expect(senderUpdate).toBeTruthy()
      expect(senderUpdate![0]).toMatch(/pending_review/i)
    })
  })

  // ── Legacy preservation ─────────────────────────────────────────────────
  describe('legacy preservation', () => {
    it('does not drop or truncate company_whatsapp', () => {
      expect(SQL).not.toMatch(/DROP\s+(TABLE|COLUMN).*company_whatsapp/i)
      expect(SQL).not.toMatch(/TRUNCATE.*company_whatsapp/i)
    })

    it('does not delete from company_whatsapp', () => {
      expect(SQL).not.toMatch(/DELETE\s+FROM\s+company_whatsapp/i)
    })

    it('does not update company_whatsapp', () => {
      expect(SQL).not.toMatch(/UPDATE\s+company_whatsapp/i)
    })
  })

  // ── Safety: no remote apply ─────────────────────────────────────────────
  describe('safety', () => {
    it('contains no supabase CLI apply commands', () => {
      expect(SQL).not.toMatch(/supabase\s+db\s+push/i)
      expect(SQL).not.toMatch(/supabase\s+db\s+push/i)
    })

    it('is idempotent (uses IF NOT EXISTS and ON CONFLICT)', () => {
      expect(SQL).toMatch(/IF\s+NOT\s+EXISTS/gi)
      expect(SQL).toMatch(/ON\s+CONFLICT/gi)
    })
  })
})
