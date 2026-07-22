import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * lib/observability/ops-alert.ts — the never-throw system-health fan-out.
 *
 * notifyOps is the single choke point every ops alert flows through:
 *   Redis SETNX dedupe (fail-open) → Sentry.captureMessage → sendTelegramMessage.
 *
 * Covers:
 *  - fan-out         → no dedupeKey: BOTH Sentry.captureMessage and sendTelegramMessage
 *                      called once; captureMessage tag ops_alert === kind, level === severity.
 *  - dedupe suppress → redis.set returns null (key exists): RETURN early, neither called.
 *  - dedupe first-hit→ redis.set returns 'OK': both called; SETNX shape asserted.
 *  - fail-open       → getRedis()→null with a dedupeKey: both still called (no dedupe).
 *  - never-throw (tg)→ sendTelegramMessage rejects: notifyOps resolves, Sentry still called.
 *  - never-throw (st)→ captureMessage throws: notifyOps resolves, Telegram still called.
 *  - dormant         → sendTelegramMessage rejects '[Telegram] not configured': resolves.
 *  - severity default→ no severity: captureMessage level 'warning', ⚠️ emoji in message.
 *  - toggle gate     → isTelegramAlertEnabled false: Sentry still called, Telegram NOT called
 *                      (Phase 175 PLAT-02); true: both still called (regression guard); the
 *                      toggle check itself rejecting: notifyOps still resolves, Sentry still called.
 *
 * All downstreams are mocked — no real Sentry, Redis, Telegram, or DB is touched.
 */

const captureMessageMock = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureMessage: (...args: unknown[]) => captureMessageMock(...args),
}))

const sendTelegramMessageMock = vi.fn()
vi.mock('@/lib/telegram/client', () => ({
  sendTelegramMessage: (...args: unknown[]) => sendTelegramMessageMock(...args),
}))

const getRedisMock = vi.fn()
vi.mock('@/lib/redis', () => ({
  getRedis: () => getRedisMock(),
}))

const isTelegramAlertEnabledMock = vi.fn()
vi.mock('@/lib/observability/platform-preferences', () => ({
  isTelegramAlertEnabled: (...args: unknown[]) => isTelegramAlertEnabledMock(...args),
}))

import { notifyOps, formatOpsMessage } from '@/lib/observability/ops-alert'

beforeEach(() => {
  captureMessageMock.mockReset()
  sendTelegramMessageMock.mockReset()
  getRedisMock.mockReset()
  isTelegramAlertEnabledMock.mockReset()
  // Default: Telegram send succeeds, Redis absent (fail-open pass-through),
  // toggle gate resolves enabled — keeps every existing test in this file
  // passing unmodified.
  sendTelegramMessageMock.mockResolvedValue(undefined)
  getRedisMock.mockReturnValue(null)
  isTelegramAlertEnabledMock.mockResolvedValue(true)
})

describe('formatOpsMessage', () => {
  it('renders the error emoji + bold title + message for severity error', () => {
    const out = formatOpsMessage({
      kind: 'ai_fallback',
      title: 'AI primary down',
      message: 'boom',
      severity: 'error',
    })
    expect(out).toContain('🔴')
    expect(out).toContain('<b>AI primary down</b>')
    expect(out).toContain('boom')
  })

  it('defaults to the ⚠️ warning emoji when severity is absent', () => {
    const out = formatOpsMessage({
      kind: 'ai_fallback',
      title: 'Heads up',
      message: 'degraded',
    })
    expect(out).toContain('⚠️')
    expect(out).not.toContain('🔴')
  })

  it('escapes HTML-breaking characters in title and message', () => {
    const out = formatOpsMessage({
      kind: 'ai_fallback',
      title: 'a < b & c > d',
      message: '<script>',
    })
    expect(out).toContain('a &lt; b &amp; c &gt; d')
    expect(out).toContain('&lt;script&gt;')
  })
})

describe('notifyOps', () => {
  it('fans out to BOTH Sentry and Telegram (no dedupeKey)', async () => {
    await notifyOps({
      kind: 'ai_fallback',
      title: 'AI primary down',
      message: 'boom',
      severity: 'error',
    })

    expect(captureMessageMock).toHaveBeenCalledTimes(1)
    const [msg, opts] = captureMessageMock.mock.calls[0] as [string, { level: string; tags: Record<string, string> }]
    expect(msg).toContain('[ops:ai_fallback]')
    expect(opts.level).toBe('error')
    expect(opts.tags.ops_alert).toBe('ai_fallback')

    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(1)
  })

  it('suppresses within the window when the dedupe key already exists (redis.set → null)', async () => {
    const setMock = vi.fn().mockResolvedValue(null)
    getRedisMock.mockReturnValue({ set: setMock })

    await notifyOps({
      kind: 'ai_fallback',
      title: 'AI primary down',
      message: 'boom',
      dedupeKey: 'ai_fallback:generate',
    })

    expect(setMock).toHaveBeenCalledTimes(1)
    // Suppressed: neither downstream fired.
    expect(captureMessageMock).not.toHaveBeenCalled()
    expect(sendTelegramMessageMock).not.toHaveBeenCalled()
  })

  it('proceeds on the first hit (redis.set → OK) using SETNX with the ops: prefix and window', async () => {
    const setMock = vi.fn().mockResolvedValue('OK')
    getRedisMock.mockReturnValue({ set: setMock })

    await notifyOps({
      kind: 'ai_fallback',
      title: 'AI primary down',
      message: 'boom',
      dedupeKey: 'ai_fallback:generate',
      suppressWindowSec: 900,
    })

    expect(setMock).toHaveBeenCalledTimes(1)
    const [key, , opts] = setMock.mock.calls[0] as [string, string, { nx: boolean; ex: number }]
    expect(key).toBe('ops:ai_fallback:generate')
    expect(opts.nx).toBe(true)
    expect(opts.ex).toBe(900)

    expect(captureMessageMock).toHaveBeenCalledTimes(1)
    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(1)
  })

  it('fails open — a dedupeKey with Redis absent still sends (no dedupe)', async () => {
    getRedisMock.mockReturnValue(null)

    await notifyOps({
      kind: 'ai_fallback',
      title: 'AI primary down',
      message: 'boom',
      dedupeKey: 'ai_fallback:generate',
    })

    expect(captureMessageMock).toHaveBeenCalledTimes(1)
    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(1)
  })

  it('fails open — a throwing redis.set still sends (Redis hiccup)', async () => {
    const setMock = vi.fn().mockRejectedValue(new Error('redis down'))
    getRedisMock.mockReturnValue({ set: setMock })

    await notifyOps({
      kind: 'ai_fallback',
      title: 'AI primary down',
      message: 'boom',
      dedupeKey: 'ai_fallback:generate',
    })

    expect(captureMessageMock).toHaveBeenCalledTimes(1)
    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(1)
  })

  it('never throws when Telegram rejects, and Sentry still fires', async () => {
    sendTelegramMessageMock.mockRejectedValue(new Error('telegram 500'))

    await expect(
      notifyOps({ kind: 'ai_fallback', title: 't', message: 'm' })
    ).resolves.toBeUndefined()

    expect(captureMessageMock).toHaveBeenCalledTimes(1)
  })

  it('never throws when Sentry.captureMessage throws, and Telegram still fires', async () => {
    captureMessageMock.mockImplementation(() => {
      throw new Error('sentry down')
    })

    await expect(
      notifyOps({ kind: 'ai_fallback', title: 't', message: 'm' })
    ).resolves.toBeUndefined()

    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(1)
  })

  it('dormant Telegram (not configured) resolves without throwing', async () => {
    sendTelegramMessageMock.mockRejectedValue(
      new Error('[Telegram] not configured — set a bot token and chat_id in /admin/integrations')
    )

    await expect(
      notifyOps({ kind: 'ai_fallback', title: 't', message: 'm' })
    ).resolves.toBeUndefined()

    expect(captureMessageMock).toHaveBeenCalledTimes(1)
  })

  it('defaults severity to warning — captureMessage level warning and ⚠️ emoji sent to Telegram', async () => {
    await notifyOps({ kind: 'ai_fallback', title: 't', message: 'm' })

    const [, opts] = captureMessageMock.mock.calls[0] as [string, { level: string }]
    expect(opts.level).toBe('warning')

    const sentText = sendTelegramMessageMock.mock.calls[0][0] as string
    expect(sentText).toContain('⚠️')
  })

  it('toggle gate false — Sentry still fires, Telegram is NOT sent (Phase 175 PLAT-02)', async () => {
    isTelegramAlertEnabledMock.mockResolvedValue(false)

    await notifyOps({ kind: 'tenant_signup', title: 't', message: 'm' })

    expect(isTelegramAlertEnabledMock).toHaveBeenCalledWith('tenant_signup')
    expect(captureMessageMock).toHaveBeenCalledTimes(1)
    expect(sendTelegramMessageMock).not.toHaveBeenCalled()
  })

  it('toggle gate true — both Sentry and Telegram fire (regression guard)', async () => {
    isTelegramAlertEnabledMock.mockResolvedValue(true)

    await notifyOps({ kind: 'tenant_signup', title: 't', message: 'm' })

    expect(captureMessageMock).toHaveBeenCalledTimes(1)
    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(1)
  })

  it('never throws when the toggle check itself rejects — Sentry still fires', async () => {
    isTelegramAlertEnabledMock.mockRejectedValue(new Error('toggle check hiccup'))

    await expect(
      notifyOps({ kind: 'tenant_signup', title: 't', message: 'm' })
    ).resolves.toBeUndefined()

    expect(captureMessageMock).toHaveBeenCalledTimes(1)
    expect(sendTelegramMessageMock).not.toHaveBeenCalled()
  })
})
