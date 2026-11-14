import { describe, expect, it } from 'vitest'
import { defaultChatPanel, fitChatPanel, readChatPanel, resizeChatPanel, type ChatPanelRect, type ChatPanelViewport } from '@/lib/chat/panel-geometry'

function expectInside(rect: ChatPanelRect, viewport: ChatPanelViewport) {
  expect(rect.width).toBeGreaterThan(0)
  expect(rect.height).toBeGreaterThan(0)
  expect(rect.x).toBeGreaterThanOrEqual(viewport.x)
  expect(rect.y).toBeGreaterThanOrEqual(viewport.y)
  expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.x + viewport.width)
  expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.y + viewport.height)
}

describe('chat panel geometry', () => {
  const viewports: ChatPanelViewport[] = [
    { x: 0, y: 0, width: 320, height: 568 },
    { x: 0, y: 0, width: 390, height: 844 },
    { x: 0, y: 0, width: 390, height: 280 }, // Software keyboard.
    { x: 30, y: 170, width: 300, height: 360 }, // Panned visual viewport.
    { x: 0, y: 0, width: 1440, height: 900 },
  ]

  for (const viewport of viewports) {
    it(`bounds initial position, extreme dragging and resizing in ${JSON.stringify(viewport)}`, () => {
      const start = defaultChatPanel(viewport, viewport.width >= 1024)
      expectInside(start, viewport)
      for (const delta of [-100_000, 100_000]) {
        expectInside(fitChatPanel({ ...start, x: delta, y: delta }, viewport), viewport)
        expectInside(resizeChatPanel(start, delta, delta, 'top', viewport), viewport)
        expectInside(resizeChatPanel(start, delta, delta, 'corner', viewport), viewport)
      }
    })
  }

  it('keeps the bottom edge fixed when resizing from the top', () => {
    const viewport = viewports[1]
    const start = { x: 24, y: 80, width: 320, height: 500 }
    for (const dy of [-10_000, -35, 60, 10_000]) {
      const rect = resizeChatPanel(start, 0, dy, 'top', viewport)
      expect(rect.y + rect.height).toBe(start.y + start.height)
    }
  })

  it('anchors the top left while growing the bottom corner against viewport edges', () => {
    const viewport = viewports[1]
    const start = { x: 40, y: 80, width: 320, height: 500 }
    const resized = resizeChatPanel(start, 10_000, 10_000, 'corner', viewport)
    expect(resized.x).toBe(start.x)
    expect(resized.y).toBe(start.y)
    expectInside(resized, viewport)
  })

  it('fits a saved desktop rectangle onto a narrow phone without mutating the preference', () => {
    const saved = { x: 700, y: 180, width: 600, height: 650 }
    const original = { ...saved }
    expectInside(fitChatPanel(saved, viewports[0]), viewports[0])
    expect(saved).toEqual(original)
  })

  it('opens above the selected desktop launcher on either side', () => {
    const viewport = viewports[4]
    expect(defaultChatPanel(viewport, true, { left: 40, right: 96, bottom: 860 }).x).toBe(40)
    const right = defaultChatPanel(viewport, true, { left: 1360, right: 1416, bottom: 860 })
    expect(right.x + right.width).toBe(1416)
  })

  it.each([null, '', 'not json', 'null', '[]', '{}', 'true', '{"x":0,"y":0,"width":0,"height":500}', '{"x":0,"y":0,"width":300,"height":-1}', '{"x":"12","y":0,"width":300,"height":500}', '{"x":1e999,"y":0,"width":300,"height":500}'])('rejects invalid stored rectangle %s', (value) => {
    expect(readChatPanel(value)).toBeNull()
  })

  it('restores finite positive saved geometry exactly', () => {
    const rect = { x: 12, y: 50, width: 340, height: 500 }
    expect(readChatPanel(JSON.stringify(rect))).toEqual(rect)
  })
})
