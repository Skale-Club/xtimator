import { describe, expect, it } from 'vitest'
import { isLikelyBotUserAgent } from '@/lib/security/bot-defense'

describe('isLikelyBotUserAgent', () => {
  it('treats missing, crawler, scraper and HTTP-library agents as bots', () => {
    for (const ua of [undefined, null, '', 'Googlebot/2.1', 'facebookexternalhit/1.1', 'Slackbot-LinkExpanding 1.0 bot', 'python-requests/2.31', 'curl/8.4.0', 'HeadlessChrome spider']) {
      expect(isLikelyBotUserAgent(ua as string | null | undefined)).toBe(true)
    }
  })

  it('accepts ordinary browsers', () => {
    expect(isLikelyBotUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1')).toBe(false)
    expect(isLikelyBotUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36')).toBe(false)
  })
})
