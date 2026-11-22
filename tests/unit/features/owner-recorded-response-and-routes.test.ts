import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isProtectedRoute, isPublicRoute } from '@/proxy'

/**
 * XTM-D-20261121-feature-switches (unit-test audit).
 *
 * 1. Rule 6 corollary: the OWNER can always record the client's answer by hand
 *    (a phone call, a text), also when online signing is off. Those actions must
 *    not depend on the signature switches. (Behavior: owner-actions.test.ts and
 *    estimate-response.test.ts run them against a fake that has no `companies`
 *    table; the static guard below pins the source.)
 *
 * 2. The new tenant settings route and the Connect routes sit behind the same
 *    session as every other settings page. proxy.ts protects by PREFIX, so the
 *    new page inherits it; these tests fail if someone narrows the prefixes or
 *    exempts the route.
 */

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const read = (f: string) => strip(readFileSync(resolve(process.cwd(), f), 'utf8'))

describe('owner-recorded responses do not depend on the signature switches', () => {
  it.each(['lib/actions/estimate-response.ts', 'lib/actions/change-order.ts'])('%s', (file) => {
    const src = read(file)
    expect(src).not.toMatch(/digital_signature_(allowed|enabled)/)
    expect(src).not.toMatch(/resolveDigitalSignature|resolveCompanyFeatures|company-features|platform-feature-state/)
  })

  it('the manual-response functions exist where the guard looks', () => {
    expect(read('lib/actions/estimate-response.ts')).toMatch(/export async function recordClientResponse/)
    expect(read('lib/actions/change-order.ts')).toMatch(/export async function recordChangeOrderResponse/)
  })
})

describe('client-actions routes are behind the session', () => {
  const PROTECTED = [
    '/settings/client-actions',
    '/settings/client-actions/',
    '/settings/integrations/stripe',
    '/settings/integrations',
    '/api/stripe/connect/initiate',
    '/api/stripe/connect/callback',
    '/api/stripe/connect/disconnect',
  ]

  it.each(PROTECTED)('%s: an anonymous visitor is redirected', (path) => {
    // proxy.ts: `!claims && isProtectedRoute(pathname) && !isPublicRoute(pathname)`
    expect(isProtectedRoute(path)).toBe(true)
    expect(isPublicRoute(path)).toBe(false)
  })

  it('every other settings page uses the same prefix, so the new route cannot be the odd one out', () => {
    for (const sibling of ['/settings', '/settings/estimates', '/settings/integrations', '/settings/billing']) {
      expect(isProtectedRoute(sibling)).toBe(true)
    }
  })

  it('the Stripe webhook stays public (signature-verified), unlike the Connect routes', () => {
    expect(isPublicRoute('/api/webhooks/stripe')).toBe(true)
  })

  it('the public share and sign endpoints are the only anonymous client routes', () => {
    const id = '3b241101-e2bb-4255-8caf-4136c566a962'
    expect(isPublicRoute(`/api/estimates/${id}/sign`)).toBe(true)
    expect(isPublicRoute(`/api/change-orders/${id}/sign`)).toBe(true)
    // nothing about the switches or Connect is reachable anonymously
    expect(isPublicRoute('/settings/client-actions')).toBe(false)
    expect(isPublicRoute('/api/stripe/connect/disconnect')).toBe(false)
  })
})

describe('owner surfaces keep already-issued invoices (and Void) when payments are off', () => {
  it('the estimate editor renders the issued-invoices panel outside any paymentsEnabled gate', () => {
    const src = read('components/workspace/estimate/estimate-editor.tsx')
    const at = src.indexOf('<IssuedInvoicesPanel')
    expect(at).toBeGreaterThan(-1)
    const lineStart = src.lastIndexOf('\n', at)
    const before = src.slice(Math.max(0, lineStart - 200), at)
    expect(before).not.toMatch(/paymentsEnabled/)
    // ...while the forward-looking Generate affordance IS gated
    expect(src).toMatch(/isCurrent && paymentsEnabled && !billingReadOnly/)
  })

  it('the issued-invoices panel takes no payments prop (nothing to gate on)', () => {
    const src = read('components/workspace/estimate/issued-invoices-panel.tsx')
    expect(src).not.toMatch(/paymentsEnabled|canIssue|resolveCompanyFeatures/)
  })

  it('the change order editor shows its invoice row whenever an invoice exists, and gates only NEW invoicing', () => {
    const src = read('components/workspace/change-orders/change-order-editor.tsx')
    expect(src).toMatch(/\{invoice && \(\s*<div className="mt-3">\s*<ChangeOrderInvoiceRow/)
    expect(src).toMatch(/const canInvoice = approved && !!invoicing\?\.paymentsEnabled/)
  })
})

