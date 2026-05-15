/**
 * HETZNER-04: GET /api/health — liveness + readiness endpoint.
 *
 * Used by:
 *   - Docker HEALTHCHECK directive (Plan 68-01 Dockerfile)
 *   - Hetzner runbook smoke step (docs/HETZNER-DEPLOY.md)
 *   - Future external uptime monitors (v3.2)
 *
 * Contract:
 *   - 200 + { ok: true, db: 'ok', storage: 'ok', commit } when both probes succeed
 *   - 503 + { ok: false, db, storage, commit, error } when either probe fails
 *
 * Storage probe MUST go through `getServerStorage()` (Phase 66 abstraction) —
 * never call the raw Supabase storage client directly. That keeps the future
 * Hetzner Object Storage / S3 swap a single config change.
 *
 * `commit` is read from `process.env.GIT_SHA` (set by the deploy script —
 * see `docs/HETZNER-DEPLOY.md` step 7) and falls back to 'unknown' so a
 * misconfigured deploy still answers /api/health rather than 500-ing.
 */

import { NextResponse } from 'next/server'
import { getServerStorage } from '@/lib/storage'
import { createServiceClient } from '@/lib/supabase/service'

// Health must never be cached — always reflect live state.
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Supabase PostgrestError isn't a subclass of Error; it's a plain object
// with a `.message` field. Falling back to String(e) on those would yield
// "[object Object]", which is useless in /api/health responses. Prefer
// `.message` when present on either Error subclasses or PostgrestError-like
// shapes; fall back to String(e) only for genuinely opaque values.
function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message: unknown }).message
    if (typeof m === 'string' && m.length > 0) return m
  }
  return String(e)
}

export async function GET() {
  const commit = process.env.GIT_SHA ?? 'unknown'
  let db: 'ok' | 'fail' = 'ok'
  let storage: 'ok' | 'fail' = 'ok'
  let error: string | undefined

  // DB probe: cheapest possible SELECT against a table guaranteed to exist
  // post-Phase-61 bootstrap. Any error (connection, RLS, missing table)
  // collapses into db=fail.
  try {
    const supabase = createServiceClient()
    if (!supabase) {
      throw new Error('service client unavailable (env vars missing)')
    }
    const { error: dbErr } = await supabase
      .from('companies')
      .select('id')
      .limit(1)
    if (dbErr) throw dbErr
  } catch (e) {
    db = 'fail'
    error = `db: ${errorMessage(e)}`
  }

  // Storage probe: list root of the public 'logos' bucket via the abstraction.
  // Works for both STORAGE_PROVIDER=supabase (Supabase Storage) and
  // STORAGE_PROVIDER=s3 (Hetzner Object Storage / any S3-compatible target).
  try {
    const storageClient = getServerStorage()
    await storageClient.list('logos', '')
  } catch (e) {
    storage = 'fail'
    const msg = errorMessage(e)
    error = error ? `${error}; storage: ${msg}` : `storage: ${msg}`
  }

  const ok = db === 'ok' && storage === 'ok'
  return NextResponse.json(
    { ok, db, storage, commit, ...(error && { error }) },
    { status: ok ? 200 : 503 },
  )
}
