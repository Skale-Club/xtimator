import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * EVENT-01 (static SQL contract): the pipeline_events migration must ship
 * deny-all RLS + a single super-admin SELECT policy + the 14 D-02 columns +
 * the 3 CHECK enums + the 4 named indexes.
 *
 * Static-source-read pattern (mirrors tests/unit/inngest/transcribe-audio-job.test.ts).
 * RED until the migration file exists with the full DDL (Wave 0 Task 1 delivers it).
 */

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260529000001_phase92_pipeline_events.sql'
)

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, 'utf8')
}

const COLUMNS = [
  'id',
  'attempt_id',
  'company_id',
  'project_id',
  'estimate_id',
  'user_id',
  'input_type',
  'step',
  'status',
  'error_message',
  'error_code',
  'provider',
  'duration_ms',
  'retry_count',
  'created_at',
] as const

const INDEXES = [
  'pipeline_events_attempt_id',
  'pipeline_events_company_created',
  'pipeline_events_created_at',
  'pipeline_events_status',
] as const

describe('EVENT-01: pipeline_events migration static contract', () => {
  it('creates the table public.pipeline_events', () => {
    const sql = readMigration()
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.pipeline_events/)
  })

  it('enables row level security (deny-all base)', () => {
    const sql = readMigration()
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/)
  })

  it('declares a super-admin FOR SELECT policy via platform_admins + auth.uid()', () => {
    const sql = readMigration()
    expect(sql).toMatch(/FOR SELECT/)
    expect(sql).toMatch(/platform_admins/)
    expect(sql).toMatch(/auth\.uid\(\)/)
  })

  it('declares NO client INSERT/UPDATE/DELETE policy (deny-all writes)', () => {
    const sql = readMigration()
    // No write policy granted to authenticated/anon — service role bypasses RLS.
    expect(sql).not.toMatch(/FOR\s+INSERT/i)
    expect(sql).not.toMatch(/FOR\s+UPDATE/i)
    expect(sql).not.toMatch(/FOR\s+DELETE/i)
  })

  it('contains all 14 D-02 column names', () => {
    const sql = readMigration()
    for (const col of COLUMNS) {
      expect(sql, `missing column: ${col}`).toMatch(new RegExp(`\\b${col}\\b`))
    }
  })

  it('constrains input_type / step / status via CHECK enums', () => {
    const sql = readMigration()
    // input_type values
    for (const v of ['recording', 'photo', 'manual_text']) {
      expect(sql, `missing input_type value: ${v}`).toContain(`'${v}'`)
    }
    // step values
    for (const v of [
      'save_recording',
      'transcribe',
      'analyze',
      'generate_estimate',
      'preview_redirect',
    ]) {
      expect(sql, `missing step value: ${v}`).toContain(`'${v}'`)
    }
    // status values
    for (const v of ['started', 'succeeded', 'failed']) {
      expect(sql, `missing status value: ${v}`).toContain(`'${v}'`)
    }
    // provider values (nullable)
    for (const v of ['openai', 'openrouter', 'anthropic']) {
      expect(sql, `missing provider value: ${v}`).toContain(`'${v}'`)
    }
    expect(sql).toMatch(/CHECK/)
  })

  it('creates the 4 named indexes', () => {
    const sql = readMigration()
    for (const idx of INDEXES) {
      expect(sql, `missing index: ${idx}`).toMatch(new RegExp(`\\b${idx}\\b`))
    }
  })

  it('does NOT add an updated_at column (append-only rows are never updated — D-01)', () => {
    const sql = readMigration()
    // Strip SQL line comments so a documenting "-- No updated_at: ..." header note
    // doesn't false-positive — we only forbid an actual updated_at column declaration.
    const code = sql.replace(/--[^\n]*/g, '')
    expect(code).not.toMatch(/\bupdated_at\b/)
  })
})
