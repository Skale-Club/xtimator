import { describe, it, expect } from 'vitest'
import { isProtectedRoute, isPublicRoute } from '@/proxy'

// The client signs from the public page without a session. These endpoints
// authenticate themselves with the share token, so the proxy must let an
// anonymous request through instead of redirecting it to /?auth=login (which
// silently broke online estimate signing in production).
const ID = '111f3880-78e4-4a5e-a835-fc4116de4f39'

describe('proxy: token-authenticated client endpoints', () => {
  it.each([
    `/api/estimates/${ID}/sign`,
    `/api/estimates/${ID}/pdf`,
    `/api/change-orders/${ID}/sign`,
    `/api/change-orders/${ID}/pdf`,
  ])('lets %s through without a session', (path) => {
    expect(isProtectedRoute(path)).toBe(true)
    expect(isPublicRoute(path)).toBe(true)
  })

  it.each([
    `/api/estimates/${ID}`,
    `/api/estimates/${ID}/send`,
    `/api/estimates/${ID}/refine`,
    `/api/estimates/${ID}/sign/extra`,
    `/api/estimates/${ID}/pdf/extra`,
    `/api/estimates/not-a-uuid/pdf`,
    `/api/estimates/not-a-uuid/sign`,
    `/api/change-orders/${ID}`,
    `/api/change-orders/${ID}/pdfx`,
  ])('keeps %s protected', (path) => {
    expect(isPublicRoute(path)).toBe(false)
  })
})
