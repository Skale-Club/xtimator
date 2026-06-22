/**
 * Phase 77 plan 07 (NOTIF-08) — Notification preferences API.
 *
 * GET   → current user's prefs (with `push_enabled` derived boolean)
 * PATCH → partial update (categories, email_digest_enabled, push_subscription)
 *
 * Best-effort: read or write failures return 500 JSON, never throw.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthClaims } from '@/lib/queries/auth'
import {
  getUserPreferences,
  upsertUserPreferences,
} from '@/lib/notifications/preferences'
import { DEFAULT_PREFERENCES } from '@/lib/notifications/event-types'

const ChannelSchema = z.object({
  in_app: z.boolean().optional(),
  email: z.boolean().optional(),
  whatsapp: z.boolean().optional(),
  sms: z.boolean().optional(),
})

const PatchSchema = z.object({
  categories: z.record(z.string(), ChannelSchema).optional(),
  email_digest_enabled: z.boolean().optional(),
  push_subscription: z.unknown().nullable().optional(),
})

export async function GET() {
  try {
    const claims = await getAuthClaims()
    if (!claims?.sub) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const prefs = await getUserPreferences(claims.sub as string)
    return NextResponse.json({
      categories: prefs?.categories ?? {},
      email_digest_enabled: prefs?.email_digest_enabled ?? true,
      push_enabled: !!prefs?.push_subscription,
      defaults: DEFAULT_PREFERENCES,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'read_failed' },
      { status: 500 },
    )
  }
}

export async function PATCH(req: Request) {
  try {
    const claims = await getAuthClaims()
    if (!claims?.sub) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const json = await req.json().catch(() => ({}))
    const parsed = PatchSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_body', issues: parsed.error.issues },
        { status: 400 },
      )
    }
    await upsertUserPreferences(claims.sub as string, parsed.data)
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'write_failed' },
      { status: 500 },
    )
  }
}
