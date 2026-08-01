import { describe, expect, it } from 'vitest'
import { resolveClientIp } from '@/lib/http/client-ip'

/**
 * Quick task 260801-hh4: resolveClientIp() shared helper.
 *
 * Behavior is pinned to match app/api/estimates/[id]/sign/route.ts's
 * pre-extraction inline logic EXACTLY (also asserted behaviorally through the
 * route by tests/unit/api/sign-route-contract.test.ts):
 *   - last x-forwarded-for entry wins (single trusted appending edge proxy)
 *   - x-real-ip is never read
 *   - isIP() gates the result — anything that isn't a well-formed IPv4/IPv6
 *     literal resolves to null, never a raw string
 */
describe('resolveClientIp', () => {
  it('single-entry x-forwarded-for returns that IP', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.9' })
    expect(resolveClientIp(headers)).toBe('203.0.113.9')
  })

  it('multi-entry x-forwarded-for returns the LAST entry, not the first', () => {
    const headers = new Headers({ 'x-forwarded-for': '198.51.100.1, 203.0.113.9' })
    expect(resolveClientIp(headers)).toBe('203.0.113.9')
  })

  it('x-real-ip present and x-forwarded-for absent returns null', () => {
    const headers = new Headers({ 'x-real-ip': '203.0.113.7' })
    expect(resolveClientIp(headers)).toBeNull()
  })

  it('x-real-ip present and x-forwarded-for present returns the XFF last entry (x-real-ip ignored)', () => {
    const headers = new Headers({
      'x-real-ip': '203.0.113.7',
      'x-forwarded-for': '198.51.100.1, 203.0.113.9',
    })
    expect(resolveClientIp(headers)).toBe('203.0.113.9')
    expect(resolveClientIp(headers)).not.toBe('203.0.113.7')
  })

  it('garbage / non-IP value resolves to null', () => {
    const headers = new Headers({ 'x-forwarded-for': 'not-an-ip-at-all' })
    expect(resolveClientIp(headers)).toBeNull()
  })

  it('IPv6 literal is returned', () => {
    const headers = new Headers({ 'x-forwarded-for': '2001:db8::1' })
    expect(resolveClientIp(headers)).toBe('2001:db8::1')
  })

  it('header absent resolves to null', () => {
    const headers = new Headers({ 'user-agent': 'vitest' })
    expect(resolveClientIp(headers)).toBeNull()
  })

  it('whitespace-heavy and trailing-comma values resolve to the correct last entry', () => {
    const headers = new Headers({ 'x-forwarded-for': '  198.51.100.1  ,  203.0.113.9  ,  ' })
    expect(resolveClientIp(headers)).toBe('203.0.113.9')
  })

  it('empty string header resolves to null', () => {
    const headers = new Headers({ 'x-forwarded-for': '' })
    expect(resolveClientIp(headers)).toBeNull()
  })
})
