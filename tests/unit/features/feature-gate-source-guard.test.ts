import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

/**
 * XTM-D-20261121-feature-switches (static source guard).
 *
 * `lib/features/company-features.ts` is the single place that turns the
 * company's switch columns into a decision. If any other production file reads
 * one of those columns off an object (`company.digital_signature_enabled`,
 * `row.online_payments_allowed`, `c.stripe_connect_status`, ...), it is either
 * re-deriving the rule (and will drift from the resolver, most likely by
 * forgetting the platform switch) or it belongs in the short allow-list below
 * with the reason written down.
 *
 * Selecting the columns in a query string and writing them in an update
 * payload are not property reads and are not matched.
 */

const ROOTS = ['app', 'lib', 'components', 'hooks']

const SWITCH_COLUMNS = [
  'online_payments_allowed',
  'online_payments_enabled',
  'digital_signature_allowed',
  'digital_signature_enabled',
  'stripe_connect_status',
  'stripe_charges_enabled',
]

/** Reads `<something>.<column>` or `<something>?.<column>`. */
const PROPERTY_READ = new RegExp(`\\??\\.(${SWITCH_COLUMNS.join('|')})\\b`)

const ALLOWED: Record<string, string> = {
  'lib/features/company-features.ts': 'the resolver itself',
  'app/admin/companies/[id]/page.tsx':
    'super admin detail: shows the STORED platform switch and Stripe fields next to the resolved state',
  'app/admin/companies/page.tsx':
    'super admin list: shows the stored platform switch when the resolver says the company is not live',
  'components/share/estimate-view.tsx':
    'public page: reads company.digital_signature_enabled, which the share query already set to the effective value',
  'components/share/change-order-view.tsx':
    'public page: same effective value from the change order query',
  'components/workspace/change-orders/change-order-editor.tsx':
    'owner editor: receives the effective value from the page (resolveDigitalSignature)',
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('feature switches: only the resolver reads the switch columns', () => {
  const offenders: string[] = []
  const seenAllowed = new Set<string>()

  for (const root of ROOTS) {
    const abs = resolve(process.cwd(), root)
    for (const file of walk(abs)) {
      const rel = relative(process.cwd(), file).split(sep).join('/')
      const lines = stripComments(readFileSync(file, 'utf8')).split('\n')
      lines.forEach((line, i) => {
        if (!PROPERTY_READ.test(line)) return
        if (ALLOWED[rel]) {
          seenAllowed.add(rel)
          return
        }
        offenders.push(`${rel}:${i + 1}: ${line.trim()}`)
      })
    }
  }

  it('no production file outside the allow-list reads a switch column off an object', () => {
    expect(offenders, `gate on the resolver instead:\n${offenders.join('\n')}`).toEqual([])
  })

  it('every allow-list entry is still needed', () => {
    const stale = Object.keys(ALLOWED).filter((f) => !seenAllowed.has(f))
    expect(stale, 'remove allow-list entries that no longer read a switch column').toEqual([])
  })
})
