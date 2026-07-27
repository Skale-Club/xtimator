import { describe, expect, it } from 'vitest'
import {
  isPrivateRoute,
  PRIVATE_ROUTE_PREFIXES,
  PUBLIC_STATIC_ROUTES,
} from '@/lib/seo/route-policy'

describe('SEO route policy', () => {
  it.each(['/admin', '/dashboard', '/estimate/token', '/oauth/authorize', '/demo/entry'])(
    'classifies %s as private',
    (pathname) => expect(isPrivateRoute(pathname)).toBe(true),
  )

  it.each(PUBLIC_STATIC_ROUTES)('keeps %s public', (pathname) => {
    expect(isPrivateRoute(pathname)).toBe(false)
  })

  it('keeps public and private route sets disjoint', () => {
    for (const pathname of PUBLIC_STATIC_ROUTES) {
      expect(PRIVATE_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))).toBe(false)
    }
  })
})
