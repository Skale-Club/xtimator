// Phase 163 (SENDHUB-03): migration-contract test.
// Asserts the 20260709000001_phase163_send_hub_delivery_schema.sql migration
// (a) adds the `format` column as NULLABLE (dormant-first), (b) widens the
// channel CHECK to include copy/open/download/manual, and (c) widens the
// provider CHECK to include 'client'. Never asserts on runtime DB state --
// this is a pure file-contents assertion, byte-cheap.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

const MIGRATION_PATH = 'supabase/migrations/20260709000001_phase163_send_hub_delivery_schema.sql'

describe('SENDHUB-03: Phase 163 estimate_deliveries widening migration', () => {
  it('the migration file exists', () => {
    expect(existsSync(MIGRATION_PATH), `${MIGRATION_PATH} must exist (created by 163-02)`).toBe(true)
  })

  const source = existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, 'utf8') : ''

  it('adds a nullable `format` column (dormant-first, no DEFAULT, no NOT NULL)', () => {
    expect(source).toMatch(/ADD COLUMN IF NOT EXISTS format TEXT/i)
    expect(source).toMatch(/format IN \(\s*'online_link'\s*,\s*'pdf'\s*,\s*'plain_text'\s*\)/i)
    expect(source).toMatch(/format IS NULL/i)
    // Dormant-first contract: never SET NOT NULL on format.
    expect(source).not.toMatch(/ALTER\s+COLUMN\s+format\s+SET\s+NOT\s+NULL/i)
    // No DEFAULT on the format column either (existing rows must read as NULL/legacy).
    expect(source).not.toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+format\s+TEXT[^;]*DEFAULT/i)
  })

  it('widens the channel CHECK to include copy/open/download/manual', () => {
    expect(source).toMatch(/DROP CONSTRAINT IF EXISTS estimate_deliveries_channel_check/i)
    expect(source).toMatch(/ADD CONSTRAINT estimate_deliveries_channel_check[\s\S]*?CHECK\s*\(\s*channel IN \([^)]*'email'[^)]*'sms'[^)]*'whatsapp'[^)]*'copy'[^)]*'open'[^)]*'download'[^)]*'manual'[^)]*\)/i)
  })

  it('widens the provider CHECK to include client', () => {
    expect(source).toMatch(/DROP CONSTRAINT IF EXISTS estimate_deliveries_provider_check/i)
    expect(source).toMatch(/ADD CONSTRAINT estimate_deliveries_provider_check[\s\S]*?CHECK\s*\(\s*provider IN \([^)]*'resend'[^)]*'twilio'[^)]*'meta'[^)]*'client'[^)]*\)/i)
  })
})
