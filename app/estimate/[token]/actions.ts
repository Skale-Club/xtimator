'use server'

import { createServiceClient } from '@/lib/supabase/service'

export async function logEstimateView(token: string): Promise<void> {
  const supabase = createServiceClient()

  // Look up estimate by share_token
  const { data: estimate } = await supabase
    .from('estimates')
    .select('id, project_id, company_id, viewed_at')
    .eq('share_token', token)
    .single()

  if (!estimate) return

  // Update viewed_at only on first view
  if (!estimate.viewed_at) {
    await supabase
      .from('estimates')
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', estimate.id)
  }

  // Log view activity
  await supabase.from('estimate_activity').insert({
    project_id: estimate.project_id,
    company_id: estimate.company_id,
    estimate_id: estimate.id,
    event_type: 'estimate_viewed',
    metadata: {},
  })

  // Check company notification preferences
  const { data: company } = await supabase
    .from('companies')
    .select('notify_on_view, email, name')
    .eq('id', estimate.company_id)
    .single()

  if (company?.notify_on_view && company.email && process.env.RESEND_API_KEY) {
    // Fetch project name for the email
    const { data: project } = await supabase
      .from('projects')
      .select('name')
      .eq('id', estimate.project_id)
      .single()

    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'EstimateBuilder Pro <notifications@estimatebuilder.pro>',
        to: company.email,
        subject: `Your estimate was viewed - ${project?.name ?? 'Unknown Project'}`,
        text: `Hi ${company.name},\n\nYour estimate for "${project?.name ?? 'Unknown Project'}" was just viewed by the client.\n\nLog in to EstimateBuilder Pro to see more details.`,
      })
    } catch {
      // Resend not installed yet or send failed — skip silently
    }
  }
}

export async function respondToEstimate(
  token: string,
  response: 'accepted' | 'declined'
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceClient()

  // Look up estimate
  const { data: estimate } = await supabase
    .from('estimates')
    .select('id, project_id, company_id, client_response')
    .eq('share_token', token)
    .single()

  if (!estimate) {
    return { success: false, error: 'Estimate not found' }
  }

  if (estimate.client_response) {
    return { success: false, error: 'This estimate has already been responded to' }
  }

  // Update estimate with client response
  await supabase
    .from('estimates')
    .update({
      client_response: response,
      responded_at: new Date().toISOString(),
    })
    .eq('id', estimate.id)

  // Update project status to match response
  await supabase
    .from('projects')
    .update({ status: response })
    .eq('id', estimate.project_id)

  // Log activity
  await supabase.from('estimate_activity').insert({
    project_id: estimate.project_id,
    company_id: estimate.company_id,
    estimate_id: estimate.id,
    event_type: `estimate_${response}`,
    metadata: {},
  })

  // Send notification email if enabled
  const { data: company } = await supabase
    .from('companies')
    .select('notify_on_accept, notify_on_decline, email, name')
    .eq('id', estimate.company_id)
    .single()

  const shouldNotify =
    response === 'accepted'
      ? company?.notify_on_accept
      : company?.notify_on_decline

  if (shouldNotify && company?.email && process.env.RESEND_API_KEY) {
    const { data: project } = await supabase
      .from('projects')
      .select('name')
      .eq('id', estimate.project_id)
      .single()

    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'EstimateBuilder Pro <notifications@estimatebuilder.pro>',
        to: company.email,
        subject: `Estimate ${response} - ${project?.name ?? 'Unknown Project'}`,
        text: `Hi ${company.name},\n\nYour estimate for "${project?.name ?? 'Unknown Project'}" has been ${response} by the client.\n\nLog in to EstimateBuilder Pro to see more details.`,
      })
    } catch {
      // Resend not installed yet or send failed — skip silently
    }
  }

  return { success: true }
}
