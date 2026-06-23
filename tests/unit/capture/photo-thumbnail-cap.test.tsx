import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * QUICK-U4F: photo thumbnails + per-photo upload feedback + 15-photo cap in the
 * New Xtimate capture popup.
 *
 * Two focused suites:
 *  - clampToPhotoLimit: the pure 15-cap math used by handlePhotoFileChange.
 *  - PhotoThumbnailGrid: the presentational strip (uploading / done thumbnails
 *    + remove button), rendered in isolation so we never mount the whole
 *    pipeline (supabase / inngest / AI).
 *
 * t() is mocked to an identity so labels are deterministic and the component
 * doesn't need the real i18n provider context.
 */

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    language: 'en',
  }),
}))

import {
  clampToPhotoLimit,
  PhotoThumbnailGrid,
} from '@/components/capture/capture-recorder'

describe('clampToPhotoLimit (15-photo hard cap)', () => {
  it('caps an over-large first selection to 15 and flags overflow', () => {
    expect(clampToPhotoLimit(0, 20)).toEqual({ take: 15, overflowed: true })
  })

  it('takes only the remaining slots when near the cap', () => {
    expect(clampToPhotoLimit(13, 5)).toEqual({ take: 2, overflowed: true })
  })

  it('takes nothing once already at the cap', () => {
    expect(clampToPhotoLimit(15, 1)).toEqual({ take: 0, overflowed: true })
  })

  it('takes everything when under the cap with room to spare', () => {
    expect(clampToPhotoLimit(2, 3)).toEqual({ take: 3, overflowed: false })
  })

  it('never returns a negative take when somehow over the cap', () => {
    expect(clampToPhotoLimit(20, 4)).toEqual({ take: 0, overflowed: true })
  })
})

describe('PhotoThumbnailGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const items = [
    { id: 'a', status: 'uploading' as const, previewUrl: 'blob:preview-a' },
    {
      id: 'b',
      status: 'done' as const,
      previewUrl: 'blob:preview-b',
      photo: {
        id: 'photo-b',
        project_id: 'p',
        company_id: 'c',
        storage_path: 'c/p/b.jpg',
        caption: null,
        ai_description: null,
        sort_order: 0,
        created_at: '2026-06-22T00:00:00Z',
      },
    },
  ]

  it('renders nothing when there are no items', () => {
    const { container } = render(<PhotoThumbnailGrid items={[]} onRemove={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a thumbnail (with its previewUrl) and a remove button per item', () => {
    const { container } = render(<PhotoThumbnailGrid items={items} onRemove={() => {}} />)
    const removeButtons = screen.getAllByTestId('capture-remove-photo')
    expect(removeButtons).toHaveLength(2)

    // alt="" gives the <img> a presentation role, so query the DOM directly.
    const imgs = Array.from(container.querySelectorAll('img'))
    const srcs = imgs.map(img => img.getAttribute('src'))
    expect(srcs).toContain('blob:preview-a')
    expect(srcs).toContain('blob:preview-b')
  })

  it('calls onRemove with the item id when a remove button is clicked', () => {
    const onRemove = vi.fn()
    render(<PhotoThumbnailGrid items={items} onRemove={onRemove} />)
    const removeButtons = screen.getAllByTestId('capture-remove-photo')
    fireEvent.click(removeButtons[0])
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onRemove).toHaveBeenCalledWith('a')
  })
})
