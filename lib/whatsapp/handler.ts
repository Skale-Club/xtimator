/**
 * Phase 42: WhatsApp Inbound Processing
 *
 * Processes inbound WhatsApp messages from business owners.
 * Audio → Whisper → estimate, Text → estimate, Image → Claude Vision → estimate.
 * After generation sends a confirmation summary and creates an awaiting_confirm session.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { downloadWhatsAppMedia, sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { getIntegrationKey } from '@/lib/platform-config'
import { PLACEHOLDER_PREFIX } from '@/lib/constants/project'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'

const SESSION_TTL_MINUTES = 30

// -------------------------------------------------------------------------
// Entry point — called fire-and-forget from the webhook route
// -------------------------------------------------------------------------
export async function processInboundMessage(
  message: WhatsAppMessage,
  companyId: string,
  fromPhone: string,  // E.164 without leading +
  supabase: SupabaseClient
): Promise<void> {
  const ownerPhone = `+${fromPhone}`

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
    // Phase 43 handles "send" / "cancel" parsing — for now, acknowledge
    await sendWhatsAppMessage(ownerPhone, {
      type: 'text',
      text: {
        body: 'You have an estimate pending. Reply *send* to deliver it or *cancel* to discard.',
      },
    })
    return
  }

  // 2. Create a draft project for this conversation
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

  // 3. Dispatch by message type
  let inputReady = false
  try {
    switch (message.type) {
      case 'text':
        await handleTextMessage(message, projectId, companyId, supabase)
        inputReady = true
        break
      case 'audio':
        await handleAudioMessage(message, projectId, companyId, supabase)
        inputReady = true
        break
      case 'image':
        await handleImageMessage(message, projectId, companyId, supabase)
        inputReady = true
        break
      default:
        await sendWhatsAppMessage(ownerPhone, {
          type: 'text',
          text: {
            body: 'I can process audio recordings, text descriptions, and photos. Please send one of those to generate an estimate.',
          },
        })
        // Clean up the empty project
        await supabase.from('projects').delete().eq('id', projectId)
        return
    }
  } catch (err) {
    console.error('[WhatsApp] Input processing failed:', err)
    await sendWhatsAppMessage(ownerPhone, {
      type: 'text',
      text: { body: 'Sorry, I had trouble processing your message. Please try again.' },
    })
    await supabase.from('projects').delete().eq('id', projectId)
    return
  }

  if (!inputReady) return

  // 4. Generate estimate
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

  // 5. Load estimate for summary
  const { data: estimate } = await supabase
    .from('estimates')
    .select('total, summary, sections:estimate_sections(title, subtotal)')
    .eq('id', estimateId)
    .single()

  // 6. Create awaiting_confirm session
  const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000).toISOString()
  await supabase.from('whatsapp_sessions').insert({
    company_id: companyId,
    phone_number: ownerPhone,
    state: 'awaiting_confirm',
    draft_project_id: projectId,
    draft_estimate_id: estimateId,
    expires_at: expiresAt,
  })

  // 7. Send confirmation summary
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
  whisperForm.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), 'audio.ogg')
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

  const { error: uploadError } = await supabase.storage
    .from('photos')
    .upload(storagePath, imageBuffer, { contentType: mimeType, upsert: false })

  if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`)

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
