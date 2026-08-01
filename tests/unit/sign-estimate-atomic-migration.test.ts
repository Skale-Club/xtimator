// tests/unit/sign-estimate-atomic-migration.test.ts
// Security-hardening S2 (audit finding b): static contract test for the
// 20260729000002 migration, mirroring the repo's existing migration-content-
// test pattern (tests/unit/signature-evidence-retention-migration.test.ts,
// tests/unit/company-members-migration.test.ts) — there is no live-DB
// integration harness for migrations in this repo, so these assertions pin
// the SQL file's shape against the locked design decisions instead.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATION_PATH = join(
  process.cwd(),
  'supabase/migrations/20260729000002_sign_estimate_atomic.sql'
)
const SQL = readFileSync(MIGRATION_PATH, 'utf8')

describe('sign_estimate_atomic migration (S2) — shape', () => {
  it('defines sign_estimate_atomic with the expected parameter list', () => {
    expect(SQL).toContain('CREATE OR REPLACE FUNCTION public.sign_estimate_atomic(')
    expect(SQL).toMatch(/p_estimate_id\s+uuid/)
    expect(SQL).toMatch(/p_share_token\s+uuid/)
    expect(SQL).toMatch(/p_expected_updated_at\s+timestamptz/)
    expect(SQL).toMatch(/p_signer_name\s+text/)
    expect(SQL).toMatch(/p_signer_email\s+text/)
    expect(SQL).toMatch(/p_signature_data\s+text/)
    expect(SQL).toMatch(/p_ip_address\s+inet/)
    expect(SQL).toMatch(/p_user_agent\s+text/)
    expect(SQL).toMatch(/p_signed_content\s+jsonb/)
    expect(SQL).toMatch(/p_signed_total\s+numeric/)
    expect(SQL).toMatch(/p_snapshot_sha256\s+text/)
  })

  it('locks the estimates row FOR UPDATE, matched by id AND share_token', () => {
    expect(SQL).toMatch(/FROM public\.estimates\s+WHERE id = p_estimate_id\s+AND share_token = p_share_token\s+FOR UPDATE/)
  })

  it('raises all three distinct guard exceptions with non-colliding ERRCODEs', () => {
    expect(SQL).toMatch(/RAISE EXCEPTION 'estimate_not_found' USING ERRCODE = 'P0006'/)
    expect(SQL).toMatch(/RAISE EXCEPTION 'estimate_conflict' USING ERRCODE = 'P0007'/)
    expect(SQL).toMatch(/RAISE EXCEPTION 'estimate_already_responded' USING ERRCODE = 'P0008'/)
    // Must not collide with save_estimate_atomic (P0001-P0004) or
    // block_signed_estimate_delete (P0005).
    expect(SQL).not.toMatch(/ERRCODE = 'P000[1-5]'/)
  })

  it('the not_found check precedes the conflict check, which precedes the already_responded check', () => {
    const notFoundIdx = SQL.indexOf("RAISE EXCEPTION 'estimate_not_found'")
    const conflictIdx = SQL.indexOf("RAISE EXCEPTION 'estimate_conflict'")
    const alreadyRespondedIdx = SQL.indexOf("RAISE EXCEPTION 'estimate_already_responded'")
    expect(notFoundIdx).toBeGreaterThan(-1)
    expect(conflictIdx).toBeGreaterThan(-1)
    expect(alreadyRespondedIdx).toBeGreaterThan(-1)
    expect(notFoundIdx).toBeLessThan(conflictIdx)
    expect(conflictIdx).toBeLessThan(alreadyRespondedIdx)
  })

  it('the conflict check compares the locked updated_at against p_expected_updated_at with IS DISTINCT FROM', () => {
    expect(SQL).toMatch(/v_locked_updated_at IS DISTINCT FROM p_expected_updated_at/)
  })

  it('the already-responded check ORs client_response IS NOT NULL with an estimate_signatures EXISTS check', () => {
    expect(SQL).toMatch(/estimate_signatures WHERE estimate_id = p_estimate_id/)
    expect(SQL).toMatch(/v_client_response IS NOT NULL OR v_has_signature/)
  })

  it('inserts the signature row and all its guards + the insert live in ONE function body (no separate helper functions)', () => {
    const createFnMatches = SQL.match(/CREATE OR REPLACE FUNCTION/g) ?? []
    expect(createFnMatches.length).toBe(1)

    expect(SQL).toMatch(/INSERT INTO public\.estimate_signatures\s*\(/)
    const insertIdx = SQL.indexOf('INSERT INTO public.estimate_signatures')
    const alreadyRespondedIdx = SQL.indexOf("RAISE EXCEPTION 'estimate_already_responded'")
    // The signature INSERT must come AFTER all three guards (nothing writes
    // before every check has passed).
    expect(insertIdx).toBeGreaterThan(alreadyRespondedIdx)
  })

  it('flips client_response to accepted + responded_at, and the project status, after the signature insert', () => {
    expect(SQL).toMatch(/SET client_response = 'accepted', responded_at = now\(\)/)
    expect(SQL).toMatch(/UPDATE public\.projects SET status = 'accepted'/)
  })

  it('logs both estimate_signed (with snapshot_sha256 in metadata) and estimate_accepted activity rows', () => {
    expect(SQL).toMatch(/'estimate_signed'/)
    expect(SQL).toMatch(/jsonb_build_object\('signer_name', p_signer_name, 'snapshot_sha256', p_snapshot_sha256\)/)
    expect(SQL).toMatch(/'estimate_accepted'/)
    expect(SQL).toMatch(/'estimate_accepted'[\s\S]{0,20}'\{\}'::jsonb/)
  })

  it('returns project_id, company_id, estimate_number, client_name', () => {
    expect(SQL).toMatch(/RETURN jsonb_build_object\(/)
    expect(SQL).toMatch(/'project_id',\s*v_project_id/)
    expect(SQL).toMatch(/'company_id',\s*v_company_id/)
    expect(SQL).toMatch(/'estimate_number',\s*v_estimate_number/)
    expect(SQL).toMatch(/'client_name',\s*v_client_name/)
  })

  it('is SECURITY DEFINER (a documented departure from save_estimate_atomic INVOKER) with search_path pinned', () => {
    // The function DEFINITION clause itself (not the header comment, which
    // legitimately discusses "SECURITY INVOKER" while explaining the
    // departure) must declare DEFINER.
    expect(SQL).toMatch(/LANGUAGE plpgsql\nSECURITY DEFINER/)
    expect(SQL).toMatch(/SET search_path = public, pg_temp/)
  })

  it('revokes EXECUTE from PUBLIC, anon, and authenticated (service-role only)', () => {
    expect(SQL).toMatch(/REVOKE EXECUTE ON FUNCTION public\.sign_estimate_atomic/)
    expect(SQL).toMatch(/FROM PUBLIC, anon, authenticated/)
  })

  it('fix-pack F2 (finding #8): explicitly GRANTs EXECUTE to service_role after the REVOKE, so it does not depend on default privileges', () => {
    const revokeIdx = SQL.indexOf('REVOKE EXECUTE ON FUNCTION public.sign_estimate_atomic')
    const grantIdx = SQL.indexOf('GRANT EXECUTE ON FUNCTION public.sign_estimate_atomic')
    expect(revokeIdx).toBeGreaterThan(-1)
    expect(grantIdx).toBeGreaterThan(-1)
    expect(grantIdx).toBeGreaterThan(revokeIdx)
    expect(SQL).toMatch(/GRANT EXECUTE ON FUNCTION public\.sign_estimate_atomic\([\s\S]*?\)\s*TO service_role/)
  })

  it('idempotent (CREATE OR REPLACE) and carries the repo\'s "Authored-only" / not-applied-here convention', () => {
    expect(SQL).toContain('CREATE OR REPLACE FUNCTION')
    expect(SQL).toMatch(/Authored-only/i)
    expect(SQL).toMatch(/NOT applied here/i)
    expect(SQL).toMatch(/supabase db push/i)
  })

  it('documents a COMMENT ON FUNCTION summarizing behavior + return shape', () => {
    expect(SQL).toMatch(/COMMENT ON FUNCTION public\.sign_estimate_atomic IS/)
  })

  it('Secret handling (CLAUDE.md): no API keys, signing secrets, or sb_secret_/sk-ant-/whsec_ patterns', () => {
    expect(SQL).not.toMatch(/whsec_/)
    expect(SQL).not.toMatch(/sk-ant-/)
    expect(SQL).not.toMatch(/sb_secret_/)
    expect(SQL).not.toMatch(/sk_(test|live)_/)
  })
})
