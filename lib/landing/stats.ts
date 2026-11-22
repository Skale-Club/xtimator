import 'server-only'
import { unstable_cache } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { getDemoCompanyId } from '@/lib/demo/config'
import { MIN_MEDIAN_SAMPLES } from '@/lib/estimate/journal-medians'

/**
 * Real numbers for the landing trust bar, computed from the database.
 * Every field is null when it is unavailable or zero, and the whole result is
 * null when the read fails: the landing page then simply hides the bar.
 */
export interface LandingStats {
  /** Companies (demo and test excluded) with at least one estimate. */
  contractors: number | null
  /** Estimates a client has been given: sent, viewed or answered. */
  estimatesSent: number | null
  /** Median minutes from a capture starting to its estimate being ready. */
  medianMinutes: number | null
}

const PAGE = 1000
const MAX_PAGES = 50
/** Same ceiling journal-medians uses: a longer gap is an abandoned attempt. */
const MAX_PLAUSIBLE_GAP_MS = 20 * 60_000
const WINDOW_DAYS = 90
const EVENT_LIMIT = 6000

export interface CaptureEventRow {
  attempt_id: string | null
  company_id: string | null
  step: string
  status: string
  created_at: string
}

/**
 * Median minutes from the first journal row of an attempt (the capture
 * starting) to the first `generate_estimate` success (the estimate ready).
 * Returns null with fewer than MIN_MEDIAN_SAMPLES usable attempts.
 */
export function computeMedianCaptureMinutes(
  rows: CaptureEventRow[],
  excludedCompanyIds: ReadonlySet<string> = new Set(),
): number | null {
  const byAttempt = new Map<string, CaptureEventRow[]>()
  for (const r of rows) {
    if (!r.attempt_id) continue
    if (r.company_id && excludedCompanyIds.has(r.company_id)) continue
    const list = byAttempt.get(r.attempt_id)
    if (list) list.push(r)
    else byAttempt.set(r.attempt_id, [r])
  }
  const gaps: number[] = []
  for (const list of byAttempt.values()) {
    const times = (status?: string) =>
      list
        .filter((r) => (status ? r.step === 'generate_estimate' && r.status === status : true))
        .map((r) => Date.parse(r.created_at))
        .filter(Number.isFinite)
    const start = Math.min(...times())
    const ready = times('succeeded')
    if (!ready.length || !Number.isFinite(start)) continue
    const gap = Math.min(...ready) - start
    if (gap > 0 && gap <= MAX_PLAUSIBLE_GAP_MS) gaps.push(gap)
  }
  if (gaps.length < MIN_MEDIAN_SAMPLES) return null
  gaps.sort((a, b) => a - b)
  const medianMs = gaps[Math.ceil(gaps.length * 0.5) - 1]
  return Math.max(1, Math.round(medianMs / 60_000))
}

/**
 * Demo and test companies, which never count as customers: the dedicated demo
 * company, admin-created street-sales demos (demo_estimate_quota set) and every
 * company mapped in demo_config.
 */
async function loadExcludedCompanyIds(svc: NonNullable<ReturnType<typeof createServiceClient>>) {
  const ids = new Set<string>([getDemoCompanyId()])
  const quota = await svc.from('companies').select('id').not('demo_estimate_quota', 'is', null)
  if (quota.error) throw quota.error
  for (const r of (quota.data ?? []) as Array<{ id: string }>) ids.add(r.id)
  const cfg = await svc.from('demo_config').select('company_id')
  if (cfg.error) throw cfg.error
  for (const r of (cfg.data ?? []) as Array<{ company_id: string | null }>) {
    if (r.company_id) ids.add(r.company_id)
  }
  return ids
}

async function computeLandingStats(): Promise<LandingStats> {
  const svc = createServiceClient()
  if (!svc) throw new Error('service client unavailable')
  const excluded = await loadExcludedCompanyIds(svc)
  const excludedList = `(${[...excluded].join(',')})`

  // Contractors: distinct companies that own at least one estimate.
  const companies = new Set<string>()
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await svc
      .from('estimates')
      .select('company_id')
      .order('id')
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as Array<{ company_id: string | null }>
    for (const r of rows) if (r.company_id && !excluded.has(r.company_id)) companies.add(r.company_id)
    if (rows.length < PAGE) break
  }

  const sent = await svc
    .from('estimates')
    .select('id', { count: 'exact', head: true })
    .not('company_id', 'in', excludedList)
    .or('sent_at.not.is.null,viewed_at.not.is.null,client_response.not.is.null')
  if (sent.error) throw sent.error

  let medianMinutes: number | null = null
  try {
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const events = await svc
      .from('pipeline_events')
      .select('attempt_id,company_id,step,status,created_at')
      .in('status', ['started', 'succeeded'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(EVENT_LIMIT)
    if (!events.error) {
      medianMinutes = computeMedianCaptureMinutes((events.data ?? []) as CaptureEventRow[], excluded)
    }
  } catch {
    medianMinutes = null // too thin or unreadable: the stat is simply omitted
  }

  const positive = (n: number | null | undefined) => (n && n > 0 ? n : null)
  return {
    contractors: positive(companies.size),
    estimatesSent: positive(sent.count),
    medianMinutes: positive(medianMinutes),
  }
}

// The cached function throws on failure so a failed read is never cached for
// an hour; getLandingStats turns that into null.
const cachedLandingStats = unstable_cache(computeLandingStats, ['landing-stats-v1'], {
  revalidate: 3600,
})

export async function getLandingStats(): Promise<LandingStats | null> {
  try {
    return await cachedLandingStats()
  } catch (err) {
    console.warn('[getLandingStats] failed, hiding the trust bar:', err)
    return null
  }
}
