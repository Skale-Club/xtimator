import 'server-only'
import { headers } from 'next/headers'
import { resolveClientIp } from '@/lib/http/client-ip'
import { requireServiceClient } from '@/lib/supabase/service'

export type AuditAction =
  | 'integration.save'
  | 'integration.delete'
  | 'integration.test'
  | 'ai_provider.set'
  | 'ai_provider.set_model'
  | 'ai_provider.set_transcription_model'
  | 'company.set_model_override'
  | 'company.set_demo_quota'
  | 'company.byok_enabled'
  | 'company.byok_disabled'
  | 'company.handoff'
  | 'company.support_mode_start'
  | 'company.support_mode_end'
  | 'tier.force'
  | 'bonus_credits.grant'
  | 'branding.save'
  | 'seo.save'
  | 'landing.save'
  | 'blog.create'
  | 'blog.update'
  | 'blog.delete'
  | 'blog.publish'
  | 'knowledge_entry.save'
  | 'knowledge_entry.delete'
  | 'legal.save'
  | 'admin.add'
  | 'admin.remove'
  | 'price_research.set'
  | 'billing_config.save'
  | 'whatsapp.account.save'
  | 'whatsapp.sender.save'
  | 'whatsapp.sender.status'
  | 'whatsapp.sender.remove'
  | 'platform_event.toggle'
  | 'notification_template.save'
  | 'notification_template.test_send'

interface LogParams {
  actorId: string
  actorEmail: string
  action: AuditAction
  targetType?: string | null
  targetId?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Append one row to admin_audit_log. Best-effort — failures are logged but
 * never throw (we don't want a logging glitch to block an admin action).
 *
 * NEVER pass raw secrets through `metadata`. Use safe projections only:
 *   ✅ { last4: 'abc1' }
 *   ❌ { apiKey: 'sk_live_xxxxxx' }
 */
export async function logAdminAction(params: LogParams): Promise<void> {
  try {
    const svc = requireServiceClient()
    let ip: string | null = null
    let userAgent: string | null = null
    try {
      const h = await headers()
      // Quick task 260801-hh4: resolved through the same trusted-proxy-aware
      // helper the sign route uses (lib/http/client-ip.ts) instead of the
      // old first-XFF-entry logic, which was fully attacker-supplied. An
      // unparseable/absent value now records `null` rather than a
      // caller-chosen string — that is the intended change.
      ip = resolveClientIp(h)
      userAgent = h.get('user-agent') ?? null
    } catch {
      // headers() unavailable outside request scope — best-effort only
    }

    const { error } = await svc.from('admin_audit_log').insert({
      actor_id: params.actorId,
      actor_email: params.actorEmail,
      action: params.action,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      metadata: params.metadata ?? {},
      ip,
      user_agent: userAgent,
    })

    if (error) {
      console.warn('[admin_audit_log] insert failed:', error.message)
    }
  } catch (e) {
    console.warn('[admin_audit_log] unexpected error:', e instanceof Error ? e.message : String(e))
  }
}
