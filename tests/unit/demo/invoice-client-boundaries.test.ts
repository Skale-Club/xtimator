import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const invoiceSource = readFileSync(resolve(process.cwd(), 'lib/actions/invoice.ts'), 'utf8')
const invoiceReservationSource = readFileSync(
  resolve(process.cwd(), 'lib/billing/invoice-reservation.ts'),
  'utf8',
)
const publicEstimateSource = readFileSync(
  resolve(process.cwd(), 'app/estimate/[token]/actions.ts'),
  'utf8',
)
const clientActionSource = readFileSync(resolve(process.cwd(), 'lib/actions/client.ts'), 'utf8')
const clientSheetSource = readFileSync(
  resolve(process.cwd(), 'components/clients/client-sheet.tsx'),
  'utf8',
)

function functionBody(source: string, name: string, opts: { exported?: boolean } = {}): string {
  // A private helper of a 'use server' file must NOT be exported (every export
  // is a callable server action), so it is looked up without the keyword.
  const start =
    opts.exported === false
      ? source.indexOf(`\nasync function ${name}(`) + 1
      : source.indexOf(`export async function ${name}`)
  expect(start, `${name} must remain ${opts.exported === false ? 'a private helper' : 'an exported action'}`).toBeGreaterThan(
    opts.exported === false ? 0 : -1,
  )

  const paramsOpen = source.indexOf('(', start)
  let paramsDepth = 0
  let paramsClose = -1
  for (let index = paramsOpen; index < source.length; index += 1) {
    if (source[index] === '(') paramsDepth += 1
    if (source[index] === ')') paramsDepth -= 1
    if (paramsDepth === 0) {
      paramsClose = index
      break
    }
  }

  const signature = source.slice(paramsClose).match(/^\)\s*(?::.*)?\s*\{/)
  const openingBrace =
    signature === null ? -1 : paramsClose + signature[0].lastIndexOf('{')
  expect(openingBrace, `${name} must have a function body`).toBeGreaterThan(-1)

  let depth = 0
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return source.slice(start, index + 1)
  }

  throw new Error(`Could not isolate ${name}`)
}

function expectGuardBefore(
  body: string,
  effect: RegExp,
  actionName: string,
) {
  const guardIndex = body.search(/assertCompanyWritable\s*\(/)
  const effectIndex = body.search(effect)

  expect(guardIndex, `${actionName} must use the trusted target-company guard`).toBeGreaterThan(-1)
  expect(effectIndex, `${actionName} must contain the protected effect`).toBeGreaterThan(-1)
  expect(guardIndex, `${actionName} must deny demo targets before the effect`).toBeLessThan(
    effectIndex,
  )
}

describe('SAFE-01/SAFE-02: invoice, client, and public estimate mutation boundaries', () => {
  // Delivery 3 of XTM-CONTRACT-CO-01 moved the shared Stripe path into
  // issueInvoice, which both generateInvoice and invoiceChangeOrder call.
  it('both invoice actions go through the guarded issueInvoice path', () => {
    for (const name of ['generateInvoice', 'invoiceChangeOrder']) {
      const body = functionBody(invoiceSource, name)
      expect(body, name).toMatch(/return issueInvoice\(/)
      expect(body, name).not.toMatch(/createConnectInvoice\s*\(/)
    }
  })

  it('uses the explicit estimate company guard before creating a Stripe invoice', () => {
    const body = functionBody(invoiceSource, 'issueInvoice', { exported: false })

    expectGuardBefore(body, /reserveConnectInvoice\s*\(/, 'issueInvoice')
    expectGuardBefore(body, /issueReservedInvoice\s*\(/, 'issueInvoice')
    expect(body).not.toMatch(/isDemoCompany\s*\(/)
  })

  it('allows a normal tenant invoice path to reach Stripe after the guard', () => {
    const body = functionBody(invoiceSource, 'issueInvoice', { exported: false })
    const guardIndex = body.search(/assertCompanyWritable\s*\(/)
    const reservationIndex = body.search(/reserveConnectInvoice\s*\(/)
    const issueIndex = body.search(/issueReservedInvoice\s*\(/)
    const reserveBody = functionBody(invoiceReservationSource, 'reserveConnectInvoice')
    const issuerBody = functionBody(invoiceReservationSource, 'issueReservedInvoice')

    expect(guardIndex).toBeGreaterThan(-1)
    expect(reservationIndex).toBeGreaterThan(guardIndex)
    expect(issueIndex).toBeGreaterThan(guardIndex)
    expect(reserveBody).toMatch(/\.rpc\(['"]reserve_connect_invoice['"]/)
    expect(body).toMatch(/issued\s*=\s*await issueReservedInvoice\(reserved\)/)
    expect(issuerBody).toMatch(/await createConnectInvoice\s*\(/)
  })

  it('denies a demo target before public view persistence, activity, notification, or email', () => {
    const body = functionBody(publicEstimateSource, 'logEstimateView')

    expectGuardBefore(body, /\.update\s*\(/, 'logEstimateView')
    expectGuardBefore(body, /estimate_activity/, 'logEstimateView')
    expectGuardBefore(body, /notify\s*\(/, 'logEstimateView')
    // Phase 193-01 moved the owner "your estimate was viewed" email OFF the
    // request path: logEstimateView now emits an Inngest event and the Resend
    // HTTP call happens in estimate-viewed-notification.ts. Same retarget the
    // respondToEstimate case below already does for its extracted notifier —
    // the guard-before-outward-effect property is what matters, not which
    // transport carries it.
    expectGuardBefore(body, /inngest\.send\s*\(/, 'logEstimateView')
  })

  it('denies a demo target before public response persistence, activity, notification, or email', () => {
    const body = functionBody(publicEstimateSource, 'respondToEstimate')

    expectGuardBefore(body, /\.update\s*\(/, 'respondToEstimate')
    expectGuardBefore(body, /estimate_activity/, 'respondToEstimate')
    // Security-hardening S2: the inline notify()/resend.emails.send() calls
    // that used to live directly in this function were extracted to
    // lib/estimate/notify-response.ts's notifyEstimateResponse (shared with
    // app/api/estimates/[id]/sign/route.ts, where a signature IS acceptance)
    // — the guard-before check now targets that call site instead of the
    // (moved) literal notify/email identifiers, which no longer appear in
    // this function's own body.
    expectGuardBefore(body, /notifyEstimateResponse\s*\(/, 'respondToEstimate')
  })

  it('keeps public actions anonymous while applying session and target guards after estimate lookup', () => {
    const viewBody = functionBody(publicEstimateSource, 'logEstimateView')
    const responseBody = functionBody(publicEstimateSource, 'respondToEstimate')

    for (const body of [viewBody, responseBody]) {
      expect(body.search(/assertWritable\s*\(/)).toBeGreaterThan(body.search(/\.single\s*\(\)/))
      expect(body).toMatch(/assertCompanyWritable\s*\(/)
    }
  })

  it('routes client-logo removal through the guarded Server Action, never browser Supabase', () => {
    expect(clientSheetSource).toMatch(/removeClientLogo\s*\(/)
    expect(clientSheetSource).not.toMatch(/createBrowserClient\s*\(/)
    expect(clientSheetSource).not.toMatch(/\.from\(['"]clients['"]\)\.update\s*\(/)

    const removeLogoBody = functionBody(clientActionSource, 'removeClientLogo')
    expect(removeLogoBody).toMatch(/getAuthContext\s*\(/)
    expect(removeLogoBody).toMatch(/\.update\s*\(\{\s*logo_url:\s*null\s*\}\)/)
  })
})
