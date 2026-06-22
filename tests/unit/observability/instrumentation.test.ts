import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * OBS-02: Shared OTel provider + Langfuse v5 migration
 *
 * Source-text anchor tests for the instrumentation.ts rewrite.
 * Tests are RED in Wave 1 — turn GREEN in Wave 2 when instrumentation.ts is rewritten.
 */

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

// ── OBS-02: skipOpenTelemetrySetup ────────────────────────────────────────────

describe('OBS-02: instrumentation.ts — skipOpenTelemetrySetup', () => {
  it('OBS-02 skipOTel: instrumentation.ts contains skipOpenTelemetrySetup: true', () => {
    const src = read('instrumentation.ts')
    expect(src).toContain('skipOpenTelemetrySetup: true')
  })
})

// ── OBS-02: Shared provider with both processors ──────────────────────────────

describe('OBS-02: instrumentation.ts — shared NodeTracerProvider with both processors', () => {
  it('OBS-02 processors: instrumentation.ts imports LangfuseSpanProcessor', () => {
    const src = read('instrumentation.ts')
    expect(src).toContain('LangfuseSpanProcessor')
  })

  it('OBS-02 processors: instrumentation.ts imports SentrySpanProcessor', () => {
    const src = read('instrumentation.ts')
    expect(src).toContain('SentrySpanProcessor')
  })

  it('OBS-02 processors: instrumentation.ts registers NodeTracerProvider', () => {
    const src = read('instrumentation.ts')
    expect(src).toContain('NodeTracerProvider')
  })

  it('OBS-02 processors: instrumentation.ts exports langfuseProcessor for forceFlush()', () => {
    const src = read('instrumentation.ts')
    expect(src).toMatch(/export.*langfuseProcessor/)
  })
})

// ── OBS-02: getLangfuse() v3 retired ─────────────────────────────────────────

describe('OBS-02: getLangfuse() v3 call sites eliminated', () => {
  it('OBS-02 getLangfuse gone: no lib/**/*.ts file imports getLangfuse()', () => {
    // Find all .ts files under lib/
    const libDir = resolve(process.cwd(), 'lib')
    const files: string[] = []

    function walkDir(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          walkDir(full)
        } else if (entry.endsWith('.ts')) {
          files.push(full)
        }
      }
    }
    walkDir(libDir)

    const filesWithLangfuse = files.filter((f) => {
      try {
        return readFileSync(f, 'utf8').includes('getLangfuse(')
      } catch {
        return false
      }
    })

    expect(filesWithLangfuse).toHaveLength(0)
  })
})

// ── OBS-02: No Langfuse keys committed ───────────────────────────────────────

describe('OBS-02: no Langfuse credentials committed in instrumentation.ts', () => {
  it('OBS-02 no keys: instrumentation.ts does not contain pk-lf- or sk-lf- literal key values', () => {
    const src = read('instrumentation.ts')
    expect(src).not.toMatch(/pk-lf-[a-zA-Z0-9]/)
    expect(src).not.toMatch(/sk-lf-[a-zA-Z0-9]/)
  })

  it('OBS-02 no keys: instrumentation.ts reads keys from process.env only', () => {
    const src = read('instrumentation.ts')
    expect(src).toContain('process.env.LANGFUSE_PUBLIC_KEY')
    expect(src).toContain('process.env.LANGFUSE_SECRET_KEY')
  })
})
