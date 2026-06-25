'use server'

/**
 * lib/actions/chat.ts — CHATUI-03 multimodal normalize server action.
 *
 * normalizeChatInput is the owner-scoped seam the chat composer calls to turn an
 * audio clip or a photo into text BEFORE it becomes a normal sendMessage({ text }).
 * It is a thin wrapper over the channel-neutral normalizeInput (lib/agent-tools)
 * — the chat reimplements NO domain logic.
 *
 * Auth posture mirrors app/api/chat/route.ts exactly: authenticate the owner via
 * supabase.auth.getClaims() (the plan's `getAuthClaims` helper does not exist in
 * this codebase — the route uses createClient().auth.getClaims() — Rule 3), then
 * resolve the ACTIVE company via getActiveCompanyId() (the trusted tenant, NEVER
 * from the argument).
 *
 * CHATMETER-01: adds NO credit code. normalizeInput → ingestMultimodal already
 * accounts for transcription/vision per v4.7; re-accounting here would double-charge.
 * NEVER throws (mirrors normalizeInput).
 */
import { normalizeInput } from '@/lib/agent-tools'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'

type ChatNormalizeArg =
  | { kind: 'audio'; base64: string; ext: string }
  | { kind: 'photo'; base64: string; mimeType: string; caption?: string }

export async function normalizeChatInput(
  arg: ChatNormalizeArg,
): Promise<{ ok: boolean; text: string; reason?: string }> {
  // 1. Authenticate the owner (same path as the chat route).
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims?.sub) {
    return { ok: false, text: '', reason: 'unauthorized' }
  }

  // 2. Resolve the ACTIVE company — the trusted tenant (never from the arg).
  const companyId = await getActiveCompanyId()
  if (!companyId) {
    return { ok: false, text: '', reason: 'no_active_company' }
  }

  if (arg.kind === 'audio') {
    const bytes = Buffer.from(arg.base64, 'base64')
    const blob = new Blob([bytes])
    const r = await normalizeInput({ kind: 'audio', blob, ext: arg.ext })
    return { ok: r.ok, text: r.text, reason: r.reason }
  }

  const r = await normalizeInput({
    kind: 'photo',
    base64: arg.base64,
    mimeType: arg.mimeType,
    caption: arg.caption,
  })
  return { ok: r.ok, text: r.text, reason: r.reason }
}
