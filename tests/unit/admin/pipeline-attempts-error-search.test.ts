// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'

const migration = (file: string) => readFileSync(`supabase/migrations/${file}`, 'utf8')
const failedAttempt = '6d000000-0000-4000-8000-000000000001'
const successfulAttempt = '6d000000-0000-4000-8000-000000000002'

it('appends searchable errors to the v2 summary while retaining its row shape, status, grants and RLS', async () => {
  const db = new PGlite()
  const columns = () => db.query<{ column_name: string; data_type: string }>(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pipeline_attempts'
    ORDER BY ordinal_position
  `)
  try {
    await db.exec(`
      CREATE ROLE qa_unprivileged;
      CREATE TABLE public.pipeline_events (
        attempt_id uuid NOT NULL, created_at timestamptz NOT NULL, user_id uuid,
        company_id uuid, project_id uuid, estimate_id uuid, input_type text, step text,
        status text, duration_ms integer, retry_count integer, error_message text, error_code text
      );
      ALTER TABLE public.pipeline_events ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA public TO qa_unprivileged;
      GRANT SELECT ON public.pipeline_events TO qa_unprivileged;
      INSERT INTO public.pipeline_events (attempt_id, created_at, step, status, error_message, error_code) VALUES
        ('${failedAttempt}', '2026-11-24 12:00:00+00', 'transcribe', 'failed', 'older timeout', 'first-code'),
        ('${failedAttempt}', '2026-11-24 12:00:01+00', 'transcribe', 'failed', 'older timeout', 'first-code'),
        ('${failedAttempt}', '2026-11-24 12:00:02+00', 'analyze', 'failed', 'later failure', 'later-code'),
        ('${failedAttempt}', '2026-11-24 12:00:03+00', 'generate_estimate', 'succeeded', NULL, NULL),
        ('${successfulAttempt}', '2026-11-24 12:00:04+00', 'generate_estimate', 'succeeded', NULL, NULL);
    `)
    await db.exec(migration('20260707000001_pipeline_attempts_terminal_status_v2.sql'))
    await db.exec('GRANT SELECT ON public.pipeline_attempts TO qa_unprivileged;')
    const oldColumns = (await columns()).rows
    const oldProjection = oldColumns.map(column => column.column_name).join(', ')
    const oldRows = (await db.query(`SELECT ${oldProjection} FROM public.pipeline_attempts ORDER BY attempt_id`)).rows

    await db.exec(migration('20261124160000_pipeline_attempts_error_search.sql'))
    expect((await columns()).rows).toEqual([...oldColumns,
      { column_name: 'error_message', data_type: 'text' }, { column_name: 'error_code', data_type: 'text' },
    ])
    expect((await db.query(`SELECT ${oldProjection} FROM public.pipeline_attempts ORDER BY attempt_id`)).rows).toEqual(oldRows)

    const errors = (await db.query(`
      SELECT attempt_id, step_reached, terminal_status, error_message, error_code
      FROM public.pipeline_attempts WHERE error_message ILIKE $1 OR error_code ILIKE $2
    `, ['%older timeout%', '%later-code%'])).rows
    expect(errors).toEqual([{ attempt_id: failedAttempt, step_reached: 'generate_estimate', terminal_status: 'failed',
      error_message: 'later failure\nolder timeout', error_code: 'first-code\nlater-code' }])
    expect((await db.query('SELECT attempt_id FROM public.pipeline_attempts WHERE error_message ILIKE $1', ['%older timeout%'])).rows)
      .toEqual([{ attempt_id: failedAttempt }])
    expect((await db.query('SELECT attempt_id FROM public.pipeline_attempts WHERE error_code ILIKE $1', ['%later-code%'])).rows)
      .toEqual([{ attempt_id: failedAttempt }])
    const successful = (await db.query('SELECT error_message, error_code FROM public.pipeline_attempts WHERE attempt_id = $1', [successfulAttempt])).rows
    expect(successful).toEqual([{ error_message: null, error_code: null }])

    await db.exec('SET ROLE qa_unprivileged;')
    expect((await db.query('SELECT attempt_id, error_message, error_code FROM public.pipeline_attempts')).rows).toEqual([])
  } finally {
    await db.close()
  }
})
