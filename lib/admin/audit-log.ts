import 'server-only'
import { headers } from 'next/headers'
import { requireServiceClient } from '@/lib/supabase/service'

export type AuditAction =
  | 'integration.save'
  | 'integration.delete'
  | 'integration.test'
  | 'ai_provider.set'
  | 'ai_provider.set_model'
  | 'company.set_model_override'
  | 'tier.force'
  | 'bonus_credits.grant'
  | 'branding.save'
  | 'seo.save'
  | 'landing.save'
  | 'blog.create'
  | 'blog.update'
  | 'blog.delete'
  | 'blog.publish'
  | 'legal.save'
  | 'admin.add'
  | 'admin.remove'
  | 'price_research.set'
  | 'billing_config.save'

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
      ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
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
