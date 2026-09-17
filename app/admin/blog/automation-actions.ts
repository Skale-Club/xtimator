'use server'
/**
 * Auto-blog admin actions (autoblog-parity XT-12).
 *
 * Every action is admin-gated through requireAdmin() and audited the same way
 * the manual blog CRUD in ./actions.ts is, because these change what gets
 * published under the company's name without a human writing it.
 *
 * The settings row is a singleton pinned to id 1 (see the migration's
 * blog_settings_singleton constraint), so an upsert can never quietly create a
 * second configuration that nothing reads.
 */
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireAdmin } from '@/lib/auth/admin-context'
import { logAdminAction } from '@/lib/admin/audit-log'
import { requireServiceClient } from '@/lib/supabase/service'
import { generateBlogPost } from '@/lib/blog/generator'
import { fetchAllRssSources } from '@/lib/blog/rss'
import { nextScheduledRun } from '@/lib/blog/schedule'
import { parseTelegramTarget } from '@/lib/blog/contract'
import {
  deleteTelegramWebhook,
  getTelegramWebhookInfo,
  setTelegramWebhook,
  webhookUrl,
} from '@/lib/blog/telegram'
import { randomBytes } from 'node:crypto'

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? Record<string, never> : { data: T }))
  | { ok: false; message: string }

const settingsSchema = z.object({
  enabled: z.boolean(),
  postsPerDay: z.number().int().min(0).max(24),
  postingHour: z.number().int().min(0).max(23).nullable(),
  timezone: z.string().min(1).max(100),
  seoKeywords: z.string().max(2000),
  promptStyle: z.string().max(4000),
  systemPrompt: z.string().max(8000),
  enableTrendAnalysis: z.boolean(),
  rssEnabled: z.boolean(),
  autoPublish: z.boolean(),
  textModel: z.string().max(200),
  imageModel: z.string().max(200),
})

export type BlogAutomationSettingsInput = z.infer<typeof settingsSchema>

export async function saveAutomationSettings(
  input: BlogAutomationSettingsInput,
): Promise<ActionResult> {
  const ctx = await requireAdmin()
  const parsed = settingsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Validation failed' }
  }

  const svc = requireServiceClient()
  const { error } = await svc.from('blog_settings').upsert(
    {
      id: 1,
      enabled: parsed.data.enabled,
      posts_per_day: parsed.data.postsPerDay,
      posting_hour: parsed.data.postingHour,
      timezone: parsed.data.timezone,
      seo_keywords: parsed.data.seoKeywords,
      prompt_style: parsed.data.promptStyle,
      system_prompt: parsed.data.systemPrompt,
      enable_trend_analysis: parsed.data.enableTrendAnalysis,
      rss_enabled: parsed.data.rssEnabled,
      auto_publish: parsed.data.autoPublish,
      text_model: parsed.data.textModel,
      image_model: parsed.data.imageModel,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )
  if (error) return { ok: false, message: error.message }

  await logAdminAction({
    action: 'blog_automation.settings',
    actorId: ctx.userId,
    actorEmail: ctx.email,
    // Deliberately no prompt bodies in the audit log — they are long and change
    // constantly; what matters for an audit is who turned it on and how often
    // it publishes.
    metadata: {
      enabled: parsed.data.enabled,
      postsPerDay: parsed.data.postsPerDay,
      postingHour: parsed.data.postingHour,
      autoPublish: parsed.data.autoPublish,
    },
  })

  revalidatePath('/admin/blog')
  return { ok: true } as ActionResult
}

/** Read the settings row plus the next run the schedule actually promises. */
export async function loadAutomationState(): Promise<
  ActionResult<{
    settings: Record<string, unknown> | null
    nextScheduledRunAt: string | null
    recentJobs: Array<Record<string, unknown>>
    pendingDrafts: Array<Record<string, unknown>>
    rssSources: Array<Record<string, unknown>>
    pendingRssItems: number
    telegram: {
      enabled: boolean
      approvalsEnabled: boolean
      hasBotToken: boolean
      chatIds: string[]
      approvalsChatIds: string[]
    }
  }>
> {
  await requireAdmin()
  const svc = requireServiceClient()

  const { data: settings } = await svc.from('blog_settings').select('*').eq('id', 1).maybeSingle()
  const { data: jobs } = await svc
    .from('blog_generation_jobs')
    .select('id, status, trigger, source, pillar_id, topic, error_message, durations_ms, created_at, completed_at')
    .order('created_at', { ascending: false })
    .limit(20)

  // The approval queue: generated drafts, never hand-written ones.
  const { data: drafts } = await svc
    .from('blog_posts')
    .select('id, title, excerpt, created_at')
    .eq('status', 'draft')
    .eq('ai_generated', true)
    .order('created_at', { ascending: false })
    .limit(50)

  const { data: rssSources } = await svc
    .from('blog_rss_sources')
    .select('id, name, url, enabled, last_fetched_at, last_fetched_status, error_message')
    .order('created_at', { ascending: true })

  // A count, not the rows: the panel only reports how much is queued, and
  // pulling fifty item bodies to render one number is waste.
  const { count: pendingRssItems } = await svc
    .from('blog_rss_items')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  // The bot token is NEVER returned — the panel only needs to know one is
  // stored, and a token that reaches a browser is a token in a browser's
  // memory, its devtools and its extensions.
  const { data: telegram } = await svc
    .from('telegram_settings')
    .select('enabled, bot_token, chat_ids, approvals_enabled, approvals_chat_ids')
    .eq('id', 1)
    .maybeSingle()
  const tg = telegram as {
    enabled: boolean | null
    bot_token: string | null
    chat_ids: string[] | null
    approvals_enabled: boolean | null
    approvals_chat_ids: string[] | null
  } | null

  const row = settings as { posting_hour: number | null; posts_per_day: number; timezone: string } | null

  return {
    ok: true,
    data: {
      settings: (settings as Record<string, unknown> | null) ?? null,
      // Computed from the SAME helper the cron gate uses, so the time the panel
      // promises is the time the job will actually fire. null means no hour is
      // pinned and the cadence drifts — which has no predictable answer, and
      // saying so is better than inventing one.
      nextScheduledRunAt: row
        ? (nextScheduledRun({
            now: new Date(),
            timeZone: row.timezone || 'UTC',
            postingHour: row.posting_hour,
            postsPerDay: row.posts_per_day,
          })?.toISOString() ?? null)
        : null,
      recentJobs: (jobs ?? []) as Array<Record<string, unknown>>,
      pendingDrafts: (drafts ?? []) as Array<Record<string, unknown>>,
      rssSources: (rssSources ?? []) as Array<Record<string, unknown>>,
      pendingRssItems: pendingRssItems ?? 0,
      telegram: {
        enabled: tg?.enabled ?? false,
        approvalsEnabled: tg?.approvals_enabled ?? false,
        hasBotToken: Boolean(tg?.bot_token),
        chatIds: tg?.chat_ids ?? [],
        approvalsChatIds: tg?.approvals_chat_ids ?? [],
      },
    },
  }
}

/** Generate now, bypassing the cadence gates (the lock still applies). */
export async function generateNow(): Promise<ActionResult<{ status: string }>> {
  const ctx = await requireAdmin()
  const result = await generateBlogPost({ trigger: 'manual' })

  await logAdminAction({
    action: 'blog_automation.generate_now',
    actorId: ctx.userId,
    actorEmail: ctx.email,
    metadata: { status: result.status },
  })

  revalidatePath('/admin/blog')
  if (result.status === 'failed') return { ok: false, message: result.error }
  return { ok: true, data: { status: result.status } }
}

/**
 * Approve a generated draft: publish it, and record the decision so the next
 * generation learns from it.
 */
export async function approveDraft(postId: string): Promise<ActionResult> {
  const ctx = await requireAdmin()
  const svc = requireServiceClient()

  const { data: post } = await svc
    .from('blog_posts')
    .select('id, title, excerpt, status')
    .eq('id', postId)
    .maybeSingle()
  if (!post) return { ok: false, message: 'Post not found' }

  const row = post as { id: string; title: string; excerpt: string | null; status: string }
  if (row.status === 'published') return { ok: false, message: 'That post is already published.' }

  const { error } = await svc
    .from('blog_posts')
    .update({ status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', postId)
  if (error) return { ok: false, message: error.message }

  // Feedback is best-effort: the post is published either way, and losing the
  // learning signal must not undo an editor's decision.
  await svc
    .from('blog_post_feedback')
    .insert({
      post_id: row.id,
      post_title: row.title,
      post_excerpt: row.excerpt,
      verdict: 'approved',
      decided_by: 'admin',
    })
    .then(undefined, () => undefined)

  await logAdminAction({ action: 'blog_automation.draft_approved', actorId: ctx.userId, actorEmail: ctx.email, metadata: { postId } })
  revalidatePath('/admin/blog')
  revalidatePath('/blog')
  return { ok: true } as ActionResult
}

/**
 * Reject a generated draft: delete it, and keep the reason.
 *
 * The feedback row is written BEFORE the delete and snapshots the title and
 * excerpt, because the whole point is that the signal survives the post. The
 * reason is the strongest part of it — it is what tells the next run what to
 * avoid rather than merely that something was wrong.
 */
export async function rejectDraft(postId: string, reason?: string): Promise<ActionResult> {
  const ctx = await requireAdmin()
  const svc = requireServiceClient()

  const { data: post } = await svc
    .from('blog_posts')
    .select('id, title, excerpt')
    .eq('id', postId)
    .maybeSingle()
  if (!post) return { ok: false, message: 'Post not found' }

  const row = post as { id: string; title: string; excerpt: string | null }

  await svc.from('blog_post_feedback').insert({
    post_id: row.id,
    post_title: row.title,
    post_excerpt: row.excerpt,
    verdict: 'rejected',
    reason: reason?.trim() || null,
    decided_by: 'admin',
  })

  const { error } = await svc.from('blog_posts').delete().eq('id', postId)
  if (error) return { ok: false, message: error.message }

  await logAdminAction({ action: 'blog_automation.draft_rejected', actorId: ctx.userId, actorEmail: ctx.email, metadata: { postId } })
  revalidatePath('/admin/blog')
  return { ok: true } as ActionResult
}

// ─── RSS sources ─────────────────────────────────────────────────────────────

const rssSourceSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url().max(2000),
})

export async function addRssSource(input: z.infer<typeof rssSourceSchema>): Promise<ActionResult> {
  const ctx = await requireAdmin()
  const parsed = rssSourceSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Validation failed' }
  }

  const svc = requireServiceClient()
  const { error } = await svc.from('blog_rss_sources').insert({
    name: parsed.data.name,
    url: parsed.data.url,
    enabled: true,
  })
  if (error) return { ok: false, message: error.message }

  await logAdminAction({ action: 'blog_automation.rss_source_added', actorId: ctx.userId, actorEmail: ctx.email, metadata: { url: parsed.data.url } })
  revalidatePath('/admin/blog')
  return { ok: true } as ActionResult
}

/**
 * Pause a feed without losing it.
 *
 * The alternative people reach for is deleting and re-adding, which throws away
 * every item already ingested from it and re-ingests the publisher's whole
 * current window as if it were new.
 */
export async function toggleRssSource(id: string, enabled: boolean): Promise<ActionResult> {
  const ctx = await requireAdmin()
  const svc = requireServiceClient()
  const { error } = await svc
    .from('blog_rss_sources')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, message: error.message }

  await logAdminAction({ action: 'blog_automation.rss_source_toggled', actorId: ctx.userId, actorEmail: ctx.email, metadata: { id, enabled } })
  revalidatePath('/admin/blog')
  return { ok: true } as ActionResult
}

export async function deleteRssSource(id: string): Promise<ActionResult> {
  const ctx = await requireAdmin()
  const svc = requireServiceClient()
  // blog_rss_items.source_id cascades, so the source's items go with it.
  const { error } = await svc.from('blog_rss_sources').delete().eq('id', id)
  if (error) return { ok: false, message: error.message }

  await logAdminAction({ action: 'blog_automation.rss_source_deleted', actorId: ctx.userId, actorEmail: ctx.email, metadata: { id } })
  revalidatePath('/admin/blog')
  return { ok: true } as ActionResult
}

/**
 * Fetch every feed now.
 *
 * Without this, "I just added a feed" means "wait two hours to find out whether
 * the URL even works".
 */
export async function fetchRssNow(): Promise<
  ActionResult<{ sources: number; upserted: number; errors: string[] }>
> {
  await requireAdmin()
  const svc = requireServiceClient()
  const summary = await fetchAllRssSources(svc)
  revalidatePath('/admin/blog')
  return {
    ok: true,
    data: {
      sources: summary.sourcesProcessed,
      upserted: summary.itemsUpserted,
      errors: summary.errors.map((e) => `${e.sourceName}: ${e.message}`),
    },
  }
}

// ─── Telegram approvals ──────────────────────────────────────────────────────

const telegramSchema = z.object({
  enabled: z.boolean(),
  botToken: z.string().max(200).optional(),
  chatIds: z.array(z.string().max(100)),
  approvalsEnabled: z.boolean(),
  approvalsChatIds: z.array(z.string().max(100)),
})

const MASKED_TOKEN = '********'

export async function saveTelegramSettings(
  input: z.infer<typeof telegramSchema>,
): Promise<ActionResult> {
  const ctx = await requireAdmin()
  const parsed = telegramSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Validation failed' }
  }

  const normalize = (ids: string[]) =>
    Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)))

  const chatIds = normalize(parsed.data.chatIds)
  const approvalsChatIds = normalize(parsed.data.approvalsChatIds)

  // Reject a malformed destination HERE rather than discovering it on the first
  // notification, where the only symptom is silence. An entry is a chat id,
  // optionally with a forum-topic thread (MASTER §6).
  const invalid = [...chatIds, ...approvalsChatIds].filter((id) => !parseTelegramTarget(id))
  if (invalid.length > 0) {
    return {
      ok: false,
      message: `Invalid chat id(s): ${invalid.join(', ')}. Use the numeric chat id, optionally with a forum topic as "<chat_id>:<thread_id>".`,
    }
  }

  const svc = requireServiceClient()
  const { data: existing } = await svc
    .from('telegram_settings')
    .select('bot_token, approvals_bot_token, approvals_enabled, webhook_secret')
    .eq('id', 1)
    .maybeSingle()
  const prev = existing as {
    bot_token: string | null
    approvals_bot_token: string | null
    approvals_enabled: boolean | null
    webhook_secret: string | null
  } | null

  // The masked sentinel (or an omitted field) means "keep the stored token".
  const incoming = parsed.data.botToken?.trim()
  const botToken = !incoming || incoming === MASKED_TOKEN ? (prev?.bot_token ?? null) : incoming

  // Autoblog-parity XT-11. Approvals do NOTHING until Telegram is told where to
  // deliver callbacks, and registering that by hand was the gap: the panel could
  // report "approvals on" while no webhook existed, and the only symptom was
  // buttons that did nothing when pressed.
  let webhookSecret = prev?.webhook_secret ?? null
  if (parsed.data.approvalsEnabled) {
    const approvalsToken = prev?.approvals_bot_token?.trim() || botToken?.trim() || null
    if (!approvalsToken) {
      return { ok: false, message: 'A Telegram bot token is required before blog approvals can be enabled.' }
    }
    const url = webhookUrl()
    if (!url) {
      return { ok: false, message: 'NEXT_PUBLIC_SITE_URL is not set, so there is no public URL for the Telegram webhook.' }
    }
    // Rotated on a FRESH enable — a secret that leaked while approvals were off
    // must not still be valid when they come back on — but kept across a plain
    // re-save, so saving the panel is not a silent invalidation of a working
    // webhook.
    if (!prev?.approvals_enabled || !webhookSecret) {
      webhookSecret = randomBytes(32).toString('hex')
    }
    // Registration BEFORE persistence: storing approvals_enabled for a webhook
    // Telegram rejected would leave a panel claiming a feature that cannot fire.
    const registered = await setTelegramWebhook(approvalsToken, url, webhookSecret)
    if (!registered.ok) {
      return { ok: false, message: `Telegram rejected the webhook: ${registered.message}` }
    }
  } else if (prev?.approvals_enabled) {
    const approvalsToken = prev.approvals_bot_token?.trim() || prev.bot_token?.trim() || null
    if (approvalsToken) {
      const removed = await deleteTelegramWebhook(approvalsToken)
      if (!removed.ok) {
        // Not fatal: the secret is dropped below, so the endpoint refuses every
        // later delivery even if Telegram still holds the URL.
        console.warn('[blog] could not deregister the Telegram webhook:', removed.message)
      }
    }
    webhookSecret = null
  }

  const { error } = await svc.from('telegram_settings').upsert(
    {
      id: 1,
      enabled: parsed.data.enabled,
      bot_token: botToken,
      chat_ids: chatIds,
      approvals_enabled: parsed.data.approvalsEnabled,
      approvals_chat_ids: approvalsChatIds,
      webhook_secret: webhookSecret,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )
  if (error) return { ok: false, message: error.message }

  await logAdminAction({
    action: 'blog_automation.telegram_settings',
    actorId: ctx.userId,
    actorEmail: ctx.email,
    // Never the token, and never the chat ids: the audit log records that the
    // configuration changed, not what the credentials are.
    metadata: { enabled: parsed.data.enabled, approvalsEnabled: parsed.data.approvalsEnabled },
  })

  revalidatePath('/admin/blog')
  return { ok: true } as ActionResult
}

/**
 * Re-register a webhook that went stale (autoblog-parity XT-11).
 *
 * Telegram silently drops a webhook whose URL stops resolving — after a domain
 * change, or a long outage — and the only symptom is approval buttons that stop
 * doing anything. Comparing what Telegram believes the URL is against what it
 * should be is the difference between noticing in one click and noticing when
 * someone asks why a draft was never published.
 */
export async function reconcileTelegramWebhook(): Promise<
  ActionResult<{ reRegistered: boolean; previousUrl?: string; previousError?: string | null }>
> {
  await requireAdmin()
  const svc = requireServiceClient()
  const { data } = await svc
    .from('telegram_settings')
    .select('bot_token, approvals_bot_token, approvals_enabled, webhook_secret')
    .eq('id', 1)
    .maybeSingle()
  const row = data as {
    bot_token: string | null
    approvals_bot_token: string | null
    approvals_enabled: boolean | null
    webhook_secret: string | null
  } | null

  if (!row?.approvals_enabled || !row.webhook_secret) {
    return { ok: false, message: 'Blog approvals are not enabled.' }
  }
  const token = row.approvals_bot_token?.trim() || row.bot_token?.trim() || null
  const url = webhookUrl()
  if (!token || !url) {
    return { ok: false, message: 'Telegram is not configured well enough to reconcile the webhook.' }
  }

  const info = await getTelegramWebhookInfo(token)
  if (!info.ok) return { ok: false, message: info.message ?? 'Telegram did not answer.' }
  if (info.url === url && !info.lastErrorMessage) {
    return { ok: true, data: { reRegistered: false } }
  }

  const registered = await setTelegramWebhook(token, url, row.webhook_secret)
  if (!registered.ok) return { ok: false, message: `Telegram rejected the webhook: ${registered.message}` }

  return {
    ok: true,
    data: { reRegistered: true, previousUrl: info.url, previousError: info.lastErrorMessage ?? null },
  }
}
