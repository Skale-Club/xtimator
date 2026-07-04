import 'server-only'
import { getIntegrationKey, getBranding } from '@/lib/platform-config'
import { emailFrom } from '@/lib/email/sender'

/**
 * Phase 77 (NOTIF-07) — Branded notifications digest email.
 *
 * Design contract (mirrors lib/email/payment-emails.ts):
 *   - NEVER throws. Logs on failure and returns so the Inngest digest worker
 *     can never blow up because of a transient Resend outage.
 *   - If the Resend integration key is unset → log warn + return.
 *   - If items.length === 0 → no-op (defensive; callers should pre-filter).
 *
 * Subject line:
 *   - 1 item  → the item's title
 *   - N items → "[N] new notifications"
 *
 * Body: lightweight inline HTML with branded header (logo + brand color),
 * optionally grouped by category when `groupedByCategory=true`. No MJML —
 * matches the payment-emails precedent of "ship the loop fast, polish later".
 */

export interface DigestEmailItem {
  category: string
  title: string
  body: string
  linkUrl?: string
  createdAt: string
}

export interface DigestEmailContext {
  toEmail: string
  toName: string | null
  branding: {
    logoUrl: string | null
    brandColor: string | null
    businessName: string
  }
  items: DigestEmailItem[]
  groupedByCategory: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  estimate: 'Estimates',
  payment: 'Payments',
  trial: 'Trial',
  quota: 'Usage',
  whatsapp: 'WhatsApp',
  ai_job: 'AI Jobs',
  admin: 'Admin',
  system: 'System',
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderItem(item: DigestEmailItem, brandColor: string): string {
  const titleHtml = escapeHtml(item.title)
  const bodyHtml = escapeHtml(item.body)
  const link = item.linkUrl
    ? `<p style="margin:8px 0 0;"><a href="${escapeHtml(
        item.linkUrl,
      )}" style="color:${brandColor};text-decoration:none;font-weight:600;">Open →</a></p>`
    : ''
  return `<div style="padding:12px 0;border-bottom:1px solid #eee;">
    <div style="font-weight:600;color:#111;">${titleHtml}</div>
    <div style="color:#555;font-size:14px;margin-top:4px;">${bodyHtml}</div>
    ${link}
  </div>`
}

function renderHtml(ctx: DigestEmailContext): string {
  const brandColor = ctx.branding.brandColor ?? '#111111'
  const logo = ctx.branding.logoUrl
    ? `<img src="${escapeHtml(
        ctx.branding.logoUrl,
      )}" alt="${escapeHtml(ctx.branding.businessName)}" style="height:32px;display:block;" />`
    : `<div style="font-weight:700;color:#fff;">${escapeHtml(
        ctx.branding.businessName,
      )}</div>`

  let inner = ''
  if (ctx.groupedByCategory) {
    const groups = new Map<string, DigestEmailItem[]>()
    for (const item of ctx.items) {
      const list = groups.get(item.category) ?? []
      list.push(item)
      groups.set(item.category, list)
    }
    for (const [cat, list] of groups) {
      const label = CATEGORY_LABELS[cat] ?? cat
      inner += `<h3 style="margin:24px 0 8px;color:${brandColor};font-size:16px;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(
        label,
      )} (${list.length})</h3>`
      for (const item of list) inner += renderItem(item, brandColor)
    }
  } else {
    for (const item of ctx.items) inner += renderItem(item, brandColor)
  }

  return `<!doctype html><html><body style="margin:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#fff;">
      <div style="background:${brandColor};padding:20px;">${logo}</div>
      <div style="padding:24px;">
        <p style="margin:0 0 16px;color:#111;">Hi${
          ctx.toName ? ' ' + escapeHtml(ctx.toName) : ''
        },</p>
        <p style="margin:0 0 16px;color:#444;">Here ${
          ctx.items.length === 1 ? 'is a new notification' : 'are your latest notifications'
        } from ${escapeHtml(ctx.branding.businessName)}:</p>
        ${inner}
      </div>
      <div style="padding:16px 24px;color:#999;font-size:12px;text-align:center;">
        You can adjust which notifications you receive in Settings → Notifications.
      </div>
    </div>
  </body></html>`
}

function renderText(ctx: DigestEmailContext): string {
  const lines: string[] = []
  lines.push(
    ctx.items.length === 1
      ? 'You have a new notification:'
      : `You have ${ctx.items.length} new notifications:`,
  )
  lines.push('')
  for (const item of ctx.items) {
    lines.push(`• [${item.category}] ${item.title}`)
    lines.push(`  ${item.body}`)
    if (item.linkUrl) lines.push(`  ${item.linkUrl}`)
    lines.push('')
  }
  lines.push('Adjust delivery in Settings → Notifications.')
  return lines.join('\n')
}

/**
 * Best-effort branded digest send. Never throws.
 */
export async function sendNotificationDigestEmail(
  ctx: DigestEmailContext,
): Promise<void> {
  try {
    if (!ctx.items || ctx.items.length === 0) return
    if (!ctx.toEmail) {
      console.warn('[notification-emails] no toEmail — skipping')
      return
    }
    const key = await getIntegrationKey('resend')
    if (!key) {
      console.warn('[notification-emails] no resend key — skipping digest')
      return
    }
    // getBranding invoked for parity with payment-emails (warms cache; future
    // template iterations may want app-level branding alongside per-tenant).
    await getBranding()

    const subject =
      ctx.items.length === 1
        ? ctx.items[0]!.title
        : `${ctx.items.length} new notifications`

    const { Resend } = await import('resend')
    const resend = new Resend(key)
    await resend.emails.send({
      from: emailFrom(ctx.branding.businessName),
      to: ctx.toEmail,
      subject,
      html: renderHtml(ctx),
      text: renderText(ctx),
    })
  } catch (e) {
    console.error('[notification-emails] sendNotificationDigestEmail failed:', e)
  }
}
