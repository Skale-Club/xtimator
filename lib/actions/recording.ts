'use server'

import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { getIntegrationKey } from '@/lib/platform-config'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', claims.sub)
    .single()

  if (!company) return { error: 'No company found' as const }

  return { supabase, company }
}

// Text-only recording — no audio file, transcript is the typed description
export async function createTextRecording(
  projectId: string,
  description: string
) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  const { data: recording, error: insertError } = await supabase
    .from('recordings')
    .insert({
      project_id: projectId,
      company_id: company.id,
      storage_path: null, // text-only: no audio file
      transcript: description,
      duration_seconds: 0,
    })
    .select()
    .single()

  if (insertError || !recording) {
    return { error: 'Failed to save description. Please try again.' }
  }

  // Log activity (skip status update — text-only has no audio to track)
  await supabase.from('estimate_activity').insert({
    project_id: projectId,
    company_id: company.id,
    event_type: 'description_added',
    metadata: { source: 'text_input' },
  })

  revalidatePath(`/projects/${projectId}`)
  return { data: recording }
}

export async function createRecording(
  projectId: string,
  storagePath: string,
  durationSeconds: number
) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  const { data: recording, error: insertError } = await supabase
    .from('recordings')
    .insert({
      project_id: projectId,
      company_id: company.id,
      storage_path: storagePath,
      duration_seconds: durationSeconds,
    })
    .select()
    .single()

  if (insertError || !recording) {
    return { error: 'Failed to create recording. Please try again.' }
  }

  // Check if first recording for project — update status to 'recording' per D-20
  const { count } = await supabase
    .from('recordings')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)

  if (count === 1) {
    await supabase
      .from('projects')
      .update({ status: 'recording' })
      .eq('id', projectId)
  }

  // Log activity
  await supabase.from('estimate_activity').insert({
    project_id: projectId,
    company_id: company.id,
    event_type: 'recording_added',
    metadata: { duration_seconds: durationSeconds },
  })

  revalidatePath(`/projects/${projectId}`)
  return { data: recording }
}

export async function transcribeRecording(recordingId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  // Get recording row
  const { data: recording } = await supabase
    .from('recordings')
    .select('storage_path, company_id, project_id')
    .eq('id', recordingId)
    .single()

  if (!recording) return { error: 'Recording not found' }

  if (!recording.storage_path) {
    return { error: 'This recording has no audio file to transcribe.' }
  }

  // Download audio with service role (bypasses RLS for Storage)
  const serviceClient = requireServiceClient()
  const { data: fileData, error: downloadError } = await serviceClient
    .storage
    .from('audio')
    .download(recording.storage_path)

  if (downloadError || !fileData) return { error: 'Failed to download audio' }

  // Send to Whisper API
  const formData = new FormData()
  const ext = recording.storage_path.split('.').pop() ?? 'webm'
  formData.append('file', fileData, `recording.${ext}`)
  formData.append('model', 'whisper-1')
  formData.append('response_format', 'text')

  // Load OpenAI key from DB-backed loader (ADMIN-06)
  const openaiKey = await getIntegrationKey('openai')
  if (!openaiKey) {
    return { error: "Audio transcription isn't available right now. Contact your platform administrator. You can still save and manually edit this recording's transcript." }
  }

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    return { error: `Transcription failed: ${errorText}` }
  }

  const transcript = await response.text()

  // Update recording with transcript
  const { error: updateError } = await supabase
    .from('recordings')
    .update({ transcript })
    .eq('id', recordingId)

  if (updateError) return { error: 'Failed to save transcript' }

  return { data: { transcript } }
}

export async function updateTranscript(recordingId: string, transcript: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  const { error } = await supabase
    .from('recordings')
    .update({ transcript })
    .eq('id', recordingId)

  if (error) return { error: 'Failed to update transcript' }

  return { data: true }
}

export async function deleteRecording(recordingId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  // Get recording to find storage_path and project_id
  const { data: recording } = await supabase
    .from('recordings')
    .select('storage_path, project_id')
    .eq('id', recordingId)
    .single()

  if (!recording) return { error: 'Recording not found' }

  // Delete from Storage audio bucket (skip for text-only recordings with no audio file)
  if (recording.storage_path) {
    const { error: storageError } = await supabase
      .storage
      .from('audio')
      .remove([recording.storage_path])

    if (storageError) {
      return { error: 'Failed to delete audio file' }
    }
  }

  // Delete DB row
  const { error: dbError } = await supabase
    .from('recordings')
    .delete()
    .eq('id', recordingId)

  if (dbError) return { error: 'Failed to delete recording' }

  revalidatePath(`/projects/${recording.project_id}`)
  return { data: true }
}
