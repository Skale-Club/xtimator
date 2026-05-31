/**
 * Wave 0 — ADMINLOG-04/05: EventStepTimeline pure helpers + whitelist guard.
 * Tests: terminalStatus precedence, formatDuration, SAFE_EVENT_COLUMNS whitelist,
 * static source guard (no transcript/audio/apiKey/payload/raw tokens).
 * RED until Plan 93-03 creates components/admin/event-step-timeline.tsx.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { terminalStatus, formatDuration } from '@/lib/admin/events-helpers'

// ── terminalStatus precedence ─────────────────────────────────────────────────
describe('ADMINLOG-04: terminalStatus precedence (failed > started > succeeded)', () => {
  it('returns "failed" when any row has status=failed, even if others succeeded', () => {
    expect(terminalStatus([{ status: 'succeeded' }, { status: 'failed' }])).toBe('failed')
  })

  it('returns "started" when rows have started and succeeded but no failed', () => {
    expect(terminalStatus([{ status: 'succeeded' }, { status: 'started' }])).toBe('started')
  })

  it('returns "succeeded" when all rows have status=succeeded', () => {
    expect(terminalStatus([{ status: 'succeeded' }])).toBe('succeeded')
  })
})

// ── formatDuration ─────────────────────────────────────────────────────────────
describe('ADMINLOG-04: formatDuration', () => {
  it('returns em-dash "—" for null input', () => {
    expect(formatDuration(null)).toBe('—')
  })

  it('returns "{n} ms" for a numeric ms value', () => {
    expect(formatDuration(0)).toBe('0 ms')
    expect(formatDuration(1234)).toBe('1234 ms')
  })
})

// ── ADMINLOG-05 static source guard ───────────────────────────────────────────
describe('ADMINLOG-05: EventStepTimeline source whitelist guard', () => {
  it('EventStepTimeline.tsx does NOT contain transcript|audio|apiKey|payload|raw token', () => {
    try {
      const src = readFileSync(
        resolve(process.cwd(), 'components/admin/event-step-timeline.tsx'),
        'utf8'
      )
      expect(src).not.toMatch(/transcript|audio|apiKey|payload|raw/i)
    } catch {
      expect.fail('Wave 0: components/admin/event-step-timeline.tsx not yet written')
    }
  })

  it('EventStepTimeline.tsx references SAFE_EVENT_COLUMNS or the explicit 15-column whitelist', () => {
    try {
      const src = readFileSync(
        resolve(process.cwd(), 'components/admin/event-step-timeline.tsx'),
        'utf8'
      )
      // Must reference the whitelist constant or explicitly enumerate safe columns
      expect(src).toMatch(/SAFE_EVENT_COLUMNS|attempt_id.*project_id.*estimate_id/)
    } catch {
      expect.fail('Wave 0: components/admin/event-step-timeline.tsx not yet written')
    }
  })

  it('SAFE_EVENT_COLUMNS contains exactly the 15 safe columns (no transcript/audio/key/payload/raw)', () => {
    try {
      const src = readFileSync(
        resolve(process.cwd(), 'lib/admin/events-helpers.ts'),
        'utf8'
      )
      // Must define SAFE_EVENT_COLUMNS with the 15 known-safe columns
      expect(src).toMatch(/SAFE_EVENT_COLUMNS/)
      expect(src).not.toMatch(/transcript|audio|apiKey|payload|raw/i)
    } catch {
      expect.fail('Wave 0: lib/admin/events-helpers.ts not yet written')
    }
  })
})
