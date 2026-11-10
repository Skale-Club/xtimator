'use server'

import { cookies } from 'next/headers'
import { getAuthClaims } from '@/lib/queries/auth'
import { requireServiceClient } from '@/lib/supabase/service'
import {
  OWNER_DEVICE_COOKIE,
  OWNER_DEVICE_MAX_AGE_SECONDS,
  OWNER_DEVICE_MAX_COMPANIES,
  readOwnerDeviceCompanyIds,
  signOwnerDeviceCookie,
} from '@/lib/estimates/owner-visit'

/**
 * Marks this browser as belonging to the signed-in user's companies, so the
 * user's own previews of a share link are never counted as client views (see
 * lib/estimates/owner-visit.ts). Covers EVERY company the user belongs to, not
 * just the active one, so switching company never un-marks a device.
 * No-op when signed out; never throws (it is a background nicety).
 */
export async function markOwnerDevice(): Promise<void> {
  try {
    const claims = await getAuthClaims()
    const userId = (claims?.sub as string | undefined) ?? null
    if (!userId) return

    const { data } = await requireServiceClient()
      .from('company_members')
      .select('company_id')
      .eq('user_id', userId)
      .limit(OWNER_DEVICE_MAX_COMPANIES)
    const own = (data ?? []).map((r: { company_id: string }) => r.company_id).filter(Boolean)
    if (own.length === 0) return

    const cookieStore = await cookies()
    const existing = readOwnerDeviceCompanyIds(cookieStore.get(OWNER_DEVICE_COOKIE)?.value)
    // Current memberships last so they survive the 10-id cap over stale ones.
    const merged = [...existing.filter((id) => !own.includes(id)), ...own]

    cookieStore.set(OWNER_DEVICE_COOKIE, signOwnerDeviceCookie(merged), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: OWNER_DEVICE_MAX_AGE_SECONDS,
    })
  } catch {
    /* best-effort */
  }
}
