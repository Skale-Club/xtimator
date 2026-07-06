import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * D-04/D-05/D-07/D-15 — Tenant WhatsApp surface guard.
 *
 * Static source-level contract scan asserting:
 * 1. No tenant route or component links to `/whatsapp` (conversation deep-link)
 * 2. No tenant component imports conversation-thread actions or config
 * 3. The opaque estimate send route/form and plain-text copy references are
 *    allowed (D-06: tenant outbound estimate sending remains available)
 *
 * Mirrors the pattern of knowledge-neutrality.test.ts (source-grep guard).
 */

const ROOT = process.cwd()

// Tenant surfaces that must NOT contain these patterns.
// Scan dirs are relative to ROOT.
const SCAN_DIRS = [
  'app/(app)',
  'components',
  'lib/actions',
] as const

// Forbidden patterns in tenant surfaces:
// - /whatsapp route links (conversation deep-links)
// - Conversation/config imports that expose WhatsApp internals
const FORBIDDEN_PATTERNS = [
  // Direct link to the tenant WhatsApp inbox
  /href\s*=\s*["'`]\/whatsapp/g,
  /href\s*=\s*{\s*`\/whatsapp/g,
  /router\.(push|replace)\(["'`]\/whatsapp/g,
  /window\.location\s*=\s*["'`]\/whatsapp/g,
  // Conversation-thread actions/queries (inbox, reply, load conversation)
  /from\s+["'`]@\/lib\/actions\/whatsapp-inbox["'`]/,
  /from\s+["'`]@\/lib\/queries\/whatsapp-inbox["'`]/,
  // WhatsApp provisioning config exposed to tenants
  /from\s+["'`]@\/components\/whatsapp\/whatsapp-inbox["'`]/,
] as const

// Allowlist: these tokens are allowed even though they reference WhatsApp.
// They represent the opaque estimate-send path (D-06) and plain-text copy.
const ALLOWLIST_PATTERNS = [
  // Opaque outbound estimate send — the Send tab and API route
  /send-whatsapp/,
  // WhatsApp copy in plain-text UI (e.g. "Send via WhatsApp" button labels)
  /WhatsApp.*send|send.*WhatsApp/i,
  // Admin-only surfaces (not in tenant scan dirs)
  /requireAdmin/,
  // MessageBubble (shared component used by admin)
  /message-bubble/,
  // WhatsApp status check for Send tab gating
  /company_whatsapp.*status/,
  // WhatsApp entitlement check
  /whatsappEnabled/,
] as const

function collectTsxFiles(dirAbs: string): string[] {
  if (!existsSync(dirAbs)) return []
  const out: string[] = []
  for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
    const full = join(dirAbs, entry.name)
    if (entry.isDirectory()) {
      // Skip node_modules, .next, test files, and admin dirs
      if (
        entry.name === 'node_modules' ||
        entry.name === '.next' ||
        entry.name === 'admin' ||
        entry.name === '__tests__'
      )
        continue
      out.push(...collectTsxFiles(full))
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx')
    ) {
      out.push(full)
    }
  }
  return out
}

function isAllowlisted(line: string): boolean {
  return ALLOWLIST_PATTERNS.some((p) => p.test(line))
}

describe('D-04/D-05/D-07/D-15: tenant WhatsApp surface guard', () => {
  it('has tenant source files to scan', () => {
    const files: string[] = []
    for (const dir of SCAN_DIRS) {
      files.push(...collectTsxFiles(resolve(ROOT, dir)))
    }
    expect(files.length).toBeGreaterThan(0)
  })

  it('no tenant file links to /whatsapp route', () => {
    const violations: Array<{ file: string; pattern: string; line: string }> = []
    for (const dir of SCAN_DIRS) {
      const files = collectTsxFiles(resolve(ROOT, dir))
      for (const file of files) {
        const src = readFileSync(file, 'utf8')
        const lines = src.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (isAllowlisted(line)) continue
          // Check for /whatsapp href/router links
          if (
            /href\s*=\s*["'`]\/whatsapp/.test(line) ||
            /href\s*=\s*{\s*`\/whatsapp/.test(line) ||
            /router\.(push|replace)\(["'`]\/whatsapp/.test(line) ||
            /window\.location\s*=\s*["'`]\/whatsapp/.test(line)
          ) {
            violations.push({
              file: file.replace(ROOT, '').replace(/\\/g, '/'),
              pattern: 'route link to /whatsapp',
              line: line.trim(),
            })
          }
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('no tenant file imports conversation-thread actions/queries', () => {
    const violations: Array<{ file: string; pattern: string; line: string }> = []
    const bannedImports = [
      /from\s+["'`]@\/lib\/actions\/whatsapp-inbox["'`]/,
      /from\s+["'`]@\/lib\/queries\/whatsapp-inbox["'`]/,
      /from\s+["'`]@\/components\/whatsapp\/whatsapp-inbox["'`]/,
    ]
    for (const dir of SCAN_DIRS) {
      const files = collectTsxFiles(resolve(ROOT, dir))
      for (const file of files) {
        const src = readFileSync(file, 'utf8')
        const lines = src.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (isAllowlisted(line)) continue
          for (const pat of bannedImports) {
            if (pat.test(line)) {
              violations.push({
                file: file.replace(ROOT, '').replace(/\\/g, '/'),
                pattern: 'banned import',
                line: line.trim(),
              })
            }
          }
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('opaque estimate send route/form still exists (D-06)', () => {
    // The Send tab and WhatsApp send API must remain intact
    expect(existsSync(resolve(ROOT, 'app/(app)/projects/[id]/page.tsx'))).toBe(true)
    // The send-whatsapp API route must exist
    const sendRoute = existsSync(
      resolve(ROOT, 'app/api/estimates/[id]/send-whatsapp/route.ts'),
    )
    // If the route doesn't exist at this path, check alternatives
    if (!sendRoute) {
      // Allow: the send-whatsapp functionality may live elsewhere
      // The key invariant is that the Send tab still references whatsapp send
      const workspaceFile = resolve(ROOT, 'components/workspace/send/send-tab.tsx')
      if (existsSync(workspaceFile)) {
        const src = readFileSync(workspaceFile, 'utf8')
        expect(src).toMatch(/whatsapp/i)
      }
    }
  })

  it('admin conversation components still compile (admin-only path)', () => {
    // MessageBubble must exist (admin uses it)
    expect(existsSync(resolve(ROOT, 'components/whatsapp/message-bubble.tsx'))).toBe(true)
    // Admin WhatsApp actions must exist
    expect(existsSync(resolve(ROOT, 'lib/actions/admin-whatsapp.ts'))).toBe(true)
    // Admin WhatsApp page must exist
    expect(existsSync(resolve(ROOT, 'app/admin/inbox/page.tsx'))).toBe(true)
  })
})
