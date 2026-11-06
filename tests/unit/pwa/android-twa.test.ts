import { describe, it, expect } from 'vitest'
import {
  buildAssetLinks,
  ANDROID_TWA_PACKAGE_NAME,
  ANDROID_TWA_SHA256_FINGERPRINTS,
} from '@/lib/pwa/android-twa'
import { GET } from '@/app/.well-known/assetlinks.json/route'

const FP = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(':')

describe('android TWA asset links', () => {
  it('serves an empty list while no fingerprint is configured', () => {
    expect(buildAssetLinks(ANDROID_TWA_PACKAGE_NAME, [])).toEqual([])
  })

  it('emits one handle_all_urls statement with normalized fingerprints', () => {
    const links = buildAssetLinks('com.example.app', [` ${FP.toLowerCase()} `])
    expect(links).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.example.app',
          sha256_cert_fingerprints: [FP],
        },
      },
    ])
  })

  it('drops malformed fingerprints instead of publishing them', () => {
    expect(buildAssetLinks('com.example.app', ['not-a-fingerprint', 'AB:CD'])).toEqual([])
  })

  it('route returns public JSON', async () => {
    const res = GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(Array.isArray(await res.json())).toBe(true)
  })

  it('publishes both configured Play fingerprints for the real package', () => {
    const [statement] = buildAssetLinks()
    expect(statement.target.package_name).toBe('com.xtimator.app')
    expect(statement.target.sha256_cert_fingerprints).toEqual([...ANDROID_TWA_SHA256_FINGERPRINTS])
    expect(statement.target.sha256_cert_fingerprints).toHaveLength(2)
  })
})
