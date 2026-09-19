// =============================================================================
// lib/blog/generator.ts
//
// Auto-blog generation (autoblog-parity XT-06, XT-13). Xtimator is a single
// site, so there is no tenancy here and no super-admin gate; the AI key is the
// platform's existing OpenRouter credential (MASTER D-05).
//
// Shape ported from xkedule/server/services/blog-generator.ts and
// skaleclub/server/lib/blog-generator.ts, which between them define what this
// pipeline has to do:
//
//   pillar (+ optional RSS item) -> topic -> content -> sanitise + length check
//   -> image (best effort) -> draft or publish -> job row with stage timings
//
// Two rules the ports exist to enforce, both learned the hard way elsewhere:
//   - The model's HTML is NEVER trusted. The prompt asks for a tag subset; the
//     allowlist is what enforces it.
//   - A run that cannot produce a good post FAILS rather than publishing a bad
//     one. Yesterday's post staying up beats two lines under our name.
// =============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'

import { requireServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey } from '@/lib/platform-config'
import { OPENROUTER_BASE, OR_DEFAULTS } from '@/lib/ai/openrouter-client'
import { withAiRetry } from '@/lib/blog/ai-retry'
import {
  AiEmptyResponseError,
  getPlainTextLength,
  sanitizeBlogHtml,
  slugifyTitle,
} from '@/lib/blog/content-validator'
import { isRunDue } from '@/lib/blog/schedule'
import { generateCoverImage } from '@/lib/blog/cover-image'
import {
  assignPillar,
  buildInternalLinksSection,
  buildKeywordDedupSection,
  buildPillarSection,
  sanitizeGeneratedLinks,
  todaySection,
  type InternalLink,
  type PillarAssignment,
} from '@/lib/blog/prompt'
import { selectNextRssItem, type RssItemRow } from '@/lib/blog/rss'
import { logAiUsage } from '@/lib/blog/ai-usage-log'
import { sendDraftForApproval, type TelegramSettingsRow } from '@/lib/blog/telegram'
import {
  MAX_PLAIN_TEXT_CHARS,
  MIN_PLAIN_TEXT_CHARS,
  STALE_LOCK_MS,
  type BlogJobSource,
  type BlogSkipReason,
  type DurationsMs,
} from '@/lib/blog/contract'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = SupabaseClient<any, any, any>

export interface BlogSettingsRow {
  enabled: boolean
  posts_per_day: number
  posting_hour: number | null
  timezone: string
  last_run_at: string | null
  seo_keywords: string
  prompt_style: string
  system_prompt: string
  enable_trend_analysis: boolean
  rss_enabled: boolean
  auto_publish: boolean
  text_model: string
  image_model: string
}

export type GenerationResult =
  | { status: 'generated'; postId: string; jobId: string; title: string }
  | { status: 'skipped'; reason: BlogSkipReason }
  | { status: 'failed'; error: string; jobId?: string }

const SITE_HEADERS = {
  'HTTP-Referer': 'https://xtimator.com',
  'X-Title': 'Xtimator',
}

const WORDS_PER_MINUTE = 200

/** The internal links a generated post may use. */
const INTERNAL_LINKS: InternalLink[] = [
  { label: 'How Xtimator works', path: '/#how-it-works' },
  { label: 'Pricing', path: '/pricing' },
  { label: 'Start a free estimate', path: '/signup' },
]

export async function loadBlogSettings(svc: ServiceClient): Promise<BlogSettingsRow | null> {
  const { data } = await svc.from('blog_settings').select('*').eq('id', 1).maybeSingle()
  return (data as BlogSettingsRow | null) ?? null
}

/**
 * Take the generation lock, if it is free or stale.
 *
 * One conditional UPDATE, so two concurrent callers cannot both win: the
 * database decides and the loser gets no row back. This has to be in the
 * database rather than in module state — Next.js runs multiple instances, and
 * the Inngest sweep and the HTTP break-glass endpoint can fire at once (XT-13).
 */
async function acquireLock(svc: ServiceClient, now: Date): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MS).toISOString()
  const { data } = await svc
    .from('blog_settings')
    .update({ lock_acquired_at: now.toISOString(), updated_at: now.toISOString() })
    .eq('id', 1)
    .or(`lock_acquired_at.is.null,lock_acquired_at.lt.${staleBefore}`)
    .select('id')
  return Array.isArray(data) && data.length > 0
}

async function releaseLock(svc: ServiceClient): Promise<void> {
  await svc
    .from('blog_settings')
    .update({ lock_acquired_at: null, updated_at: new Date().toISOString() })
    .eq('id', 1)
}

/** One chat call against the configured text model, retried and timed. */
async function callTextModel(
  apiKey: string,
  model: string,
  system: string,
  prompt: string,
): Promise<string> {
  const startedAt = Date.now()
  try {
    const text = await withAiRetry('blog_post', async (signal) => {
      const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...SITE_HEADERS,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          // Ask for the real upstream USD cost so the ledger is not a guess.
          usage: { include: true },
        }),
        signal,
      })

      if (!res.ok) {
        const body = await res.text().catch(() => 'unknown')
        const error = new Error(`OpenRouter blog text failed (${res.status}): ${body.slice(0, 300)}`)
        // The status rides on the error because that is what the retry
        // classifier reads: a 502 is worth another attempt, a 401 never is.
        ;(error as Error & { status?: number }).status = res.status
        throw error
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>
        usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
        error?: { message?: string }
      }
      if (json.error?.message) throw new Error(`OpenRouter blog text error: ${json.error.message}`)

      const content = json.choices?.[0]?.message?.content ?? ''
      // An empty completion is a provider hiccup, not a parse problem — typing
      // it is what lets the classifier retry instead of failing the run on a
      // confusing JSON error downstream.
      if (!content.trim()) throw new AiEmptyResponseError('Blog text returned an empty completion')

      void logAiUsage({
        step: 'blog_post',
        provider: 'openrouter',
        model,
        prompt,
        inputTokens: json.usage?.prompt_tokens ?? null,
        outputTokens: json.usage?.completion_tokens ?? null,
        costUsd: json.usage?.cost ?? null,
        status: 'success',
        durationMs: Date.now() - startedAt,
      })

      return content
    })
    return text
  } catch (err) {
    void logAiUsage({
      step: 'blog_post',
      provider: 'openrouter',
      model,
      prompt,
      status: 'failure',
      error: (err as Error).message,
      durationMs: Date.now() - startedAt,
    })
    throw err
  }
}

interface GeneratedPost {
  title: string
  content: string
  excerpt: string
  metaDescription: string
  focusKeyword: string
  tags: string
}

function parseGeneratedPost(raw: string): GeneratedPost {
  let cleaned = raw.trim()
  if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '')
  else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '')

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    throw new Error('Blog generation returned invalid JSON')
  }

  const str = (key: string): string => (typeof parsed[key] === 'string' ? (parsed[key] as string).trim() : '')
  const title = str('title')
  const content = str('content')
  if (!title || !content) throw new Error('Blog generation returned incomplete content')

  return {
    title,
    content,
    excerpt: str('excerpt'),
    metaDescription: str('metaDescription'),
    focusKeyword: str('focusKeyword'),
    tags: str('tags'),
  }
}

/** A slug nothing else already holds. */
async function uniqueSlug(svc: ServiceClient, title: string): Promise<string> {
  const base = slugifyTitle(title) || 'post'
  let slug = base
  let suffix = 2
  for (;;) {
    const { data } = await svc.from('blog_posts').select('id').eq('slug', slug).maybeSingle()
    if (!data) return slug
    slug = `${base}-${suffix}`
    suffix += 1
  }
}

function readingTimeMinutes(html: string): number {
  const words = html.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))
}

/** The system message for this run: voice, date, assignment, links, dedup. */
async function buildSystemMessage(
  svc: ServiceClient,
  settings: BlogSettingsRow,
  assignment: PillarAssignment,
  rssItem: RssItemRow | null,
): Promise<{ systemMessage: string; allowedLinkPaths: string[] }> {
  const { data: recentPosts } = await svc
    .from('blog_posts')
    .select('title, slug, status, focus_keyword')
    .order('created_at', { ascending: false })
    .limit(12)

  const posts = (recentPosts ?? []) as Array<{
    title: string
    slug: string
    status: string
    focus_keyword: string | null
  }>

  const links: InternalLink[] = [
    ...INTERNAL_LINKS,
    ...posts
      .filter((p) => p.status === 'published' && p.slug)
      .slice(0, 4)
      .map((p) => ({ label: p.title, path: `/blog/${p.slug}` })),
  ]

  const sections: string[] = [
    'You write the Xtimator blog. Xtimator is estimating software for US service contractors — landscaping, plumbing, electrical, HVAC, painting, roofing, cleaning, concrete. Your reader runs one of those businesses and prices jobs for a living. Write for them, not for a general audience, and never pitch the product in place of saying something useful.',
    todaySection(new Date(), settings.timezone || 'UTC'),
    buildPillarSection(assignment),
  ]

  if (rssItem) {
    sections.push(
      [
        "SOURCE MATERIAL. Today's subject comes from this item. Use it as the STARTING POINT for an original post written for our reader — react to it, explain what it means for their bids, add what we know. Do NOT summarise or paraphrase the source, and do not present yourself as its author.",
        `- Headline: ${rssItem.title}`,
        `- Summary: ${rssItem.summary ?? '(none supplied)'}`,
        `- Origin: ${rssItem.url}`,
      ].join('\n'),
    )
  }

  if (settings.seo_keywords.trim()) {
    sections.push(`TARGET SEO KEYWORDS. Optimize naturally for: ${settings.seo_keywords.trim()}`)
  }
  if (settings.system_prompt.trim()) {
    sections.push(`EDITORIAL GUIDE (follow strictly):\n${settings.system_prompt.trim()}`)
  }
  if (settings.prompt_style.trim()) {
    sections.push(`STYLE AND TONE:\n${settings.prompt_style.trim()}`)
  }

  sections.push(buildInternalLinksSection(links))

  const keywordDedup = buildKeywordDedupSection(posts.map((p) => p.focus_keyword ?? '').filter(Boolean))
  if (keywordDedup) sections.push(keywordDedup)

  if (posts.length > 0) {
    sections.push(
      `ALREADY PUBLISHED. Do NOT repeat or closely rephrase these topics:\n${posts
        .map((p) => `- "${p.title}"`)
        .join('\n')}`,
    )
  }

  // Feedback loop: the editor's past decisions steer the next post.
  const { data: feedback } = await svc
    .from('blog_post_feedback')
    .select('post_title, verdict, reason')
    .order('created_at', { ascending: false })
    .limit(16)

  const decisions = (feedback ?? []) as Array<{ post_title: string; verdict: string; reason: string | null }>
  const approved = decisions.filter((f) => f.verdict === 'approved').slice(0, 8)
  const rejected = decisions.filter((f) => f.verdict === 'rejected').slice(0, 8)

  if (approved.length > 0) {
    sections.push(
      `LEARN FROM APPROVALS. These were approved; write more in this direction:\n${approved
        .map((f) => `- "${f.post_title}"`)
        .join('\n')}`,
    )
  }
  if (rejected.length > 0) {
    sections.push(
      `LEARN FROM REJECTIONS. These were rejected; avoid whatever led to it:\n${rejected
        .map((f) => `- "${f.post_title}"${f.reason ? ` (reason: ${f.reason})` : ''}`)
        .join('\n')}`,
    )
  }

  return { systemMessage: sections.join('\n\n'), allowedLinkPaths: links.map((l) => l.path) }
}

/**
 * Generate one post.
 *
 * `trigger: 'cron'` applies the cadence gates; 'manual' bypasses them, so a
 * failure at 09:00 is fixable at 09:05 rather than tomorrow. The lock applies to
 * both — that is what stops two callers producing two posts for one slot.
 */
export async function generateBlogPost(opts: {
  trigger: 'cron' | 'manual'
  svc?: ServiceClient
  now?: Date
}): Promise<GenerationResult> {
  const svc = opts.svc ?? requireServiceClient()
  const now = opts.now ?? new Date()

  const settings = await loadBlogSettings(svc)
  if (!settings) return { status: 'skipped', reason: 'no_settings' }

  // Unlike the multi-tenant products, there is one key and one house model here,
  // so an unconfigured model is a blank to fill in rather than a reason to
  // refuse: fall back to the same default every other AI feature uses. A missing
  // KEY is still a hard stop — there is nothing to fall back to.
  const textModel = settings.text_model || OR_DEFAULTS.chat

  if (opts.trigger === 'cron') {
    if (!settings.enabled) return { status: 'skipped', reason: 'disabled' }
    if (settings.posts_per_day <= 0) return { status: 'skipped', reason: 'posts_per_day_zero' }

    if (settings.posting_hour !== null && settings.posting_hour !== undefined) {
      // A pinned hour beats the elapsed-time cadence: the old rule only said
      // "at least N hours since the last run", so the time of day drifted
      // forward with every run and nothing could promise a publishing time.
      const decision = isRunDue({
        now,
        timeZone: settings.timezone || 'UTC',
        postingHour: settings.posting_hour,
        postsPerDay: settings.posts_per_day,
        lastRunAt: settings.last_run_at ? new Date(settings.last_run_at) : null,
      })
      if (!decision.due) return { status: 'skipped', reason: 'outside_posting_hour' }
    } else if (settings.last_run_at) {
      const hoursSince = (now.getTime() - new Date(settings.last_run_at).getTime()) / 36e5
      if (hoursSince < 24 / settings.posts_per_day) return { status: 'skipped', reason: 'too_soon' }
    }
  }

  const apiKey = await getIntegrationKey('openrouter')
  if (!apiKey) return { status: 'skipped', reason: 'not_configured' }

  if (!(await acquireLock(svc, now))) return { status: 'skipped', reason: 'locked' }

  const timings: Partial<DurationsMs> = {}
  const runStartedAt = Date.now()
  let jobId: string | undefined

  try {
    // RSS is optional (MASTER D-02): a selection supplies the subject, the
    // pillar still decides the treatment, and nothing pending means the pillar
    // rotation runs on its own.
    let rssItem: RssItemRow | null = null
    if (settings.rss_enabled) {
      try {
        rssItem = (await selectNextRssItem(svc, settings.seo_keywords, now))?.item ?? null
      } catch {
        // A missing table or a transient read must never cost the day's post.
      }
    }

    const { data: recentJobs } = await svc
      .from('blog_generation_jobs')
      .select('pillar_id')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(12)

    const recentPillarIds = ((recentJobs ?? []) as Array<{ pillar_id: string | null }>)
      .map((j) => j.pillar_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)

    const source: BlogJobSource = rssItem ? 'rss' : 'pillar'

    const { data: jobRow, error: jobError } = await svc
      .from('blog_generation_jobs')
      .insert({
        status: 'running',
        trigger: opts.trigger,
        source,
        rss_item_id: rssItem?.id ?? null,
        model: textModel,
        started_at: now.toISOString(),
      })
      .select('id')
      .single()
    if (jobError) throw new Error(jobError.message)
    jobId = (jobRow as { id: string }).id

    // The rotation seed varies per run but is stable for a given job, so a test
    // with a fixed id is deterministic.
    const assignment = assignPillar(recentPillarIds, { hasRssItem: !!rssItem }, hashSeed(jobId))
    await svc.from('blog_generation_jobs').update({ pillar_id: assignment.pillar.id }).eq('id', jobId)

    // The cadence clock advances on ATTEMPT, not on success: a persistently
    // failing configuration retries at its posts-per-day rate instead of
    // burning the AI budget every time the sweep runs.
    if (opts.trigger === 'cron') {
      await svc
        .from('blog_settings')
        .update({ last_run_at: now.toISOString(), updated_at: now.toISOString() })
        .eq('id', 1)
    }

    const { systemMessage, allowedLinkPaths } = await buildSystemMessage(svc, settings, assignment, rssItem)

    const topicStartedAt = Date.now()
    const topic = (
      await callTextModel(
        apiKey,
        textModel,
        systemMessage,
        rssItem
          ? 'Turn the SOURCE MATERIAL into a single blog post topic, shaped by the EDITORIAL ASSIGNMENT. The topic must be about what the source means for our reader, not a retelling of it. Return ONLY the topic, nothing else.'
          : 'Propose a single blog post topic that fulfils the EDITORIAL ASSIGNMENT: its pillar, its title shape, one subject. Return ONLY the topic, nothing else.',
      )
    ).trim()
    timings.topic = Date.now() - topicStartedAt

    const contentStartedAt = Date.now()
    const raw = await callTextModel(
      apiKey,
      textModel,
      systemMessage,
      [
        `Write the post about "${topic}", following the EDITORIAL ASSIGNMENT (pillar, title shape, length target).`,
        settings.enable_trend_analysis
          ? 'Where it is natural, anchor the piece in the season implied by TODAY IS above.'
          : '',
        'Return strictly valid JSON with exactly these fields:',
        '{"title":"","content":"","excerpt":"","metaDescription":"","focusKeyword":"","tags":""}',
        'content is publication-ready HTML using ONLY <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <a>, <blockquote>. No <h1>, no <html>/<body>, no images, no scripts.',
        'tags is a comma-separated list of 3-5 tags. metaDescription is under 160 characters.',
        'Do not wrap the JSON in a markdown code block.',
      ]
        .filter(Boolean)
        .join('\n\n'),
    )
    timings.content = Date.now() - contentStartedAt

    const generated = parseGeneratedPost(raw)

    // Link sanitising runs first because it needs the anchors intact; the
    // allowlist then drops every tag outside the editorial set. The prompt only
    // ASKS for that set — this is what enforces it.
    generated.content = sanitizeGeneratedLinks(generated.content, allowedLinkPaths)
    generated.content = sanitizeBlogHtml(generated.content)

    // Length is measured AFTER stripping tags, so markup cannot pad a stub into
    // looking like an article.
    const plainTextLength = getPlainTextLength(generated.content)
    if (plainTextLength < MIN_PLAIN_TEXT_CHARS || plainTextLength > MAX_PLAIN_TEXT_CHARS) {
      throw new Error(
        `content_length_out_of_bounds: ${plainTextLength} plain-text chars, expected ${MIN_PLAIN_TEXT_CHARS}-${MAX_PLAIN_TEXT_CHARS}`,
      )
    }

    const slug = await uniqueSlug(svc, generated.title)
    const publish = settings.auto_publish

    // Autoblog-parity XT-06. Best-effort by construction: a post with no cover
    // is a worse post, but a generation that DIED because an image model was
    // busy is a missed publication, which is worse still. generateCoverImage
    // never throws — null simply means no cover this time.
    //
    // The image and upload stages are not split here because they are one call:
    // reporting a fabricated boundary between them would be worse than
    // reporting the honest total under `image`.
    const coverStarted = Date.now()
    const cover = await generateCoverImage(svc, {
      model: settings.image_model,
      title: generated.title,
      focusKeyword: generated.focusKeyword || null,
      slug,
    })
    // null when the stage was SKIPPED (no model configured) — which is not the
    // same as an image that took 0ms, and the contract distinguishes them.
    timings.image = settings.image_model?.trim() ? Date.now() - coverStarted : null
    timings.upload = 0

    const { data: postRow, error: postError } = await svc
      .from('blog_posts')
      .insert({
        title: generated.title,
        slug,
        content: generated.content,
        excerpt: generated.excerpt || null,
        meta_description: generated.metaDescription || null,
        focus_keyword: generated.focusKeyword || null,
        tags: generated.tags || null,
        author_name: 'Xtimator',
        cover_image_url: cover?.url ?? null,
        reading_time_minutes: readingTimeMinutes(generated.content),
        ai_generated: true,
        status: publish ? 'published' : 'draft',
        published_at: publish ? now.toISOString() : null,
      })
      .select('id')
      .single()
    if (postError) throw new Error(postError.message)
    const postId = (postRow as { id: string }).id

    // Only AFTER the insert succeeds. Marking earlier would burn the item on a
    // run that then failed, and the subject would never be covered.
    if (rssItem) {
      await svc
        .from('blog_rss_items')
        .update({ status: 'used', used_at: now.toISOString(), used_post_id: postId })
        .eq('id', rssItem.id)
        .then(undefined, () => undefined)
    }

    await svc
      .from('blog_generation_jobs')
      .update({
        status: 'completed',
        post_id: postId,
        topic,
        completed_at: new Date().toISOString(),
        durations_ms: { ...timings, total: Date.now() - runStartedAt },
      })
      .eq('id', jobId)

    // A draft used to land in the admin with nobody told about it. Push it to
    // the approval chats when the site opted in. Fire-and-forget: the post is
    // already saved, and a notification problem must never fail the run.
    if (!publish) {
      void notifyDraftAwaitingApproval(svc, {
        id: postId,
        title: generated.title,
        excerpt: generated.excerpt || null,
        pillarLabel: assignment.pillar.label,
      })
    }

    return { status: 'generated', postId, jobId, title: generated.title }
  } catch (err) {
    const message = (err as Error).message
    if (jobId) {
      await svc
        .from('blog_generation_jobs')
        .update({
          status: 'failed',
          error_message: message,
          completed_at: new Date().toISOString(),
          // Whatever finished before the failure: "the content call took 90s and
          // then we died" is the difference between diagnosing and guessing.
          durations_ms: { ...timings, total: Date.now() - runStartedAt },
        })
        .eq('id', jobId)
        .then(undefined, () => undefined)
    }
    return { status: 'failed', error: message, jobId }
  } finally {
    // Releasing must not throw out of the generator: the post is already saved,
    // and a stuck lock expires on its own in ten minutes.
    await releaseLock(svc).then(undefined, () => undefined)
  }
}


/**
 * Push a generated draft to Telegram, if approvals are configured. Every failure
 * is swallowed: this runs after the post is saved, and the post is what matters.
 */
async function notifyDraftAwaitingApproval(
  svc: ServiceClient,
  draft: { id: string; title: string; excerpt: string | null; pillarLabel: string },
): Promise<void> {
  try {
    const { data } = await svc.from('telegram_settings').select('*').eq('id', 1).maybeSingle()
    const settings = data as TelegramSettingsRow | null
    if (!settings) return

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://xtimator.com'
    const result = await sendDraftForApproval(settings, draft, siteUrl)
    if (result && result.failures.length > 0) {
      console.warn(
        `[autoblog] draft notification: ${result.delivered} delivered, failures: ` +
          result.failures.map((f) => `${f.chatId}: ${f.message}`).join('; '),
      )
    }
  } catch (err) {
    console.warn('[autoblog] draft notification failed (non-fatal):', (err as Error).message)
  }
}

/** A stable numeric seed from a uuid, for the deterministic pillar rotation. */
function hashSeed(id: string): number {
  let h = 5381
  for (let i = 0; i < id.length; i++) h = (h * 33) ^ id.charCodeAt(i)
  return Math.abs(h | 0)
}

/**
 * Generate a post WITHOUT persisting anything (autoblog-parity XT-10).
 *
 * Same settings, same pillar rotation, same system message, same link
 * sanitiser, same tag allowlist and the same length bounds as a real run — a
 * preview that skipped any of those would show something the pipeline would
 * never actually publish, which is worse than no preview.
 *
 * What it deliberately does NOT do:
 *   - take the generation lock. A preview must not block the scheduled run
 *     behind someone poking at the panel.
 *   - write a job row. That table records what the SCHEDULE did, and filling it
 *     with discarded previews makes the history useless and the cadence stats
 *     wrong.
 *   - advance last_run_at, mark an RSS item used, or generate a cover. Nothing
 *     is being published, and a cover costs a second model call for an image
 *     that would be thrown away.
 *
 * The rotation seed comes from the clock rather than a job id: there is no job,
 * and it only decides which pillar and title shape this preview demonstrates.
 */
export async function previewBlogPost(): Promise<
  | { ok: false; reason: string }
  | {
      ok: true
      preview: {
        title: string
        slug: string
        content: string
        excerpt: string
        metaDescription: string
        focusKeyword: string
        tags: string
        pillarId: string
        source: BlogJobSource
        topic: string
        rssItemId: string | null
      }
    }
> {
  const svc = requireServiceClient()
  const settings = await loadBlogSettings(svc)
  if (!settings) return { ok: false, reason: 'no_settings' }

  const apiKey = await getIntegrationKey('openrouter').catch(() => null)
  const textModel = settings.text_model?.trim()
  if (!apiKey || !textModel) return { ok: false, reason: 'not_configured' }

  try {
    let rssItem: RssItemRow | null = null
    if (settings.rss_enabled) {
      try {
        rssItem = (await selectNextRssItem(svc, settings.seo_keywords, new Date()))?.item ?? null
      } catch {
        // A missing table or a transient read must never cost the preview.
      }
    }

    const { data: recentJobs } = await svc
      .from('blog_generation_jobs')
      .select('pillar_id')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(12)
    const recentPillarIds = ((recentJobs ?? []) as Array<{ pillar_id: string | null }>)
      .map((j) => j.pillar_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)

    const assignment = assignPillar(recentPillarIds, { hasRssItem: !!rssItem }, Date.now())
    const { systemMessage, allowedLinkPaths } = await buildSystemMessage(svc, settings, assignment, rssItem)

    const topic = (
      await callTextModel(
        apiKey,
        textModel,
        systemMessage,
        rssItem
          ? 'Turn the SOURCE MATERIAL into a single blog post topic, shaped by the EDITORIAL ASSIGNMENT. The topic must be about what the source means for our reader, not a retelling of it. Return ONLY the topic, nothing else.'
          : 'Propose a single blog post topic that fulfils the EDITORIAL ASSIGNMENT: its pillar, its title shape, one subject. Return ONLY the topic, nothing else.',
      )
    ).trim()

    const raw = await callTextModel(
      apiKey,
      textModel,
      systemMessage,
      [
        `Write the post about "${topic}", following the EDITORIAL ASSIGNMENT (pillar, title shape, length target).`,
        'Return strictly valid JSON with exactly these fields:',
        '{"title":"","content":"","excerpt":"","metaDescription":"","focusKeyword":"","tags":""}',
        'content is publication-ready HTML using ONLY <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <a>, <blockquote>. No <h1>, no <html>/<body>, no images, no scripts.',
        'tags is a comma-separated list of 3-5 tags. metaDescription is under 160 characters.',
        'Do not wrap the JSON in a markdown code block.',
      ].join('\n\n'),
    )

    const generated = parseGeneratedPost(raw)
    generated.content = sanitizeBlogHtml(sanitizeGeneratedLinks(generated.content, allowedLinkPaths))

    const plainTextLength = getPlainTextLength(generated.content)
    if (plainTextLength < MIN_PLAIN_TEXT_CHARS || plainTextLength > MAX_PLAIN_TEXT_CHARS) {
      return {
        ok: false,
        reason: `content_length_out_of_bounds: ${plainTextLength} plain-text chars, expected ${MIN_PLAIN_TEXT_CHARS}-${MAX_PLAIN_TEXT_CHARS}`,
      }
    }

    return {
      ok: true,
      preview: {
        ...generated,
        // The real slug, uniqueness included, so saving cannot surprise anyone
        // with a different URL than the one previewed.
        slug: await uniqueSlug(svc, generated.title),
        pillarId: assignment.pillar.id,
        source: rssItem ? 'rss' : 'pillar',
        topic,
        rssItemId: rssItem?.id ?? null,
      },
    }
  } catch (err) {
    return { ok: false, reason: (err as Error).message }
  }
}
