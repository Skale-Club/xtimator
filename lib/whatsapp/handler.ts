/**
 * Phase 42: WhatsApp Inbound Processing
 * Phase 48: Multi-message debounce (SEED-010) — aggregates messages within a
 *           5-second window into a single estimate.
 *
 * Processes inbound WhatsApp messages from business owners.
 * Audio → Whisper → estimate, Text → estimate, Image → Claude Vision → estimate.
 * After generation sends a confirmation summary and creates an awaiting_confirm session.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { createStorage } from '@/lib/storage'
import {
  downloadWhatsAppMedia,
  sendWhatsAppMessage,
  markMessageAsRead,
  sendTypingIndicator,
} from '@/lib/whatsapp/client'
import { processConfirmationReply } from '@/lib/whatsapp/confirm'
import { getIntegrationKey } from '@/lib/platform-config'
import { getEntitlements } from '@/lib/entitlements'
import { PLACEHOLDER_PREFIX } from '@/lib/constants/project'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'
import {
  pushToBuffer,
  tryClaimBuffer,
  debounceWait,
  type BufferedMessage,
} from '@/lib/whatsapp/buffer'

const SESSION_TTL_MINUTES = 30

// -------------------------------------------------------------------------
// Entry point — webhook route calls this fire-and-forget.
//
// Phase 48: routes to debounce buffer when no session exists (so multiple
// messages collapse into one estimate). When a session exists, the message
// goes straight to the legacy single-message path which delegates to confirm.
// -------------------------------------------------------------------------
export async function processInboundWithDebounce(
  message: WhatsAppMessage,
  companyId: string,
  fromPhone: string,
  supabase: SupabaseClient
): Promise<void> {
  const ownerPhone = `+${fromPhone}`

  // UX feedback first — both paths benefit
  await markMessageAsRead(message.id)
  await sendTypingIndicator(message.id)

  // Check for active session — if found, skip debounce (confirmation flow)
  const { data: existingSession } = await supabase
    .from('whatsapp_sessions')
    .select('id, state, draft_project_id, draft_estimate_id')
    .eq('company_id', companyId)
    .eq('phone_number', ownerPhone)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existingSession?.state === 'awaiting_confirm') {
    // Session exists → no debounce, process this single message immediately
    return processSingleMessageWithSession(
      message,
      existingSession as { id: string; state: string; draft_project_id: string | null; draft_estimate_id: string | null },
      companyId,
      ownerPhone,
      supabase
    )
  }

  // No session → debounce path
  const pushed = await pushToBuffer(fromPhone, message)
  if (!pushed) {
    // Redis unavailable — fall back to immediate single-message processing
    return processInboundMessages([message], companyId, fromPhone, supabase)
  }

  // Wait for the debounce window. If a newer message arrives during the wait,
  // its own worker will become the winner and ours will exit silently below.
  await debounceWait()

  // Refresh typing indicator (the original one is expiring on Meta's side)
  await sendTypingIndicator(message.id)

  const batch = await tryClaimBuffer(fromPhone, message.id)
  if (!batch) return  // Someone newer is processing

  await processInboundMessages(
    batch.map((b) => b.message),
    companyId,
    fromPhone,
    supabase
  )
}

// -------------------------------------------------------------------------
// Backwards-compat entry — calls processInboundWithDebounce internally.
// Kept so existing tests / direct callers don't break.
// -------------------------------------------------------------------------
export async function processInboundMessage(
  message: WhatsAppMessage,
  companyId: string,
  fromPhone: string,  // E.164 without leading +
  supabase: SupabaseClient
): Promise<void> {
  const ownerPhone = `+${fromPhone}`

  // 0. UX feedback: mark as read + show typing indicator (fire-and-forget)
  // These keep the user reassured during the 20-40s of AI work that follows.
  // Meta API failures are swallowed inside markMessageAsRead/sendTypingIndicator.
  await markMessageAsRead(message.id)
  await sendTypingIndicator(message.id)

  // 1. Check for active awaiting_confirm session — Phase 43 handles confirm/cancel replies
  const { data: existingSession } = await supabase
    .from('whatsapp_sessions')
    .select('id, state, draft_project_id, draft_estimate_id')
    .eq('company_id', companyId)
    .eq('phone_number', ownerPhone)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existingSession?.state === 'awaiting_confirm') {
    return processSingleMessageWithSession(
      message,
      existingSession as { id: string; state: string; draft_project_id: string | null; draft_estimate_id: string | null },
      companyId,
      ownerPhone,
      supabase
    )
  }

  // No session → process this single message directly (used by legacy paths and
  // by the Redis-unavailable fallback in processInboundWithDebounce)
  return processInboundMessages([message], companyId, fromPhone, supabase)
}

// -------------------------------------------------------------------------
// Single-message handler for the awaiting_confirm path.
// -------------------------------------------------------------------------
async function processSingleMessageWithSession(
  message: WhatsAppMessage,
  session: { id: string; state: string; draft_project_id: string | null; draft_estimate_id: string | null },
  companyId: string,
  ownerPhone: string,
  supabase: SupabaseClient
): Promise<void> {
  if (message.type === 'text' && message.text?.body) {
    await processConfirmationReply(message.text.body, session, companyId, ownerPhone, supabase)
  } else {
    await sendWhatsAppMessage(ownerPhone, {
      type: 'text',
      text: {
        body: 'Reply *send* to deliver your estimate or *cancel* to discard it.',
      },
    })
  }
}

// -------------------------------------------------------------------------
// Multi-message processor — creates ONE project from N messages, generates
// ONE estimate, sends ONE confirmation. Used by the debounce path AND by
// the single-message fallback (when there's no session).
// -------------------------------------------------------------------------
export async function processInboundMessages(
  messages: WhatsAppMessage[],
  companyId: string,
  fromPhone: string,
  supabase: SupabaseClient
): Promise<void> {
  if (messages.length === 0) return
  const ownerPhone = `+${fromPhone}`

  // QUOTA-05: Check WhatsApp entitlement BEFORE any Meta download or AI call.
  // Free tier has whatsappEnabled: false — reject here to avoid Whisper/Vision costs.
  const { data: companyRow } = await supabase
    .from('companies')
    .select('tier')
    .eq('id', companyId)
    .single()
  const tier = (companyRow as { tier: string } | null)?.tier ?? 'free'
  const entitlements = getEntitlements(tier)

  if (!entitlements.whatsappEnabled) {
    await sendWhatsAppMessage(ownerPhone, {
      type: 'text',
      text: {
        body: 'WhatsApp channel is not available on your current plan. Upgrade at /settings/billing',
      },
    })
    return
  }

  const lastMessageId = messages[messages.length - 1].id

  // Create a single draft project for the entire batch
  const placeholderName = `${PLACEHOLDER_PREFIX}WhatsApp`
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      company_id: companyId,
      client_id: null,
      name: placeholderName,
      project_type: null,
      input_mode: null,
      status: 'draft',
      target_budget: null,
      total: 0,
    })
    .select('id')
    .single()

  if (projectError || !project) {
    console.error('[WhatsApp] Failed to create project:', projectError)
    return
  }
  const projectId = project.id as string

  // Dispatch each message by type, accumulating into the same project.
  // Errors on any single message are logged but don't kill the whole batch —
  // best-effort aggregation. If NOTHING succeeds, we abort below.
  let successfulInputs = 0
  let unsupportedCount = 0
  for (const message of messages) {
    try {
      switch (message.type) {
        case 'text':
          await handleTextMessage(message, projectId, companyId, supabase)
          successfulInputs++
          break
        case 'audio':
          await handleAudioMessage(message, projectId, companyId, supabase)
          successfulInputs++
          break
        case 'image':
          await handleImageMessage(message, projectId, companyId, supabase)
          successfulInputs++
          break
        default:
          unsupportedCount++
      }
    } catch (err) {
      console.error('[WhatsApp] Input processing failed for message', message.id, err)
    }
  }

  if (successfulInputs === 0) {
    const text =
      unsupportedCount > 0
        ? 'I can process audio recordings, text descriptions, and photos. Please send one of those to generate an estimate.'
        : 'Sorry, I had trouble processing your message. Please try again.'
    await sendWhatsAppMessage(ownerPhone, { type: 'text', text: { body: text } })
    await supabase.from('projects').delete().eq('id', projectId)
    return
  }

  // Refresh typing indicator before AI generation (the 25s window is closing)
  await sendTypingIndicator(lastMessageId)

  // Generate estimate from the aggregated project
  let result: Awaited<ReturnType<typeof generateEstimateForProject>>
  try {
    result = await generateEstimateForProject(companyId, projectId)
  } catch (err) {
    console.error('[WhatsApp] Estimate generation failed:', err)
    await sendWhatsAppMessage(ownerPhone, {
      type: 'text',
      text: { body: 'Estimate generation failed. Please try again.' },
    })
    await supabase.from('projects').delete().eq('id', projectId)
    return
  }

  const { estimateId } = result

  // Load estimate for summary
  const { data: estimate } = await supabase
    .from('estimates')
    .select('total, summary, sections:estimate_sections(title, subtotal)')
    .eq('id', estimateId)
    .single()

  // Create awaiting_confirm session
  const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000).toISOString()
  await supabase.from('whatsapp_sessions').insert({
    company_id: companyId,
    phone_number: ownerPhone,
    state: 'awaiting_confirm',
    draft_project_id: projectId,
    draft_estimate_id: estimateId,
    expires_at: expiresAt,
  })

  // Send confirmation summary
  const confirmationText = buildConfirmationMessage(estimate)
  await sendWhatsAppMessage(ownerPhone, {
    type: 'text',
    text: { body: confirmationText },
  })
}

// -------------------------------------------------------------------------
// Message type handlers
// -------------------------------------------------------------------------

async function handleTextMessage(
  message: WhatsAppMessage,
  projectId: string,
  companyId: string,
  supabase: SupabaseClient
): Promise<void> {
  const transcript = message.text?.body ?? ''
  if (!transcript.trim()) throw new Error('Empty text message')

  const { error } = await supabase.from('recordings').insert({
    project_id: projectId,
    company_id: companyId,
    storage_path: null,
    transcript,
    duration_seconds: null,
  })
  if (error) throw new Error(`Failed to save transcript: ${error.message}`)
}

async function handleAudioMessage(
  message: WhatsAppMessage,
  projectId: string,
  companyId: string,
  supabase: SupabaseClient
): Promise<void> {
  const audioId = message.audio?.id
  if (!audioId) throw new Error('No audio ID in message')

  const openaiKey = await getIntegrationKey('openai')
  if (!openaiKey) throw new Error('OpenAI key not configured')

  // Download audio from WhatsApp
  const audioBuffer = await downloadWhatsAppMedia(audioId)

  // Transcribe via Whisper (direct fetch — no SDK dependency)
  const whisperForm = new FormData()
  whisperForm.append('file', new Blob([new Uint8Array(audioBuffer)], { type: 'audio/ogg' }), 'audio.ogg')
  whisperForm.append('model', 'whisper-1')
  whisperForm.append('response_format', 'text')

  const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: whisperForm,
  })

  if (!whisperRes.ok) {
    const text = await whisperRes.text().catch(() => 'Unknown')
    throw new Error(`Whisper transcription failed: ${text}`)
  }

  const transcript = (await whisperRes.text()).trim()
  if (!transcript) throw new Error('Empty transcription')

  const { error } = await supabase.from('recordings').insert({
    project_id: projectId,
    company_id: companyId,
    storage_path: null,
    transcript,
    duration_seconds: null,
  })
  if (error) throw new Error(`Failed to save transcript: ${error.message}`)
}

async function handleImageMessage(
  message: WhatsAppMessage,
  projectId: string,
  companyId: string,
  supabase: SupabaseClient
): Promise<void> {
  const imageId = message.image?.id
  if (!imageId) throw new Error('No image ID in message')

  const anthropicKey = await getIntegrationKey('anthropic')
  if (!anthropicKey) throw new Error('Anthropic key not configured')

  // Download image from WhatsApp
  const imageBuffer = await downloadWhatsAppMedia(imageId)
  const mimeType = (message.image?.mime_type ?? 'image/jpeg') as
    | 'image/jpeg'
    | 'image/png'
    | 'image/webp'
    | 'image/gif'

  // Upload to Supabase photos bucket
  const ext = mimeType.split('/')[1] ?? 'jpg'
  const storagePath = `${companyId}/whatsapp/${projectId}-${imageId}.${ext}`

  const storage = createStorage(supabase)
  try {
    await storage.upload('photos', storagePath, imageBuffer, { contentType: mimeType, upsert: false })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    throw new Error(`Photo upload failed: ${message}`)
  }

  // Analyze with Claude Vision
  const anthropic = new Anthropic({ apiKey: anthropicKey })
  const base64Data = imageBuffer.toString('base64')

  const visionRes = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: base64Data },
          },
          {
            type: 'text',
            text: "Describe this photo from a contractor's perspective. Note materials, conditions, measurements if visible, damage, and areas needing work. Be specific and concise.",
          },
        ],
      },
    ],
  })

  const aiDescription =
    visionRes.content[0].type === 'text' ? visionRes.content[0].text : ''

  // Save photo row
  const { error: photoError } = await supabase.from('photos').insert({
    project_id: projectId,
    company_id: companyId,
    storage_path: storagePath,
    ai_description: aiDescription || null,
    caption: message.image?.caption ?? null,
    sort_order: 0,
  })
  if (photoError) throw new Error(`Failed to save photo: ${photoError.message}`)
}

// -------------------------------------------------------------------------
// Confirmation message builder
// -------------------------------------------------------------------------

function buildConfirmationMessage(
  estimate: {
    total: number
    summary: string | null
    sections: Array<{ title: string; subtotal: number }>
  } | null
): string {
  if (!estimate) {
    return (
      '✅ *Estimate ready*\n\nReply *send* to deliver it to your client, or *cancel* to discard.'
    )
  }

  const total = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(estimate.total)

  const sections = (estimate.sections ?? [])
    .map((s) => {
      const subtotal = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(s.subtotal)
      return `• ${s.title}: ${subtotal}`
    })
    .join('\n')

  const lines = [
    `✅ *Estimate ready — ${total}*`,
    '',
    sections,
    '',
    'Reply *send* to deliver to your client, or *cancel* to discard.',
  ]

  return lines.join('\n')
}
