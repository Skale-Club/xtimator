import { describe, it, expect } from 'vitest'
import {
  MAX_PUSH_DEVICES,
  addPushDevice,
  deviceFromClient,
  parsePushDevices,
  removePushDevices,
  serializePushDevices,
  type PushDevice,
} from '@/lib/notifications/push-devices'

/**
 * 260928: a user's Web Push devices, stored in the existing JSONB column.
 * The column used to hold ONE subscription, so a laptop subscribing silently
 * unsubscribed the phone. It now holds a list, and every older shape still reads.
 */

const dev = (n: number, lang?: 'en' | 'pt' | 'es'): PushDevice => ({
  endpoint: `https://push.example.com/${n}`,
  keys: { p256dh: `p${n}`, auth: `a${n}` },
  ...(lang ? { lang } : {}),
})

describe('parsePushDevices', () => {
  it('reads nothing from empty or scaffold values', () => {
    expect(parsePushDevices(null)).toEqual([])
    expect(parsePushDevices(undefined)).toEqual([])
    expect(parsePushDevices({})).toEqual([])
    expect(parsePushDevices('garbage')).toEqual([])
  })

  it('reads a legacy single PushSubscription as one device', () => {
    expect(parsePushDevices({ endpoint: 'https://push.example.com/1', keys: { p256dh: 'p1', auth: 'a1' } })).toEqual([
      dev(1),
    ])
  })

  it('reads the device-list shape and drops malformed entries', () => {
    const raw = { v: 2, devices: [dev(1, 'pt'), { endpoint: 'http://insecure', keys: { p256dh: 'x', auth: 'y' } }, { nope: 1 }] }
    expect(parsePushDevices(raw)).toEqual([dev(1, 'pt')])
  })
})

describe('device list edits', () => {
  it('replaces a re-subscribing device instead of duplicating it', () => {
    const list = addPushDevice([dev(1, 'en'), dev(2)], dev(1, 'pt'))
    expect(list.map((d) => [d.endpoint.slice(-1), d.lang])).toEqual([
      ['2', undefined],
      ['1', 'pt'],
    ])
  })

  it('keeps the newest devices when the cap is reached', () => {
    let list: PushDevice[] = []
    for (let i = 1; i <= MAX_PUSH_DEVICES + 2; i++) list = addPushDevice(list, dev(i))
    expect(list).toHaveLength(MAX_PUSH_DEVICES)
    expect(list[0].endpoint.endsWith('/3')).toBe(true)
  })

  it('removes only the named endpoints', () => {
    expect(removePushDevices([dev(1), dev(2), dev(3)], [dev(2).endpoint])).toEqual([dev(1), dev(3)])
  })

  it('serializes an empty list to null, so the settings toggle reads off', () => {
    expect(serializePushDevices([])).toBeNull()
    expect(serializePushDevices([dev(1)])).toEqual({ v: 2, devices: [dev(1)] })
  })
})

describe('deviceFromClient', () => {
  it('accepts a browser subscription with a supported language', () => {
    expect(deviceFromClient(dev(1), 'es', '2026-09-28T00:00:00Z')).toEqual({ ...dev(1), lang: 'es', addedAt: '2026-09-28T00:00:00Z' })
  })

  it('ignores an unknown language and rejects a non-https endpoint', () => {
    expect(deviceFromClient(dev(1), 'fr', 'now')?.lang).toBeUndefined()
    expect(deviceFromClient({ endpoint: 'http://x', keys: { p256dh: 'p', auth: 'a' } }, 'en', 'now')).toBeNull()
  })
})
