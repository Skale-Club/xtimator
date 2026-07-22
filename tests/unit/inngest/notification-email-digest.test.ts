import { describe, it, expect } from 'vitest'

/**
 * Phase 174 (TNT-01, carry-forward b) — buildDigestItem mapping tests.
 *
 * Covers the consumer side of the resolver-sourced email copy contract:
 *   - metadata.email_copy present + valid → subject/body preferred over
 *     row.title/row.body, body preEscaped: true, title NEVER preEscaped
 *     (title has no such flag — always plain text per the resolver contract).
 *   - metadata.email_copy absent/null/empty → falls back to row.title/
 *     row.body verbatim, preEscaped: false (today's behavior, unchanged).
 *   - metadata.email_copy malformed (non-object, non-string fields) →
 *     defensive fallback to row.title/row.body, preEscaped: false, never
 *     throws.
 *
 * This file tests the pure `buildDigestItem` mapping function only — no
 * Inngest `step.run` orchestration is exercised here (out of scope, mirrors
 * the "test the pure mapping function" pattern used elsewhere in this repo).
 */

import { buildDigestItem } from '@/lib/inngest/functions/notification-email-digest'
import { sendNotificationDigestEmail } from '@/lib/email/notification-emails'

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notif_1',
    user_id: 'user_1',
    company_id: 'co_1',
    event_type: 'estimate.viewed',
    title: 'Row Title',
    body: 'Row body <b>plain</b> & text',
    link_url: '/estimates/abc',
    created_at: '2026-07-20T10:00:00Z',
    metadata: null,
    ...overrides,
  }
}

describe('buildDigestItem (Phase 174 TNT-01)', () => {
  it('prefers metadata.email_copy when present and valid: subject → title (plain), body → body (preEscaped: true)', () => {
    const row = baseRow({
      metadata: {
        email_copy: {
          subject: 'Resolved Subject',
          body: 'Resolved &amp; body',
        },
      },
    })

    const item = buildDigestItem(row as any, 'estimate')

    expect(item.title).toBe('Resolved Subject')
    expect(item.body).toBe('Resolved &amp; body')
    expect(item.preEscaped).toBe(true)
    expect(item.category).toBe('estimate')
    expect(item.linkUrl).toBe('/estimates/abc')
    expect(item.createdAt).toBe('2026-07-20T10:00:00Z')
  })

  it('falls back to row.title/row.body with preEscaped: false when metadata is null', () => {
    const row = baseRow({ metadata: null })

    const item = buildDigestItem(row as any, 'estimate')

    expect(item.title).toBe('Row Title')
    expect(item.body).toBe('Row body <b>plain</b> & text')
    expect(item.preEscaped).toBe(false)
  })

  it('falls back to row.title/row.body with preEscaped: false when metadata is {} (no email_copy key)', () => {
    const row = baseRow({ metadata: {} })

    const item = buildDigestItem(row as any, 'estimate')

    expect(item.title).toBe('Row Title')
    expect(item.body).toBe('Row body <b>plain</b> & text')
    expect(item.preEscaped).toBe(false)
  })

  it('falls back to row.title/row.body when email_copy is not an object (e.g. a string)', () => {
    const row = baseRow({ metadata: { email_copy: 'not an object' } })

    const item = buildDigestItem(row as any, 'estimate')

    expect(item.title).toBe('Row Title')
    expect(item.body).toBe('Row body <b>plain</b> & text')
    expect(item.preEscaped).toBe(false)
  })

  it('falls back to row.title/row.body when email_copy.body is not a string (malformed)', () => {
    const row = baseRow({
      metadata: { email_copy: { subject: 'Has subject', body: 123 } },
    })

    const item = buildDigestItem(row as any, 'estimate')

    expect(item.title).toBe('Row Title')
    expect(item.body).toBe('Row body <b>plain</b> & text')
    expect(item.preEscaped).toBe(false)
  })

  it('falls back to row.title/row.body when email_copy.subject is not a string (malformed)', () => {
    const row = baseRow({
      metadata: { email_copy: { subject: 123, body: 'Has body' } },
    })

    const item = buildDigestItem(row as any, 'estimate')

    expect(item.title).toBe('Row Title')
    expect(item.body).toBe('Row body <b>plain</b> & text')
    expect(item.preEscaped).toBe(false)
  })

  it('never throws on malformed metadata', () => {
    const row = baseRow({ metadata: { email_copy: null } })

    expect(() => buildDigestItem(row as any, 'estimate')).not.toThrow()
  })

  it('produces a DigestEmailItem shape consumable by sendNotificationDigestEmail without double-escaping body, while title stays plain for downstream escaping', () => {
    // buildDigestItem's job is purely to produce the correct DigestEmailItem
    // shape (preEscaped: true on resolver-sourced body, plain title, no
    // preEscaped-like flag on title). Task 1's email-digest.test.ts suite
    // independently proves renderItem/sendNotificationDigestEmail honor that
    // shape end-to-end (no double-escape on preEscaped body, always-escaped
    // title) — this test proves buildDigestItem hands it the right input.
    expect(typeof sendNotificationDigestEmail).toBe('function')

    const row = baseRow({
      title: 'Row Title & Co',
      metadata: {
        email_copy: {
          subject: 'Resolved Subject & Co',
          body: 'Resolved &amp; body already escaped',
        },
      },
    })

    const item = buildDigestItem(row as any, 'estimate')

    expect(item.preEscaped).toBe(true)
    expect(item.body).toBe('Resolved &amp; body already escaped')
    expect(item.title).toBe('Resolved Subject & Co')
    expect((item as Record<string, unknown>).titlePreEscaped).toBeUndefined()
  })
})
