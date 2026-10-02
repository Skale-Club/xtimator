/**
 * Web Push subscription endpoint.
 *
 * GET                        → { publicKey } (null when push is not configured)
 * POST   { subscription, lang } → add/refresh THIS device in the user's list
 * DELETE { endpoint? }       → remove that device; no endpoint removes all
 *
 * Phase 77 plan 07 (NOTIF-09) stored a single subscription per user. 260928:
 * the column now holds a device list (lib/notifications/push-devices.ts), so a
 * laptop subscribing no longer silently unsubscribes the phone, and the server
 * finally sends (lib/notifications/web-push.ts).
 *
 * The public key is served at RUNTIME rather than inlined as a NEXT_PUBLIC_
 * build arg, so enabling push is a Coolify env change, not a rebuild.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthClaims } from '@/lib/queries/auth'
import { getUserPreferences, upsertUserPreferences } from '@/lib/notifications/preferences'
import { demoGuardResponse } from '@/lib/demo/guard'
import { getVapidPublicKey } from '@/lib/notifications/web-push'
import {
  addPushDevice,
  deviceFromClient,
  parsePushDevices,
  removePushDevices,
  serializePushDevices,
} from '@/lib/notifications/push-devices'

const PostSchema = z.object({
  subscription: z.unknown(),
  lang: z.unknown().optional(),
})

const DeleteSchema = z.object({
  endpoint: z.string().url().optional(),
})

export async function GET() {
  const claims = await getAuthClaims()
  if (!claims?.sub) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ publicKey: getVapidPublicKey() })
}

export async function POST(req: Request) {
  try {
    const claims = await getAuthClaims()
    if (!claims?.sub) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const blocked = await demoGuardResponse()
    if (blocked) return blocked
    if (!getVapidPublicKey()) {
      return NextResponse.json({ error: 'push_not_configured' }, { status: 503 })
    }
    const json = await req.json().catch(() => ({}))
    const parsed = PostSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
    }
    const device = deviceFromClient(parsed.data.subscription, parsed.data.lang, new Date().toISOString())
    if (!device) {
      return NextResponse.json({ error: 'invalid_subscription' }, { status: 400 })
    }
    const userId = claims.sub as string
    const prefs = await getUserPreferences(userId)
    const devices = addPushDevice(parsePushDevices(prefs?.push_subscription), device)
    await upsertUserPreferences(userId, { push_subscription: serializePushDevices(devices) })
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'write_failed' },
      { status: 500 },
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const claims = await getAuthClaims()
    if (!claims?.sub) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const blocked = await demoGuardResponse()
    if (blocked) return blocked
    const json = await req.json().catch(() => ({}))
    const parsed = DeleteSchema.safeParse(json ?? {})
    const endpoint = parsed.success ? parsed.data.endpoint : undefined
    const userId = claims.sub as string
    if (!endpoint) {
      await upsertUserPreferences(userId, { push_subscription: null })
      return new NextResponse(null, { status: 204 })
    }
    const prefs = await getUserPreferences(userId)
    const devices = removePushDevices(parsePushDevices(prefs?.push_subscription), [endpoint])
    await upsertUserPreferences(userId, { push_subscription: serializePushDevices(devices) })
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'write_failed' },
      { status: 500 },
    )
  }
}
