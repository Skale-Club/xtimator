/**
 * Auto-blog crons (autoblog-parity XT-09).
 *
 * Two functions, deliberately separate:
 *
 *   - autoBlogSweepJob runs hourly and lets the settings row decide whether a
 *     post is actually due. The cadence lives in the database, not in the cron
 *     expression, so changing posts-per-day or the posting hour takes effect on
 *     the next tick instead of requiring a deploy.
 *   - autoBlogRssFetchJob ingests feeds on its own schedule. Fetching is cheap
 *     and idempotent — the (source_id, guid) unique index does the
 *     de-duplication — and it has to keep running even while generation is
 *     paused, so that turning autopost back on does not start from an empty
 *     candidate list.
 *
 * Both follow this repo's cron discipline: everything inside step.run, and
 * neither ever throws out of the function. A generation that fails records
 * itself on its job row; a cron that throws just retries the same failure.
 *
 * There is an HTTP twin of the sweep at POST /api/blog/cron/generate. That is
 * not redundancy for its own sake: this repo has a documented history of a
 * missed Inngest re-sync silently stopping every event-triggered job, and the
 * database lock is what makes running both paths survivable.
 */
import { inngest } from '@/lib/inngest/client'
import { requireServiceClient } from '@/lib/supabase/service'
import { generateBlogPost } from '@/lib/blog/generator'
import { fetchAllRssSources } from '@/lib/blog/rss'
import { loadBlogSettings } from '@/lib/blog/generator'

export const autoBlogSweepJob = inngest.createFunction(
  {
    id: 'autoblog-sweep',
    triggers: [{ cron: '15 * * * *' }],
  },
  async ({ step }) => {
    return step.run('generate-blog-post-if-due', async () => {
      const result = await generateBlogPost({ trigger: 'cron' })
      if (result.status === 'skipped') {
        // Skips are the normal case — 23 of every 24 ticks — so this stays at
        // debug volume rather than logging an "error" every hour.
        return { status: 'skipped', reason: result.reason }
      }
      if (result.status === 'failed') {
        console.error('[autoblog] generation failed:', result.error)
        return { status: 'failed' }
      }
      console.log(`[autoblog] published "${result.title}" (post ${result.postId})`)
      return { status: 'generated', postId: result.postId }
    })
  },
)

export const autoBlogRssFetchJob = inngest.createFunction(
  {
    id: 'autoblog-rss-fetch',
    triggers: [{ cron: '45 */2 * * *' }],
  },
  async ({ step }) => {
    return step.run('fetch-rss-sources', async () => {
      const svc = requireServiceClient()
      const settings = await loadBlogSettings(svc)
      // No point opening sockets for a feature that is switched off.
      if (!settings?.rss_enabled) return { skipped: true }

      const summary = await fetchAllRssSources(svc)
      if (summary.errors.length > 0) {
        console.warn(
          `[autoblog-rss] ${summary.itemsUpserted} items from ${summary.sourcesProcessed} sources; ` +
            `${summary.errors.length} failing: ` +
            summary.errors.map((e) => `${e.sourceName}: ${e.message}`).join('; '),
        )
      }
      return {
        sources: summary.sourcesProcessed,
        upserted: summary.itemsUpserted,
        errors: summary.errors.length,
      }
    })
  },
)
