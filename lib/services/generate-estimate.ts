import { revalidatePath } from 'next/cache'
import { requireServiceClient } from '@/lib/supabase/service'
import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import { PLACEHOLDER_PREFIX } from '@/lib/constants/project'
import { getAIProvider, type EstimateInput } from '@/lib/ai'
import { getPriceBookItems } from '@/lib/queries/price-book'
import {
  resolveEstimateLanguage,
  type EstimateLanguage,
} from '@/lib/i18n/resolve-estimate-language'
import { normalizeCurrencyCode } from '@/lib/money/currency'

export type ClientSuggestion = {
  detectedName: string
  matchedClientId: string | null
  matchedClientName: string | null
  autoLinked: boolean
}

export type GenerateEstimateResult = {
  estimateId: string
  version: number
  clientSuggestion: ClientSuggestion | null
  language: EstimateLanguage
}

export interface GenerateEstimateOptions {
  /** Explicit override from the caller (UI dropdown, WhatsApp command). */
  language?: EstimateLanguage
  /** User app language to consider in the cascade (rarely set from server). */
  userAppLanguage?: EstimateLanguage
}

function normalizeClientNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Core estimate generation pipeline — callable without an HTTP request or
 * authenticated user session. Uses the service-role client so it can be
 * invoked from webhook handlers, cron jobs, or other server-side contexts.
 *
 * Throws on unrecoverable errors (not found, no inputs, DB failure).
 */
export async function generateEstimateForProject(
  companyId: string,
  projectId: string,
  options: GenerateEstimateOptions = {}
): Promise<GenerateEstimateResult> {
  const supabase = requireServiceClient()

  // Gather context data in parallel
  const [projectResult, recordings, photos, companyResult] = await Promise.all([
    supabase
      .from('projects')
      .select(
        '*, client:clients(name, email, phone, address, city, state, zip, preferred_language)'
      )
      .eq('id', projectId)
      .single(),
    getProjectRecordings(supabase, projectId),
    getProjectPhotos(supabase, projectId),
    supabase
      .from('companies')
      .select(
        'industry, currency_code, default_tax_rate, default_payment_terms, default_warranty_terms, name, default_estimate_language'
      )
      .eq('id', companyId)
      .single(),
  ])

  const project = projectResult.data
  const company = companyResult.data

  if (!project) throw new Error('Project not found')
  if (!company) throw new Error('Company not found')

  const currencyCode = normalizeCurrencyCode(company.currency_code)
  const priceBookItems = (await getPriceBookItems(supabase, companyId)).filter(
    (item) => normalizeCurrencyCode(item.currency_code) === currencyCode
  )

  const hasTranscripts = recordings.some(
    (r) => r.transcript && r.transcript.trim().length > 0
  )
  const hasPhotos = photos.length > 0
  if (!hasTranscripts && !hasPhotos) {
    throw new Error('At least one audio transcript or photo is required')
  }

  const client = project.client as {
    name: string
    email: string | null
    phone: string | null
    address: string | null
    city: string | null
    state: string | null
    zip: string | null
    preferred_language: EstimateLanguage | null
  } | null

  // Phase 52: resolve target language via cascade
  const language = resolveEstimateLanguage({
    override: options.language ?? null,
    clientPreferred: client?.preferred_language ?? null,
    companyDefault:
      (company.default_estimate_language as EstimateLanguage | null) ?? null,
    userAppLanguage: options.userAppLanguage ?? null,
  })

  const clientAddress = client
    ? [client.address, client.city, client.state, client.zip]
        .filter(Boolean)
        .join(', ')
    : null

  const transcripts = recordings
    .filter((r) => r.transcript && r.transcript.trim().length > 0)
    .map((r) => r.transcript!)

  const photoDescriptions = photos
    .filter((p) => p.ai_description && p.ai_description.trim().length > 0)
    .map((p, i) => `Photo ${i + 1}: ${p.ai_description}`)

  const estimateInput: EstimateInput = {
    industry: company.industry,
    projectName: project.name,
    projectType: project.project_type,
    targetBudget: project.target_budget ? Number(project.target_budget) : null,
    clientName: client?.name ?? null,
    clientAddress,
    transcripts,
    photoDescriptions,
    priceBookItems,
    currencyCode,
    defaultPaymentTerms: company.default_payment_terms ?? null,
    defaultWarrantyTerms: company.default_warranty_terms ?? null,
    language,
  }

  const provider = await getAIProvider(companyId)
  const aiEstimate = await provider.generateEstimate(estimateInput)

  // Client suggestion — only when project has no linked client.
  // When an exact-normalized match exists, auto-link inline (service-role context
  // bypasses RLS; cannot call an authenticated server action from Inngest/webhook).
  // Failure of the inline update is non-fatal — estimate generation still succeeds
  // and the toast falls back to manual "Link" via autoLinked: false.
  let clientSuggestion: ClientSuggestion | null = null
  const detectedClientName = aiEstimate.suggested_client_name?.trim()
  if (!client && detectedClientName) {
    const { data: existingClients } = await supabase
      .from('clients')
      .select('id, name')
      .eq('company_id', companyId)

    const normalizedDetectedName = normalizeClientNameForMatch(detectedClientName)
    const matchedClient = (existingClients ?? []).find(
      (c) =>
        normalizeClientNameForMatch(c.name as string) === normalizedDetectedName
    )

    let autoLinked = false
    if (matchedClient?.id) {
      const { error: linkError } = await supabase
        .from('projects')
        .update({ client_id: matchedClient.id as string })
        .eq('id', projectId)

      if (linkError) {
        // Non-fatal — estimate generation must still succeed.
        // Toast will fall back to manual "Link" path on the client.
        console.warn(
          '[generate-estimate] auto-link failed, falling back to manual link toast',
          linkError
        )
      } else {
        autoLinked = true
      }
    }

    clientSuggestion = {
      detectedName: detectedClientName,
      matchedClientId: (matchedClient?.id as string | undefined) ?? null,
      matchedClientName: (matchedClient?.name as string | undefined) ?? null,
      autoLinked,
    }
  }

  // Patch project name only if it's still the eager-create placeholder (D-05)
  if (aiEstimate.suggested_project_name?.trim()) {
    const { data: currentProject } = await supabase
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .single()
    if (
      currentProject?.name &&
      currentProject.name.startsWith(PLACEHOLDER_PREFIX)
    ) {
      await supabase
        .from('projects')
        .update({ name: aiEstimate.suggested_project_name.trim() })
        .eq('id', projectId)
    }
  }

  // Server-side math validation
  const taxRate = Number(company.default_tax_rate) || 0

  const calculatedSections = aiEstimate.sections.map((section) => {
    const items = section.items.map((item) => ({
      ...item,
      total: Math.round(item.quantity * item.unit_price * 100) / 100,
    }))
    const sectionSubtotal = items.reduce((sum, item) => sum + item.total, 0)
    return {
      title: section.title,
      items,
      subtotal: Math.round(sectionSubtotal * 100) / 100,
    }
  })

  const subtotal =
    Math.round(
      calculatedSections.reduce((sum, s) => sum + s.subtotal, 0) * 100
    ) / 100
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100
  const grandTotal = Math.round((subtotal + taxAmount) * 100) / 100

  // Version management
  await supabase
    .from('estimates')
    .update({ is_current: false })
    .eq('project_id', projectId)

  const { data: existingEstimates } = await supabase
    .from('estimates')
    .select('version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)

  const nextVersion = (existingEstimates?.[0]?.version ?? 0) + 1

  // Persist estimate
  const { data: estimate, error: estimateError } = await supabase
    .from('estimates')
    .insert({
      project_id: projectId,
      company_id: companyId,
      currency_code: currencyCode,
      version: nextVersion,
      is_current: true,
      status: 'draft',
      workflow_status: 'draft',
      summary: aiEstimate.summary,
      notes: aiEstimate.notes ?? null,
      timeline: aiEstimate.timeline ?? null,
      payment_terms:
        aiEstimate.payment_terms ?? company.default_payment_terms ?? null,
      warranty_terms:
        aiEstimate.warranty_terms ?? company.default_warranty_terms ?? null,
      subtotal,
      discount_type: null,
      discount_value: 0,
      discount_amount: 0,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total: grandTotal,
      language,
    })
    .select('id')
    .single()

  if (estimateError || !estimate) {
    throw new Error('Failed to save estimate')
  }

  const estimateId = estimate.id as string

  // Insert sections and items
  for (let sIdx = 0; sIdx < calculatedSections.length; sIdx++) {
    const section = calculatedSections[sIdx]

    const { data: sectionRow, error: sectionError } = await supabase
      .from('estimate_sections')
      .insert({
        estimate_id: estimateId,
        company_id: companyId,
        title: section.title,
        sort_order: sIdx,
        subtotal: section.subtotal,
      })
      .select('id')
      .single()

    if (sectionError || !sectionRow) {
      throw new Error('Failed to save estimate section')
    }

    const sectionId = sectionRow.id as string

    if (section.items.length > 0) {
      const itemRows = section.items.map((item, iIdx) => ({
        section_id: sectionId,
        company_id: companyId,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit ?? null,
        unit_price: item.unit_price,
        total: item.total,
        sort_order: iIdx,
        price_source: item.price_source,
      }))

      const { error: itemsError } = await supabase
        .from('estimate_items')
        .insert(itemRows)

      if (itemsError) {
        throw new Error('Failed to save estimate items')
      }
    }
  }

  // Update project status
  await supabase
    .from('projects')
    .update({ status: 'estimate_ready', total: grandTotal })
    .eq('id', projectId)

  // Log activity
  await supabase.from('estimate_activity').insert({
    project_id: projectId,
    company_id: companyId,
    estimate_id: estimateId,
    event_type: 'estimate_generated',
    metadata: { version: nextVersion },
  })

  // Revalidate paths so workspace and sidebar see fresh data
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/', 'layout')

  return { estimateId, version: nextVersion, clientSuggestion, language }
}
