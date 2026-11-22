'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/context'
import { requireCompanyOwner } from '@/lib/auth/require-company-role'
import { assertCompanyWritable, assertWritable } from '@/lib/demo/guard'
import { billingEditDenied } from '@/lib/billing/access-guard'
import { COMPANY_FEATURE_COLUMNS, resolveCompanyFeatures } from '@/lib/features/company-features'
import { getPlatformFeatureState } from '@/lib/features/platform-feature-state'

/**
 * Tenant switches for the two client-facing features (owner decision
 * XTM-D-20261121-feature-switches). These are the ONLY writers of
 * `digital_signature_enabled` and `online_payments_enabled`.
 *
 * Guard order mirrors `issueInvoice`: auth, owner only, demo, paywall, input.
 * Turning a feature ON needs the platform to allow it; turning it OFF is
 * always allowed. Turning payments off never disconnects Stripe and never
 * touches invoices that were already issued.
 */

type ActionResult = { error: string } | { success: true }

type SwitchColumn = 'digital_signature_enabled' | 'online_payments_enabled'

async function setTenantSwitch(
  feature: 'digitalSignature' | 'onlinePayments',
  column: SwitchColumn,
  enabled: unknown,
): Promise<ActionResult> {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { companyId } = ctx

  try {
    await requireCompanyOwner(companyId)
  } catch {
    return { error: 'Only the company owner can change this.' }
  }

  const sessionDenied = await assertWritable()
  if (sessionDenied) return sessionDenied
  const targetDenied = await assertCompanyWritable(companyId)
  if (targetDenied) return targetDenied

  const billingDenied = await billingEditDenied(companyId)
  if (billingDenied) return { error: billingDenied.error }

  if (typeof enabled !== 'boolean') return { error: 'Invalid input' }

  const supabase = await createClient()

  if (enabled) {
    const { data: company, error: loadError } = await supabase
      .from('companies')
      .select(COMPANY_FEATURE_COLUMNS)
      .eq('id', companyId)
      .single()
    if (loadError || !company) return { error: 'Company not found' }
    const features = resolveCompanyFeatures(company, await getPlatformFeatureState())
    if (!features[feature].allowed) {
      return { error: 'This feature is not available for this account.' }
    }
  }

  const { error } = await supabase
    .from('companies')
    .update({ [column]: enabled })
    .eq('id', companyId)
  if (error) return { error: 'Could not save this setting. Please try again.' }

  revalidatePath('/settings/client-actions')
  revalidatePath('/settings/integrations')
  return { success: true }
}

export async function setDigitalSignatureEnabled(enabled: boolean): Promise<ActionResult> {
  return setTenantSwitch('digitalSignature', 'digital_signature_enabled', enabled)
}

export async function setOnlinePaymentsEnabled(enabled: boolean): Promise<ActionResult> {
  return setTenantSwitch('onlinePayments', 'online_payments_enabled', enabled)
}
