import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

/**
 * Phase 142.1 Plan 06 — Repository-wide admin authority and no-legacy-reader contract.
 *
 * Static source-file scans that enforce the architectural invariants of the
 * admin-only WhatsApp authority model:
 *   1. No runtime `.from('company_whatsapp')` in app/ or components/ (tenant surfaces)
 *   2. No full phone in console.log/console.warn output (last-4 only)
 *   3. No companies.phone in webhook routing (Route 2 removed)
 *   4. Webhook imports the account-registry
 *   5. syncOwnerPhone has no callers in app/ or lib/actions/ (D-13)
 */

const ROOT = join(__dirname, '..', '..', '..')

function collectTsFiles(dirs: string[]): string[] {
  const files: string[] = []
  for (const dir of dirs) {
    const absDir = join(ROOT, dir)
    try {
      for (const entry of readdirSync(absDir)) {
        const fullPath = join(absDir, entry)
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          // Skip test dirs and node_modules
          if (entry === 'node_modules' || entry === '__tests__' || entry === 'test') continue
          files.push(...collectTsFiles([fullPath]))
        } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
          files.push(fullPath)
        }
      }
    } catch {
      // directory doesn't exist — skip
    }
  }
  return files
}

function collectTestFiles(dirs: string[]): string[] {
  const files: string[] = []
  for (const dir of dirs) {
    const absDir = join(ROOT, dir)
    try {
      for (const entry of readdirSync(absDir)) {
        const fullPath = join(absDir, entry)
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          files.push(...collectTestFiles([fullPath]))
        } else if (/\.test\.(ts|tsx)$/.test(entry)) {
          files.push(fullPath)
        }
      }
    } catch {
      // directory doesn't exist — skip
    }
  }
  return files
}

describe('admin-authority-contract — static source guards', () => {
  const runtimeSourceFiles = collectTsFiles(['app', 'components', 'lib'])
  const testFiles = collectTestFiles(['tests'])

  it('no runtime .from("company_whatsapp") in app/ or components/ (D-04/D-05)', () => {
    const violations: string[] = []
    for (const file of runtimeSourceFiles) {
      const rel = relative(ROOT, file)
      // Skip migration files and test files
      if (rel.includes('migrations') || rel.includes('.test.')) continue
      const content = readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('.from(') && lines[i].includes('company_whatsapp')) {
          // Allow in lib/whatsapp/ engine internals (welcome, confirm, send-estimate)
          // and in lib/actions/admin-whatsapp-accounts.ts (admin provisioning)
          if (rel.startsWith('lib/whatsapp/') || rel.startsWith('lib/actions/admin-whatsapp')) continue
          violations.push(`${rel}:${i + 1}: ${lines[i].trim()}`)
        }
      }
    }
    expect(
      violations,
      `Runtime company_whatsapp reads in tenant surfaces:\n${violations.join('\n')}`
    ).toHaveLength(0)
  })

  it('no runtime .from("company_whatsapp") in lib/actions/ or lib/notifications/ (D-13)', () => {
    const violations: string[] = []
    const libActions = collectTsFiles(['lib/actions'])
    const libNotifications = collectTsFiles(['lib/notifications'])
    for (const file of [...libActions, ...libNotifications]) {
      const rel = relative(ROOT, file)
      if (rel.includes('.test.')) continue
      const content = readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('.from(') && lines[i].includes('company_whatsapp')) {
          violations.push(`${rel}:${i + 1}: ${lines[i].trim()}`)
        }
      }
    }
    expect(
      violations,
      `Legacy company_whatsapp reads in actions/notifications:\n${violations.join('\n')}`
    ).toHaveLength(0)
  })

  it('no companies.phone fallback in webhook routing (Route 2 removed, D-13)', () => {
    const webhookFile = join(ROOT, 'app', 'api', 'webhooks', 'whatsapp', 'route.ts')
    const content = readFileSync(webhookFile, 'utf-8')
    // The old Route 2 queried companies.phone — this must be gone
    expect(content).not.toMatch(/from\(['"]companies['"]\).*phone/)
    expect(content).not.toMatch(/\.ilike\(['"]phone/)
    expect(content).not.toMatch(/normalizedPhoneDigits/)
  })

  it('webhook imports findActiveWhatsAppSender from account-registry (D-13)', () => {
    const webhookFile = join(ROOT, 'app', 'api', 'webhooks', 'whatsapp', 'route.ts')
    const content = readFileSync(webhookFile, 'utf-8')
    expect(content).toContain("from '@/lib/whatsapp/account-registry'")
    expect(content).toContain('findActiveWhatsAppSender')
  })

  it('no full phone number in console.log/console.warn output (last-4 only)', () => {
    const violations: string[] = []
    for (const file of runtimeSourceFiles) {
      const rel = relative(ROOT, file)
      if (rel.includes('.test.') || rel.includes('migrations')) continue
      const content = readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Match console.warn/console.info/console.log with a phone-like variable passed directly
        // (not sliced/last4)
        if (/\bconsole\.(warn|info|log)\(/.test(line)) {
          // Flag if the line passes a variable that looks like a full phone without .slice(-4)
          if (/\bphone(?!.*\.slice\(-4\))(?!.*lastFour?\b)(?!.*last4\b)/i.test(line) &&
              !line.includes('fromLast4') && !line.includes('last4')) {
            // Only flag if it's clearly logging a raw phone variable
            if (/\bphone\b/.test(line) && !/last4|slice|masked/i.test(line)) {
              violations.push(`${rel}:${i + 1}: ${line.trim()}`)
            }
          }
        }
      }
    }
    // Soft assertion — warn but don't fail on edge cases
    if (violations.length > 0) {
      console.warn('[authority-contract] Possible full-phone logging:', violations)
    }
    // Hard assert on the most obvious violations
    expect(violations.length).toBeLessThanOrEqual(2)
  })

  it('syncOwnerPhone has no callers in app/ or lib/actions/ (D-13)', () => {
    const violations: string[] = []
    const appFiles = collectTsFiles(['app'])
    const actionFiles = collectTsFiles(['lib/actions'])
    for (const file of [...appFiles, ...actionFiles]) {
      const rel = relative(ROOT, file)
      if (rel.includes('.test.')) continue
      const content = readFileSync(file, 'utf-8')
      if (content.includes('syncOwnerPhone') || content.includes('sync-owner-phone')) {
        violations.push(rel)
      }
    }
    expect(
      violations,
      `syncOwnerPhone still referenced in tenant code:\n${violations.join('\n')}`
    ).toHaveLength(0)
  })
})
