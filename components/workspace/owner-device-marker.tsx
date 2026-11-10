'use client'

import { useEffect } from 'react'
import { markOwnerDevice } from '@/lib/actions/owner-device'

const STORAGE_KEY = 'xt_owner_device_marked_at'
const REFRESH_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Silently marks this browser as the owner's (httpOnly cookie, set by the
 * server action) so previewing their own share link isn't counted as a client
 * view. Re-marks at most every 30 days to refresh the 1-year cookie.
 */
export function OwnerDeviceMarker() {
  useEffect(() => {
    let last = 0
    try {
      last = Number(window.localStorage.getItem(STORAGE_KEY) ?? 0) || 0
    } catch {
      /* storage blocked — just mark again */
    }
    if (last && Date.now() - last < REFRESH_MS) return
    void markOwnerDevice()
      .then(() => {
        try {
          window.localStorage.setItem(STORAGE_KEY, String(Date.now()))
        } catch {
          /* ignore */
        }
      })
      .catch(() => {})
  }, [])
  return null
}
