import 'server-only'
import { getIntegrationKey, getBranding, getWhatsAppDisplayNumber } from '@/lib/platform-config'
import { getCanonicalBaseUrl } from '@/lib/utils/site-url'
import { buildWaMeLink } from '@/lib/whatsapp/wa-link'

/**
 * Transactional account lifecycle emails.
 *
 * Design contract (mirrors payment-emails.ts):
 *   - NEVER throws. Logs on failure and returns.
 *   - If the Resend key is unset → log warn + return.
 *   - If toEmail is empty → skip silently.
 */

const FROM_ADDRESS = 'notifications@xtimator.com'

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
              You are receiving this email because you have an ${escHtml(appName)} account.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ─── Welcome email ────────────────────────────────────────────────────────────

export interface WelcomeEmailContext {
  toEmail: string
  ownerName?: string | null
  companyName: string
}

export async function sendWelcomeEmail(ctx: WelcomeEmailContext): Promise<void> {
  try {
    if (!ctx.toEmail) return
    const key = await getIntegrationKey('resend')
    if (!key) {
      console.warn('[account-emails] no resend key — skipping welcome email')
      return
    }
    const branding = await getBranding()
    const appUrl = getCanonicalBaseUrl()
    const brandColor = branding.primaryColor ?? '#111111'
    const greeting = ctx.ownerName ? `Hi ${escHtml(ctx.ownerName)},` : 'Hi there,'

    // WhatsApp click-to-chat link (omitted gracefully when no platform number is set).
    const waText = `Hi! I'd like to start creating estimates with ${branding.appName}.`
    const waLink = buildWaMeLink(await getWhatsAppDisplayNumber(), waText)

    const WA_GREEN = '#25D366'
    const whatsappSection = waLink
      ? `
      <table cellpadding="0" cellspacing="0" border="0" role="presentation"
             style="background:#f0fdf4;border:1px solid #c8f0d4;border-radius:8px;padding:20px 24px;margin:24px 0;width:100%;box-sizing:border-box;">
        <tr><td>
          <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#111111;">📱 Create estimates from WhatsApp</p>
          <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#444444;">
            Tap the button below to start a chat. Send a <strong>voice note</strong> or text describing
            the job and our assistant builds the estimate for you — you can also ask it questions any time.
            Prefer Portuguese? Just write in Portuguese and it replies in Portuguese.
          </p>
          <table cellpadding="0" cellspacing="0" border="0" role="presentation">
            <tr>
              <td style="border-radius:6px;background:${WA_GREEN};">
                <a href="${escHtml(waLink)}"
                   style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
                  Get Started on WhatsApp →
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:12px 0 0;font-size:12px;color:#888888;line-height:1.5;">
            Don't use WhatsApp? No problem — you can do everything in the app instead.
          </p>
        </td></tr>
      </table>`
      : ''

    const body = `
      <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#111111;">${greeting}</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#444444;">
        Your <strong>${escHtml(branding.appName)}</strong> account has been successfully created.
        You are ready to start generating professional estimates in minutes — two ways to work:
      </p>

      ${whatsappSection}

      <p style="margin:24px 0 8px;font-size:15px;line-height:1.7;color:#444444;">
        Or jump straight into the app to create and manage estimates, send branded PDFs, and track your jobs:
      </p>
      <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 0 24px;">
        <tr>
          <td style="border-radius:6px;background:${escHtml(brandColor)};">
            <a href="${escHtml(appUrl)}/dashboard"
               style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
              Go to Dashboard →
            </a>
          </td>
        </tr>
      </table>

      <p style="margin:0;font-size:14px;color:#888888;line-height:1.6;">
        If you have any questions, just reply to this email — we are happy to help.
      </p>`

    const html = buildEmailShell({
      brandColor,
      logoUrl: branding.logoUrl,
      appName: branding.appName,
      body,
    })

    const textLines = [
      `Hi${ctx.ownerName ? ' ' + ctx.ownerName : ' there'},`,
      ``,
      `Your ${branding.appName} account has been successfully created. There are two ways to work:`,
      ``,
    ]
    if (waLink) {
      textLines.push(
        `1) Create estimates from WhatsApp — start a chat and send a voice note or text describing the job; the assistant builds the estimate and answers your questions. Prefer Portuguese? Write in Portuguese and it replies in Portuguese.`,
        `   Get started on WhatsApp: ${waLink}`,
        `   (Don't use WhatsApp? You can do everything in the app instead.)`,
        ``,
        `2) Use the ${branding.appName} app to create/manage estimates and send branded PDFs.`,
        `   Go to your dashboard: ${appUrl}/dashboard`,
      )
    } else {
      textLines.push(
        `Create and manage estimates and send branded PDFs in the ${branding.appName} app.`,
        `Go to your dashboard: ${appUrl}/dashboard`,
      )
    }
    textLines.push(``, `If you have any questions, just reply to this email.`)

    const { Resend } = await import('resend')
    const resend = new Resend(key)
    await resend.emails.send({
      from: `${branding.appName} <${FROM_ADDRESS}>`,
      to: ctx.toEmail,
      subject: `Welcome to ${branding.appName} — Your account is ready!`,
      html,
      text: textLines.join('\n'),
    })
  } catch (e) {
    console.error('[account-emails] sendWelcomeEmail failed:', e)
  }
}

// ─── Profile updated email ────────────────────────────────────────────────────

export interface ProfileChange {
  label: string
  oldValue: string | null
  newValue: string | null
}

export interface ProfileFieldValues {
  name?: string | null
  ownerName?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
}

const PROFILE_FIELD_LABELS: Array<[keyof ProfileFieldValues, string]> = [
  ['name', 'Company name'],
  ['ownerName', 'Owner name'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['website', 'Website'],
]

/**
 * Compute the changed identity fields between the stored company and the
 * submitted form. Blanks are normalized to null (`value || null`) so an empty
 * form field ('') compares equal to a null DB value — matching how the DB write
 * coerces blanks. This prevents phantom "— -> —" change rows on saves that
 * didn't actually touch a null field.
 */
export function diffProfileFields(
  before: ProfileFieldValues,
  after: ProfileFieldValues
): ProfileChange[] {
  const changes: ProfileChange[] = []
  for (const [key, label] of PROFILE_FIELD_LABELS) {
    const oldValue = before[key] || null
    const newValue = after[key] || null
    if (oldValue !== newValue) changes.push({ label, oldValue, newValue })
  }
  return changes
}

export interface ProfileUpdatedEmailContext {
  toEmail: string
  ownerName?: string | null
  changes: ProfileChange[]
}

export async function sendProfileUpdatedEmail(ctx: ProfileUpdatedEmailContext): Promise<void> {
  try {
    if (!ctx.toEmail || ctx.changes.length === 0) return
    const key = await getIntegrationKey('resend')
    if (!key) {
      console.warn('[account-emails] no resend key — skipping profile update email')
      return
    }
    const branding = await getBranding()
    const appUrl = getCanonicalBaseUrl()
    const brandColor = branding.primaryColor ?? '#111111'
    const greeting = ctx.ownerName ? `Hi ${escHtml(ctx.ownerName)},` : 'Hi there,'

    const changeRows = ctx.changes
      .map(
        (c) => `
        <tr>
          <td style="padding:8px 12px;font-size:14px;font-weight:600;color:#555555;border-bottom:1px solid #f0f0f0;white-space:nowrap;">
            ${escHtml(c.label)}
          </td>
          <td style="padding:8px 12px;font-size:14px;color:#999999;border-bottom:1px solid #f0f0f0;text-decoration:line-through;">
            ${c.oldValue ? escHtml(c.oldValue) : '<em style="color:#cccccc;">—</em>'}
          </td>
          <td style="padding:8px 12px;font-size:14px;color:#111111;border-bottom:1px solid #f0f0f0;font-weight:500;">
            ${c.newValue ? escHtml(c.newValue) : '<em style="color:#cccccc;">—</em>'}
          </td>
        </tr>`,
      )
      .join('')

    const body = `
      <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#111111;">${greeting}</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#444444;">
        Your <strong>${escHtml(branding.appName)}</strong> profile has been successfully updated.
        Here is a summary of the changes made:
      </p>

      <table cellpadding="0" cellspacing="0" border="0" role="presentation"
             style="width:100%;border:1px solid #eeeeee;border-radius:6px;overflow:hidden;margin:0 0 24px;">
        <tr style="background:#f8f9fa;">
          <th style="padding:10px 12px;font-size:12px;font-weight:600;color:#888888;text-transform:uppercase;letter-spacing:.05em;text-align:left;border-bottom:1px solid #eeeeee;">Field</th>
          <th style="padding:10px 12px;font-size:12px;font-weight:600;color:#888888;text-transform:uppercase;letter-spacing:.05em;text-align:left;border-bottom:1px solid #eeeeee;">Previous</th>
          <th style="padding:10px 12px;font-size:12px;font-weight:600;color:#888888;text-transform:uppercase;letter-spacing:.05em;text-align:left;border-bottom:1px solid #eeeeee;">Updated to</th>
        </tr>
        ${changeRows}
      </table>

      <p style="margin:0 0 20px;font-size:14px;color:#888888;line-height:1.6;">
        If you did not make these changes, please
        <a href="${escHtml(appUrl)}/settings" style="color:${escHtml(brandColor)};text-decoration:none;font-weight:600;">review your account settings</a>
        and contact support immediately.
      </p>

      <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 0 8px;">
        <tr>
          <td style="border-radius:6px;border:1px solid ${escHtml(brandColor)};">
            <a href="${escHtml(appUrl)}/settings"
               style="display:inline-block;padding:10px 24px;color:${escHtml(brandColor)};font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">
              Review Settings →
            </a>
          </td>
        </tr>
      </table>`

    const textChanges = ctx.changes
      .map((c) => `  • ${c.label}: "${c.oldValue ?? '—'}" → "${c.newValue ?? '—'}"`)
      .join('\n')

    const html = buildEmailShell({
      brandColor,
      logoUrl: branding.logoUrl,
      appName: branding.appName,
      body,
    })

    const { Resend } = await import('resend')
    const resend = new Resend(key)
    await resend.emails.send({
      from: `${branding.appName} <${FROM_ADDRESS}>`,
      to: ctx.toEmail,
      subject: `Your ${branding.appName} profile has been updated`,
      html,
      text: [
        `Hi${ctx.ownerName ? ' ' + ctx.ownerName : ' there'},`,
        ``,
        `Your ${branding.appName} profile has been updated. Here is what changed:`,
        ``,
        textChanges,
        ``,
        `If you did not make these changes, review your settings: ${appUrl}/settings`,
      ].join('\n'),
    })
  } catch (e) {
    console.error('[account-emails] sendProfileUpdatedEmail failed:', e)
  }
}
