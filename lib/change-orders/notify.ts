// lib/change-orders/notify.ts
//
// Owner notification when a client approves (signature) or declines a change
// order: an in-app notification plus, when the owner turned it on, the Resend
// email. Mirrors lib/estimate/notify-response.ts (same preference flags
// notify_on_accept / notify_on_decline, same best-effort discipline) and is
// called AFTER the state transition has already committed, so a failure here
// can never surface as a failure of the transition itself.
//
// Deliberately NOT a 'use server' file: it must never be a callable Server
// Action. Reuses the 'estimate.accepted' / 'estimate.declined' event types
// (same Estimates category and channel preferences) with change-order copy.
import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey, getBranding } from '@/lib/platform-config'
import { notify } from '@/lib/notifications/dispatch'
import { emailFrom } from '@/lib/email/sender'
import { formatChangeOrderNumber } from './types'

export interface NotifyChangeOrderInput {
  id: string
  number: number
  title?: string | null
  project_id: string
  company_id: string
  estimate_number?: string | null
  client_name?: string | null
}

export function buildChangeOrderNotificationCopy(
  input: Pick<NotifyChangeOrderInput, 'number' | 'estimate_number' | 'client_name'>,
  response: 'accepted' | 'declined',
): { title: string; body: string } {
  const label = input.estimate_number
    ? formatChangeOrderNumber(input.estimate_number, input.number)
    : `Change order #${input.number}`
  const who = input.client_name ?? 'A client'
  return response === 'accepted'
    ? { title: 'Change order approved', body: `${who} approved ${label}.` }
    : { title: 'Change order declined', body: `${who} declined ${label}.` }
}

export async function notifyChangeOrderResponse(
  changeOrder: NotifyChangeOrderInput,
  response: 'accepted' | 'declined',
): Promise<void> {
  const copy = buildChangeOrderNotificationCopy(changeOrder, response)

  try {
    void notify({
      companyId: changeOrder.company_id,
      userId: null,
      eventType: response === 'accepted' ? 'estimate.accepted' : 'estimate.declined',
      title: copy.title,
      body: copy.body,
      linkUrl: `/projects/${changeOrder.project_id}/change-orders/${changeOrder.id}`,
      resourceType: 'change_order',
      resourceId: changeOrder.id,
    })
  } catch {
    /* best-effort */
  }

  try {
    const supabase = requireServiceClient()
    const { data: company } = await supabase
      .from('companies')
      .select('notify_on_accept, notify_on_decline, email, name')
      .eq('id', changeOrder.company_id)
      .single()

    const shouldNotify = response === 'accepted' ? company?.notify_on_accept : company?.notify_on_decline
    if (!shouldNotify || !company?.email) return

    const resendKey = await getIntegrationKey('resend')
    if (!resendKey) return

    const { data: project } = await supabase
      .from('projects')
      .select('name')
      .eq('id', changeOrder.project_id)
      .single()
    const projectName = project?.name ?? 'Unknown Project'

    const { Resend } = await import('resend')
    const resend = new Resend(resendKey)
    const branding = await getBranding()
    const appName = branding.appName
    const verb = response === 'accepted' ? 'approved' : 'declined'
    await resend.emails.send({
      from: emailFrom(appName),
      to: company.email,
      subject: `Change order ${verb} - ${projectName}`,
      text: `Hi ${company.name},\n\n${copy.body}\n\nProject: "${projectName}".\n\nLog in to ${appName} to see more details.`,
    })
  } catch {
    // Resend missing or the send failed: skip silently, like the estimate path.
  }
}
