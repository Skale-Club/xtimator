import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

/**
 * Phase 78 plan 01 — OgImageUploader component coverage.
 *
 * Covers:
 *  1. empty 1200x630 dropzone when currentUrl null
 *  2. preview img rendered when currentUrl provided
 *  3. valid PNG calls onFileSelect once
 *  4. unsupported type rejected with toast + no callback
 *  5. >2MB rejected with toast + no callback
 *  6. <600x315 detected → red warning text
 *  7. 1200x630 detected → dimensions shown, no warning
 *  8. Remove button → onRemove() called
 *  9. external URL (not in managed path) → hint banner
 */

// -- mocks -------------------------------------------------------------------
const toastErrorMock = vi.fn()
const toastSuccessMock = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}))

// jsdom: stub URL.createObjectURL
beforeEach(() => {
  toastErrorMock.mockReset()
  toastSuccessMock.mockReset()
  global.URL.createObjectURL = vi.fn(() => 'blob:mock-object-url')
})

import { OgImageUploader } from '@/components/admin/og-image-uploader'

const MANAGED_URL = 'https://example.supabase.co/storage/v1/object/public/platform-brand/og-images/123-og.png'
const EXTERNAL_URL = 'https://cdn.example.com/og.png'

function makeFile(opts: { type?: string; size?: number; name?: string } = {}): File {
  const { type = 'image/png', size = 1024, name = 'og.png' } = opts
  const bytes = new Uint8Array(size)
  return new File([bytes], name, { type })
}

function fireImgLoad(img: HTMLImageElement, w: number, h: number) {
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: w })
  Object.defineProperty(img, 'naturalHeight', { configurable: true, value: h })
  fireEvent.load(img)
}

describe('OgImageUploader', () => {
  it('1. renders empty 1200x630 dropzone when currentUrl is null', () => {
    render(
      <OgImageUploader currentUrl={null} onFileSelect={vi.fn()} onRemove={vi.fn()} />
    )
    // placeholder label
    expect(screen.getAllByText(/Upload OG image/i).length).toBeGreaterThan(0)
    // aspect ratio class present on the dropzone container
    const dropzone = screen.getByRole('button', { name: /Upload OG image/i })
    expect(dropzone.className).toMatch(/aspect-\[1200\/630\]/)
  })

  it('2. renders preview img when currentUrl is provided', () => {
    render(
      <OgImageUploader currentUrl={MANAGED_URL} onFileSelect={vi.fn()} onRemove={vi.fn()} />
    )
    const img = screen.getByAltText(/OG image preview/i) as HTMLImageElement
    expect(img).toBeTruthy()
    expect(img.src).toBe(MANAGED_URL)
  })

  it('3. selecting a valid PNG calls onFileSelect(file, preview) once', () => {
    const onFileSelect = vi.fn()
    const { container } = render(
      <OgImageUploader currentUrl={null} onFileSelect={onFileSelect} onRemove={vi.fn()} />
    )
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = makeFile({ type: 'image/png', size: 1024 * 1024 })
    fireEvent.change(input, { target: { files: [file] } })
    expect(onFileSelect).toHaveBeenCalledTimes(1)
    expect(onFileSelect).toHaveBeenCalledWith(file, 'blob:mock-object-url')
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it('4. unsupported type triggers toast.error and does not call onFileSelect', () => {
    const onFileSelect = vi.fn()
    const { container } = render(
      <OgImageUploader currentUrl={null} onFileSelect={onFileSelect} onRemove={vi.fn()} />
    )
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = makeFile({ type: 'image/svg+xml', name: 'og.svg' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(onFileSelect).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalledTimes(1)
    expect(String(toastErrorMock.mock.calls[0][0])).toMatch(/Unsupported image format/i)
  })

  it('5. file >2MB triggers toast.error and does not call onFileSelect', () => {
    const onFileSelect = vi.fn()
    const { container } = render(
      <OgImageUploader currentUrl={null} onFileSelect={onFileSelect} onRemove={vi.fn()} />
    )
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = makeFile({ type: 'image/png', size: 3 * 1024 * 1024 })
    fireEvent.change(input, { target: { files: [file] } })
    expect(onFileSelect).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalledTimes(1)
    expect(String(toastErrorMock.mock.calls[0][0])).toMatch(/under 2MB/i)
  })

  it('6. small dimensions (500x200) → red warning text shown', () => {
    render(
      <OgImageUploader currentUrl={MANAGED_URL} onFileSelect={vi.fn()} onRemove={vi.fn()} />
    )
    const img = screen.getByAltText(/OG image preview/i) as HTMLImageElement
    act(() => fireImgLoad(img, 500, 200))
    const warning = screen.getByText(/Recommended at least 600 x 315/i)
    expect(warning).toBeTruthy()
    expect(warning.className).toMatch(/text-destructive/)
    expect(warning.textContent).toMatch(/500 x 200/)
  })

  it('7. ideal dimensions (1200x630) → dimensions shown, no warning', () => {
    render(
      <OgImageUploader currentUrl={MANAGED_URL} onFileSelect={vi.fn()} onRemove={vi.fn()} />
    )
    const img = screen.getByAltText(/OG image preview/i) as HTMLImageElement
    act(() => fireImgLoad(img, 1200, 630))
    // Two matches: detected dims "1200 x 630" + helper "Ideal: 1200 x 630..."
    expect(screen.getAllByText(/1200 x 630/).length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText(/Recommended at least/i)).toBeNull()
  })

  it('8. Remove button fires onRemove() once', () => {
    const onRemove = vi.fn()
    render(
      <OgImageUploader currentUrl={MANAGED_URL} onFileSelect={vi.fn()} onRemove={onRemove} />
    )
    const removeBtn = screen.getByRole('button', { name: /^Remove$/i })
    fireEvent.click(removeBtn)
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('9. external URL renders hint banner', () => {
    render(
      <OgImageUploader currentUrl={EXTERNAL_URL} onFileSelect={vi.fn()} onRemove={vi.fn()} />
    )
    expect(screen.getByText(/Currently using external URL/i)).toBeTruthy()
  })

  it('9b. managed URL does NOT render hint banner', () => {
    render(
      <OgImageUploader currentUrl={MANAGED_URL} onFileSelect={vi.fn()} onRemove={vi.fn()} />
    )
    expect(screen.queryByText(/Currently using external URL/i)).toBeNull()
  })
})
