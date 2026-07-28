// tests/unit/pdf/register-fonts.test.ts
// PDFPAR-01/ENGINE-03 — real renderToBuffer smoke test proving the vendored
// TTF font files (Inter, Inter-Bold, Lora, Lora-Bold) are valid and loadable
// by react-pdf's font engine (fontkit), not just present on disk. This is a
// REAL render call — no mocking of '@react-pdf/renderer'.

import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { Document, Page, Text, renderToBuffer } from '@react-pdf/renderer'
import '@/lib/pdf/register-fonts'

describe('register-fonts', () => {
  it('renders a real PDF buffer using all 4 registered font families', async () => {
    const el = createElement(
      Document,
      {},
      createElement(
        Page,
        { size: 'LETTER' },
        createElement(Text, { style: { fontFamily: 'Inter' } }, 'Classic'),
        createElement(Text, { style: { fontFamily: 'Inter-Bold' } }, 'Classic Bold'),
        createElement(Text, { style: { fontFamily: 'Lora' } }, 'Modern'),
        createElement(Text, { style: { fontFamily: 'Lora-Bold' } }, 'Modern Bold'),
      ),
    )

    const buf = await renderToBuffer(el as any)

    expect(buf.length).toBeGreaterThan(0)
    expect(buf.subarray(0, 4).toString('ascii')).toBe('%PDF')
  })
})
