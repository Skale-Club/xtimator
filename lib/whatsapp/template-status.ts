import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { mapMetaEventToStatus } from '@/lib/whatsapp/meta-templates-client'

export interface TemplateStatusUpdateInput {
  message_template_id?: string
  template_name?: string
  language?: string
  event: string
  reason?: string
}

/** Internal callback: only the verified, durably accepted webhook worker calls this. */
export async function applyTemplateStatusUpdate(input: TemplateStatusUpdateInput): Promise<void> {
  if (!input.message_template_id && !input.template_name) throw new Error('Missing template identifier')
  const svc = requireServiceClient()
  const status = mapMetaEventToStatus(input.event)
  const patch = {
    status,
    updated_at: new Date().toISOString(),
    rejection_reason: status === 'rejected' ? input.reason ?? null : null,
  }
  const select = () => svc.from('whatsapp_notification_templates').select('id')
  let found = input.message_template_id
    ? await select().eq('meta_template_id', input.message_template_id)
    : { data: [], error: null }
  if (found.error) throw new Error('Template lookup failed')
  if (!found.data?.length && input.template_name) {
    let query = select().eq('template_name', input.template_name)
    if (input.language) query = query.eq('language_code', input.language)
    found = await query
    if (found.error) throw new Error('Template name lookup failed')
  }
  // Another application on the WABA can own a template not tracked here.
  if (!found.data?.length) return
  const { error } = await svc.from('whatsapp_notification_templates').update({
    ...patch,
    ...(input.message_template_id ? { meta_template_id: input.message_template_id } : {}),
  }).in('id', found.data.map(row => row.id))
  if (error) throw new Error('Template status update failed')
}
