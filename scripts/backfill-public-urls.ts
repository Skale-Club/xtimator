/**
 * Phase 160 (PUBURL-01): one-time, idempotent backfill of companies.slug +
 * estimates.public_slug_token for rows created before the friendly-URL
 * migration landed. Safe to re-run (WHERE ... IS NULL guards + retry-on-23505
 * collision handling on the partial unique indexes).
 *
 * This is an OPERATIONAL step -- NOT run automatically by this plan or CI.
 * Per this repo's convention (migrations are authored-only, carried by
 * CI->GHCR->Coolify, never `supabase db push`-ed from a dev machine), this
 * script is run ONCE against the target environment AFTER the migration
 * (20260708000001_phase160_public_url_contract.sql) has actually landed there.
 *
 * Usage: npx tsx scripts/backfill-public-urls.ts
 */
import 'dotenv/config'
import { requireServiceClient } from '@/lib/supabase/service'
import { generatePublicSlugToken, slugify } from '@/lib/estimate/public-url'

const PAGE_SIZE = 200
const MAX_SLUG_ATTEMPTS = 25
const MAX_TOKEN_ATTEMPTS = 5

async function backfillCompanySlugs(): Promise<void> {
  const svc = requireServiceClient()
  let processed = 0

  for (;;) {
    const { data: rows, error } = await svc
      .from('companies')
      .select('id, name')
      .is('slug', null)
      .limit(PAGE_SIZE)
    if (error) throw error
    if (!rows || rows.length === 0) break

    for (const row of rows as { id: string; name: string | null }[]) {
      const base = slugify(row.name || 'company') || 'company'
      let updated = false
      for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
        const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
        const { error: updateErr } = await svc
          .from('companies')
          .update({ slug: candidate })
          .eq('id', row.id)
        if (!updateErr) {
          updated = true
          break
        }
        if ((updateErr as { code?: string }).code !== '23505') throw updateErr
      }
      if (!updated) {
        throw new Error(`backfill: exhausted ${MAX_SLUG_ATTEMPTS} slug attempts for company ${row.id}`)
      }
      processed++
    }
  }
  console.log(`[backfill] companies.slug: ${processed} rows updated`)
}

async function backfillEstimateTokens(): Promise<void> {
  const svc = requireServiceClient()
  let processed = 0

  for (;;) {
    const { data: rows, error } = await svc
      .from('estimates')
      .select('id')
      .is('public_slug_token', null)
      .limit(PAGE_SIZE)
    if (error) throw error
    if (!rows || rows.length === 0) break

    for (const row of rows as { id: string }[]) {
      let updated = false
      for (let attempt = 0; attempt < MAX_TOKEN_ATTEMPTS; attempt++) {
        const token = generatePublicSlugToken()
        const { error: updateErr } = await svc
          .from('estimates')
          .update({ public_slug_token: token })
          .eq('id', row.id)
        if (!updateErr) {
          updated = true
          break
        }
        if ((updateErr as { code?: string }).code !== '23505') throw updateErr
      }
      if (!updated) {
        throw new Error(`backfill: exhausted ${MAX_TOKEN_ATTEMPTS} token attempts for estimate ${row.id}`)
      }
      processed++
    }
  }
  console.log(`[backfill] estimates.public_slug_token: ${processed} rows updated`)
}

async function main(): Promise<void> {
  await backfillCompanySlugs()
  await backfillEstimateTokens()
  console.log('[backfill] done.')
}

main().catch((err) => {
  console.error('[backfill] failed:', err)
  process.exit(1)
})
