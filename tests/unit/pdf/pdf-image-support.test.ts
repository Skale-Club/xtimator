// PDF-LOGO-01 — `willPdfRenderLogo`, the ONE predicate shared by header
// measurement (lib/pdf/measure-header-height.ts) and the render gate
// (components/pdf/shared/pdf-header.tsx).
//
// The reason a wrong answer here is expensive: measurement and render read the
// SAME function, so a false positive reserves 64-72pt of blank header on every
// page of every affected PDF, and a false negative deletes a logo that would
// have rendered. Both are silent.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { dataUriMediaType, willPdfRenderLogo } from '@/lib/pdf/pdf-image-support'

describe('dataUriMediaType', () => {
  it.each([
    ['data:image/png;base64,AAAA', 'image/png'],
    ['data:image/webp;base64,AAAA', 'image/webp'],
    ['data:IMAGE/PNG;BASE64,AAAA', 'image/png'],
    ['data:image/jpeg,raw', 'image/jpeg'],
    ['data:;base64,AAAA', ''],
  ])('%s -> %s', (input, expected) => {
    expect(dataUriMediaType(input)).toBe(expected)
  })

  it.each(['https://acme.test/logo.png', '/storage/logos/a/b.png', 'data:no-comma'])(
    'returns null for %s (not a data URI)',
    (input) => {
      expect(dataUriMediaType(input)).toBeNull()
    }
  )
})

describe('willPdfRenderLogo — data URIs', () => {
  it.each(['data:image/png;base64,AAAA', 'data:image/jpeg;base64,AAAA', 'data:image/jpg;base64,AAAA'])(
    'true for %s (the formats @react-pdf/image isValidFormat accepts)',
    (input) => {
      expect(willPdfRenderLogo(input)).toBe(true)
    }
  )

  it.each([
    'data:image/webp;base64,AAAA',
    'data:image/gif;base64,AAAA',
    'data:image/svg+xml;base64,AAAA',
    'data:image/avif;base64,AAAA',
    'data:application/octet-stream;base64,AAAA',
    'data:text/html;base64,AAAA',
  ])('false for %s — react-pdf draws nothing, so no height may be charged', (input) => {
    expect(willPdfRenderLogo(input)).toBe(false)
  })
})

describe('willPdfRenderLogo — same-origin storage paths', () => {
  // THE PARITY CASE. The client paginated-preview hook measures this raw value
  // while the PDF measures the data URI it resolves to; both must answer true or
  // the two surfaces compute different page breaks.
  it.each([
    '/storage/logos/571b4fc7-1111-4111-8111-111111111111/logo.webp',
    '/storage/logos/1b038660-1111-4111-8111-111111111111/logo.png',
    '/storage/platform-brand/brand/logo.webp',
  ])('true for %s — the server-side resolver transcodes it before rendering', (input) => {
    expect(willPdfRenderLogo(input)).toBe(true)
  })

  it('false for a relative path that is NOT one of ours (react-pdf has no base URL in Node)', () => {
    expect(willPdfRenderLogo('/images/logo.png')).toBe(false)
    expect(willPdfRenderLogo('logo.png')).toBe(false)
  })
})

describe('willPdfRenderLogo — absolute URLs', () => {
  it('true for an http(s) URL react-pdf can decode', () => {
    expect(willPdfRenderLogo('https://acme.test/logo.png')).toBe(true)
    expect(willPdfRenderLogo('https://acme.test/logo.JPG')).toBe(true)
    // Extensionless CDN URL: assumed renderable. Guessing false would delete a
    // logo that renders today, which is the worse error.
    expect(willPdfRenderLogo('https://cdn.acme.test/assets/9f3a1c')).toBe(true)
  })

  it('false for a legacy absolute WebP row — this is what stops reserving blank space', () => {
    expect(
      willPdfRenderLogo(
        'https://prmqgcrnpuvpzruyzvuv.supabase.co/storage/v1/object/public/logos/co-1/logo.webp'
      )
    ).toBe(false)
  })

  it.each(['.gif', '.svg', '.avif', '.bmp', '.tiff', '.ico'])(
    'false for a %s URL (react-pdf sniffs magic bytes and knows only JPEG/PNG)',
    (ext) => {
      expect(willPdfRenderLogo(`https://acme.test/logo${ext}`)).toBe(false)
    }
  )

  it('ignores query strings and fragments when reading the extension', () => {
    expect(willPdfRenderLogo('https://acme.test/logo.png?v=2')).toBe(true)
    expect(willPdfRenderLogo('https://acme.test/logo.webp?v=2')).toBe(false)
  })

  it.each(['javascript:alert(1)', '//evil.test/logo.png', 'file:///etc/passwd', 'ftp://a/logo.png'])(
    'false for %s',
    (input) => {
      expect(willPdfRenderLogo(input)).toBe(false)
    }
  )
})

describe('willPdfRenderLogo — empties', () => {
  it.each([null, undefined, ''])('false for %s', (input) => {
    expect(willPdfRenderLogo(input)).toBe(false)
  })
})

describe('the predicate is genuinely SHARED (measure and render cannot drift apart)', () => {
  const root = process.cwd()

  it.each([
    'lib/pdf/measure-header-height.ts',
    'components/pdf/shared/pdf-header.tsx',
  ])('%s calls willPdfRenderLogo and does NOT gate on bare logo_url truthiness', (file) => {
    const src = readFileSync(resolve(root, file), 'utf8')
    expect(src).toMatch(/willPdfRenderLogo\(\s*company\.logo_url\s*\)/)
  })

  it('pdf-image-support.ts stays browser-safe — the client preview hook reaches it', () => {
    const src = readFileSync(resolve(root, 'lib/pdf/pdf-image-support.ts'), 'utf8')
    // A `sharp` or `server-only` import here would crash the paginated preview
    // in the browser bundle. The transcode lives in resolve-pdf-logo.ts.
    expect(src).not.toMatch(/^import .*(?:'sharp'|"sharp"|'server-only'|"server-only")/m)
  })
})
