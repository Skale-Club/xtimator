import 'server-only'
import { getIntegrationKey, getBranding } from '@/lib/platform-config'
import { getCanonicalBaseUrl } from '@/lib/utils/site-url'
import { EMAIL_FROM_ADDRESS } from '@/lib/email/sender'

/**
 * Team-invite transactional email.
 *
 * Design contract (mirrors account-emails.ts / payment-emails.ts):
 *   - NEVER throws. Logs on failure and returns.
 *   - If the Resend key is unset → log warn + return.
 *   - If toEmail is empty → skip silently.
 *
 * The accept-link route (`/invite/accept`) is built in Phase 137; here we only
 * emit the absolute link. The raw token appears ONLY inside that link — it is
 * never logged and never placed in the subject.
 *
 * This file is self-contained (copies escHtml/buildEmailShell/FROM_ADDRESS) so
 * the email layer has no cross-module helper coupling, exactly like
 * payment-emails.ts. It does NOT generate the token or touch the database —
 * Plan 02's inviteMember action passes a pre-generated token + context.
 */

const FROM_ADDRESS = EMAIL_FROM_ADDRESS

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildEmailShell({
  brandColor,
  logoUrl,
  appName,
  body,
}: {
  brandColor: string
  logoUrl: string | null
  appName: string
  body: string
}): string {
  const logoHtml = logoUrl
    ? `<img src="${escHtml(logoUrl)}" alt="${escHtml(appName)}" style="height:28px;display:inline-block;" />`
    : `<span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">${escHtml(appName)}</span>`

  const footerLogoHtml = logoUrl
    ? `<img src="${escHtml(logoUrl)}" alt="${escHtml(appName)}" style="height:24px;display:inline-block;margin-bottom:10px;" />`
    : `<div style="font-size:16px;font-weight:700;color:#333333;margin-bottom:10px;">${escHtml(appName)}</div>`

  return `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escHtml(appName)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,Helvetica Neue,Arial,sans-serif;color:#111111;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#f4f4f5;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" border="0" role="presentation"
             style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);width:100%;max-width:560px;">
        <!-- Header -->
        <tr>
          <td style="background:${escHtml(brandColor)};padding:22px 32px;">
            ${logoHtml}
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 32px 24px;">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px 28px;border-top:1px solid #eeeeee;text-align:center;">
            ${footerLogoHtml}
            <p style="margin:0;color:#aaaaaa;font-size:11px;line-height:1.6;">
              © ${new Date().getFullYear()} ${escHtml(appName)}. All rights reserved.<br />
              You are receiving this email because you were invited to a ${escHtml(appName)} team.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ─── Team invite email ──────────────────────────────────────────────────────

export interface InviteEmailContext {
  /** The invited person's email. */
  toEmail: string
  /** Pre-generated single-use token (by the action in Plan 02) — NOT generated here. */
  token: string
  /** The role the person was invited as. */
  role: 'admin' | 'member' | 'owner'
  /** The inviting company's name. */
  companyName: string
  /** Optional inviter display name, for the greeting. */
  inviterName?: string | null
  /** When the invite expires — for the human-readable expiry line. */
  expiresAt: Date
}

export async function sendInviteEmail(ctx: InviteEmailContext): Promise<void> {
  try {
    if (!ctx.toEmail) return
    const key = await getIntegrationKey('resend')
    if (!key) {
      console.warn('[invite-emails] no resend key — skipping invite email')
      return
    }
    const branding = await getBranding()
    const brandColor = branding.primaryColor ?? '#111111'

    // The ONE place the raw token surfaces: inside the absolute accept link.
    const acceptUrl = `${getCanonicalBaseUrl()}/invite/accept?token=${encodeURIComponent(ctx.token)}`

    const expiresLine = ctx.expiresAt.toLocaleDateString('en-US', { dateStyle: 'long' })

    const greeting = ctx.inviterName
      ? `${escHtml(ctx.inviterName)} has invited you to join their team.`
      : `You've been invited to join a team.`

    const body = `
      <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#111111;">${greeting}</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#444444;">
        You've been invited to join <strong>${escHtml(ctx.companyName)}</strong>
        on ${escHtml(branding.appName)} as a <strong>${escHtml(ctx.role)}</strong>.
        Accept the invite to start collaborating.
      </p>

      <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 0 24px;">
        <tr>
          <td style="border-radius:6px;background:${escHtml(brandColor)};">
            <a href="${escHtml(acceptUrl)}"
               style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
              Accept invite →
            </a>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 16px;font-size:14px;color:#888888;line-height:1.6;">
        This invite expires on ${escHtml(expiresLine)}.
      </p>

      <p style="margin:0;font-size:13px;color:#aaaaaa;line-height:1.6;">
        If you weren't expecting this invitation, you can safely ignore this email.
      </p>`

    const html = buildEmailShell({
      brandColor,
      logoUrl: branding.logoUrl,
      appName: branding.appName,
      body,
    })

    const text = [
      ctx.inviterName
        ? `${ctx.inviterName} has invited you to join their team.`
        : `You've been invited to join a team.`,
      ``,
      `You've been invited to join ${ctx.companyName} on ${branding.appName} as a ${ctx.role}.`,
      ``,
      `Accept your invite: ${acceptUrl}`,
      ``,
      `This invite expires on ${expiresLine}.`,
      ``,
      `If you weren't expecting this invitation, you can safely ignore this email.`,
    ].join('\n')

    const { Resend } = await import('resend')
    const resend = new Resend(key)
    await resend.emails.send({
      from: `${branding.appName} <${FROM_ADDRESS}>`,
      to: ctx.toEmail,
      subject: `You're invited to join ${branding.appName}`,
      html,
      text,
    })
  } catch (e) {
    console.error('[invite-emails] sendInviteEmail failed:', e)
  }
}
