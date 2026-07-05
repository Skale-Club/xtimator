import { describe, expect, it } from 'vitest'
import { conciseDescription, createPublicMetadata } from '@/lib/seo/metadata'

describe('public metadata', () => {
  it('emits canonical and complete social fields', () => {
    const metadata = createPublicMetadata({
      title: 'AI Estimates for Contractors',
      description: 'Create professional estimates in minutes.',
      pathname: '/industries/general-contractors',
      imageUrl: 'https://cdn.example.com/og.jpg',
      imageAlt: 'Xtimator estimate preview',
    })
    expect(metadata.alternates?.canonical).toBe(
      'https://xtimator.com/industries/general-contractors',
    )
    expect(metadata.openGraph).toEqual(
      expect.objectContaining({
        url: 'https://xtimator.com/industries/general-contractors',
        type: 'website',
      }),
    )
    expect(metadata.twitter).toEqual(expect.objectContaining({ card: 'summary_large_image' }))
  })

  it('keeps descriptions within 160 characters', () => {
    expect(conciseDescription('x'.repeat(300))).toHaveLength(160)
  })
})
