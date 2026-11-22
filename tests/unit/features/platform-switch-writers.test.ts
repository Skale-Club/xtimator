import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

/**
 * XTM-D-20261121-feature-switches, rule 8 (static source guard).
 *
 * `companies.online_payments_allowed` and `companies.digital_signature_allowed`
 * are the PLATFORM switches. A tenant must never be able to write them, so no
 * server action or route a tenant can reach may name them in a write position:
 *
 *   - lib/actions/**                      (server actions)
 *   - app/(app)/**                        (authenticated workspace)
 *   - app/api/** except app/api/admin/**  (route handlers)
 *   - app/estimate, app/change-order      (public actions)
 *
 * Only app/admin/** (requireAdmin + service role + logAdminAction) may write
 * them. Selecting them (`.select('digital_signature_allowed, ...')`) is a read
 * and is fine. The database trigger protect_company_billing_columns is the
 * second wall; this test is the first.
 */

const PLATFORM_COLUMNS = ['online_payments_allowed', 'digital_signature_allowed']
const COLUMN_RE = new RegExp(`\\b(${PLATFORM_COLUMNS.join('|')})\\b`)
const WRITE_CALL_RE = /\.(update|insert|upsert)\s*\(/g

function walk(dir: string, out: string[] = []): string[] {
  let names: string[] = []
  try {
    names = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of names) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full)
  }
  return out
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** Text of the balanced parentheses that open at `openIdx` (the char after the `(`). */
function callArgs(src: string, openIdx: number): string {
  let depth = 1
  let i = openIdx
  for (; i < src.length && depth > 0; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')') depth--
  }
  return src.slice(openIdx, i - 1)
}

/** Every way the source can name a platform column in a write position. */
export function findPlatformWrites(source: string): string[] {
  const src = stripComments(source)
  const hits: string[] = []
  for (const m of src.matchAll(WRITE_CALL_RE)) {
    const args = callArgs(src, (m.index ?? 0) + m[0].length)
    if (COLUMN_RE.test(args)) hits.push(`${m[1]}(${args.replace(/\s+/g, ' ').slice(0, 80)})`)
  }
  // Raw SQL / rpc payloads: SET <column> =
  if (new RegExp(`\\bSET\\b[^;]*\\b(${PLATFORM_COLUMNS.join('|')})\\b`, 'i').test(src)) hits.push('raw SQL SET')
  // A computed key that is derived from the column name (e.g. { [column]: v } where
  // column is mapped to a platform column) is caught by the mapping literal itself.
  if (/\[\s*['"`](online_payments_allowed|digital_signature_allowed)['"`]\s*\]\s*:/.test(src)) hits.push('computed key')
  return hits
}

const root = process.cwd()
const rel = (f: string) => relative(root, f).split(sep).join('/')

function tenantReachableFiles(): string[] {
  const files = [
    ...walk(resolve(root, 'lib/actions')),
    ...walk(resolve(root, 'app/(app)')),
    ...walk(resolve(root, 'app/api')).filter((f) => !rel(f).startsWith('app/api/admin/')),
    ...walk(resolve(root, 'app/estimate')),
    ...walk(resolve(root, 'app/change-order')),
  ]
  return [...new Set(files)]
}

describe('platform switches are written only from the admin panel', () => {
  const files = tenantReachableFiles()

  it('scans a real set of files (the guard is not vacuous)', () => {
    expect(files.length).toBeGreaterThan(50)
    expect(files.map(rel)).toContain('lib/actions/client-actions.ts')
    expect(files.map(rel)).toContain('lib/actions/invoice.ts')
    expect(files.map(rel).some((f) => f.startsWith('app/api/stripe/'))).toBe(true)
  })

  it('no tenant-reachable action or route writes online_payments_allowed / digital_signature_allowed', () => {
    const offenders: string[] = []
    for (const file of files) {
      for (const hit of findPlatformWrites(readFileSync(file, 'utf8'))) offenders.push(`${rel(file)}: ${hit}`)
    }
    expect(offenders, `platform switches are admin-only:\n${offenders.join('\n')}`).toEqual([])
  })

  it('the tenant switch action writes only the tenant columns', () => {
    const src = stripComments(readFileSync(resolve(root, 'lib/actions/client-actions.ts'), 'utf8'))
    expect(src).toContain("'digital_signature_enabled'")
    expect(src).toContain("'online_payments_enabled'")
    expect(src).not.toMatch(/online_payments_allowed|digital_signature_allowed/)
  })

  it('the admin action file is the writer and is behind requireAdmin + audit log', () => {
    const adminSrc = readFileSync(resolve(root, 'app/admin/companies/actions.ts'), 'utf8')
    const fn = adminSrc.slice(adminSrc.indexOf("online_payments: 'online_payments_allowed'"))
    expect(fn).toContain('requireAdmin')
    expect(fn).toContain('logAdminAction')
    expect(fn).toContain('requireServiceClient')
  })
})

describe('the detector itself', () => {
  it('flags the shapes a tenant action could use to write a platform column', () => {
    expect(findPlatformWrites("await s.from('companies').update({ online_payments_allowed: true }).eq('id', id)")).toHaveLength(1)
    expect(findPlatformWrites("s.from('companies').update({\n  name,\n  digital_signature_allowed: false,\n})")).toHaveLength(1)
    expect(findPlatformWrites("s.from('companies').upsert({ id, digital_signature_allowed: true })")).toHaveLength(1)
    expect(findPlatformWrites("s.from('x').insert({ online_payments_allowed: true })")).toHaveLength(1)
    expect(findPlatformWrites('UPDATE companies SET online_payments_allowed = true')).toHaveLength(1)
  })

  it('does not flag reads, comments or the tenant columns', () => {
    expect(findPlatformWrites("s.from('companies').select('digital_signature_allowed, digital_signature_enabled')")).toEqual([])
    expect(findPlatformWrites("// .update({ online_payments_allowed: true })\ns.from('c').update({ name })")).toEqual([])
    expect(findPlatformWrites("s.from('companies').update({ online_payments_enabled: true })")).toEqual([])
    expect(findPlatformWrites("const ok = row.online_payments_allowed === true")).toEqual([])
  })
})
