// tests/unit/signature-evidence-retention-migration.test.ts
// Security-hardening S3 (audit finding A): static contract test for the
// 20260729000001 migration, mirroring the repo's existing migration-content-
// test pattern (company-members-migration.test.ts,
// phase160-public-url-contract-migration.test.ts) — there is no live-DB
// integration harness for migrations in this repo, so these assertions
// pin the SQL file's shape against the locked design decisions instead.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATION_PATH = join(
  process.cwd(),
  'supabase/migrations/20260729000001_signature_evidence_retention.sql'
)
const SQL = readFileSync(MIGRATION_PATH, 'utf8')

describe('signature evidence retention migration (S3) — shape', () => {
  it('defines the trigger function block_signed_estimate_delete', () => {
    expect(SQL).toContain('CREATE OR REPLACE FUNCTION public.block_signed_estimate_delete()')
    expect(SQL).toMatch(/RETURNS\s+TRIGGER/)
  })

  it('is a BEFORE DELETE row trigger on public.estimates', () => {
    expect(SQL).toMatch(/BEFORE\s+DELETE\s+ON\s+public\.estimates/i)
    expect(SQL).toMatch(/FOR\s+EACH\s+ROW/i)
    expect(SQL).toContain('EXECUTE FUNCTION public.block_signed_estimate_delete()')
  })

  it('idempotent: DROP TRIGGER IF EXISTS before CREATE TRIGGER, CREATE OR REPLACE FUNCTION', () => {
    expect(SQL).toMatch(/DROP TRIGGER IF EXISTS trg_estimates_block_signed_delete ON public\.estimates/)
    expect(SQL).toContain('CREATE TRIGGER trg_estimates_block_signed_delete')
    expect(SQL).toContain('CREATE OR REPLACE FUNCTION')
  })

  it('raises estimate_signed_undeletable when a signature exists for OLD.id', () => {
    expect(SQL).toMatch(/RAISE EXCEPTION 'estimate_signed_undeletable'/)
    expect(SQL).toMatch(/estimate_signatures WHERE estimate_id = OLD\.id/)
  })

  it('uses an ERRCODE that does not collide with save_estimate_atomic\'s P0001-P0004', () => {
    expect(SQL).toMatch(/USING ERRCODE = 'P0005'/)
    expect(SQL).not.toMatch(/ERRCODE = 'P000[1-4]'/)
  })

  it('has the app.allow_signed_estimate_delete escape hatch, missing_ok=true', () => {
    expect(SQL).toMatch(
      /current_setting\('app\.allow_signed_estimate_delete',\s*true\)\s*=\s*'on'/
    )
  })

  it('escape hatch bypasses the guard by returning OLD before the signature check', () => {
    const escapeHatchIdx = SQL.indexOf("current_setting('app.allow_signed_estimate_delete'")
    const raiseIdx = SQL.indexOf("RAISE EXCEPTION 'estimate_signed_undeletable'")
    expect(escapeHatchIdx).toBeGreaterThan(-1)
    expect(raiseIdx).toBeGreaterThan(-1)
    expect(escapeHatchIdx).toBeLessThan(raiseIdx)
  })

  it('documents that cascaded deletes from projects/companies are also blocked by design', () => {
    expect(SQL).toMatch(/cascad(e|ed|ing)/i)
    expect(SQL).toMatch(/projects/i)
  })

  it('carries the repo\'s "Authored-only" / not-applied-here convention', () => {
    expect(SQL).toMatch(/Authored-only/i)
    expect(SQL).toMatch(/NOT applied here/i)
    expect(SQL).toMatch(/supabase db push/i)
  })

  it('Secret handling (CLAUDE.md): no API keys, signing secrets, or sb_secret_/sk-ant-/whsec_ patterns', () => {
    expect(SQL).not.toMatch(/whsec_/)
    expect(SQL).not.toMatch(/sk-ant-/)
    expect(SQL).not.toMatch(/sb_secret_/)
    expect(SQL).not.toMatch(/sk_(test|live)_/)
  })
})

describe('fix-pack F2, finding #2 — erase_company_for_compliance (GoTrue hard-delete escape hatch)', () => {
  it('defines erase_company_for_compliance(p_company_id uuid) RETURNS void', () => {
    expect(SQL).toContain(
      'CREATE OR REPLACE FUNCTION public.erase_company_for_compliance(p_company_id uuid)'
    )
    expect(SQL).toMatch(/RETURNS\s+void/)
  })

  it('is SECURITY DEFINER with search_path pinned', () => {
    expect(SQL).toMatch(/erase_company_for_compliance[\s\S]{0,120}LANGUAGE plpgsql\nSECURITY DEFINER/)
    expect(SQL).toMatch(/erase_company_for_compliance[\s\S]{0,200}SET search_path = public, pg_temp/)
  })

  it('sets the escape-hatch GUC tx-locally (set_config with is_local=true) before deleting', () => {
    expect(SQL).toMatch(
      /set_config\('app\.allow_signed_estimate_delete',\s*'on',\s*true\)/
    )
    const setConfigIdx = SQL.indexOf(
      "set_config('app.allow_signed_estimate_delete', 'on', true)"
    )
    const deleteCompanyIdx = SQL.indexOf('DELETE FROM public.companies WHERE id = p_company_id')
    expect(setConfigIdx).toBeGreaterThan(-1)
    expect(deleteCompanyIdx).toBeGreaterThan(-1)
    expect(setConfigIdx).toBeLessThan(deleteCompanyIdx)
  })

  it('deletes the company row (the sanctioned cascade path to erase evidence-bearing data)', () => {
    expect(SQL).toMatch(/DELETE FROM public\.companies WHERE id = p_company_id/)
  })

  it('revokes EXECUTE from PUBLIC/anon/authenticated and explicitly GRANTs to service_role', () => {
    expect(SQL).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.erase_company_for_compliance\(uuid\) FROM PUBLIC, anon, authenticated/
    )
    expect(SQL).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.erase_company_for_compliance\(uuid\) TO service_role/
    )
    // GRANT must come after REVOKE.
    const revokeIdx = SQL.indexOf(
      'REVOKE EXECUTE ON FUNCTION public.erase_company_for_compliance(uuid)'
    )
    const grantIdx = SQL.indexOf(
      'GRANT EXECUTE ON FUNCTION public.erase_company_for_compliance(uuid)'
    )
    expect(revokeIdx).toBeGreaterThan(-1)
    expect(grantIdx).toBeGreaterThan(revokeIdx)
  })

  it('is documented as the ONLY sanctioned deletion path for evidence-bearing data', () => {
    expect(SQL).toMatch(/ONLY sanctioned/)
  })

  it('header documents the two-step erasure runbook: erase_company_for_compliance per owned company, THEN auth.admin.deleteUser', () => {
    expect(SQL).toMatch(/GDPR\/CCPA erasure runbook/i)
    expect(SQL).toMatch(/erase_company_for_compliance/)
    expect(SQL).toMatch(/auth\.admin\.deleteUser/)
    // The runbook must document erase_company_for_compliance as step 1 and
    // deleteUser as step 2, not the other way around.
    const runbookIdx = SQL.indexOf('GDPR/CCPA erasure runbook')
    const step1Idx = SQL.indexOf('erase_company_for_compliance', runbookIdx)
    // The runbook mentions auth.admin.deleteUser BEFORE step 1 too (explaining
    // why calling it first fails) — the step-2 occurrence we care about is the
    // one that comes AFTER erase_company_for_compliance is introduced.
    const step2Idx = SQL.indexOf('auth.admin.deleteUser', step1Idx)
    expect(runbookIdx).toBeGreaterThan(-1)
    expect(step1Idx).toBeGreaterThan(runbookIdx)
    expect(step2Idx).toBeGreaterThan(step1Idx)
  })

  it('header states that deleting the auth user FIRST fails by design', () => {
    expect(SQL).toMatch(/FIRST[\s\S]{0,80}(WILL FAIL|fails?)[\s\S]{0,40}(by design|BY DESIGN)/)
  })

  it('header points to lib/actions/settings.ts as the wired caller of the two-step order', () => {
    expect(SQL).toMatch(/lib\/actions\/settings\.ts/)
  })
})
