/** Viewport-relative bounds for the floating, non-modal Xtimator AI panel. */
export interface ChatPanelRect { x: number; y: number; width: number; height: number }
export interface ChatPanelViewport { x: number; y: number; width: number; height: number }

const GAP = 12

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

export function panelLimits(viewport: ChatPanelViewport) {
  const maxWidth = Math.max(1, viewport.width - GAP * 2)
  const maxHeight = Math.max(1, viewport.height - GAP * 2)
  return {
    minWidth: Math.min(300, maxWidth), maxWidth,
    minHeight: Math.min(320, maxHeight), maxHeight,
  }
}

/** Fit the preferred rectangle temporarily; keyboard changes never overwrite it. */
export function fitChatPanel(rect: ChatPanelRect, viewport: ChatPanelViewport): ChatPanelRect {
  const limits = panelLimits(viewport)
  const width = clamp(rect.width, limits.minWidth, limits.maxWidth)
  const height = clamp(rect.height, limits.minHeight, limits.maxHeight)
  return {
    width, height,
    x: clamp(rect.x, viewport.x + GAP, viewport.x + viewport.width - width - GAP),
    y: clamp(rect.y, viewport.y + GAP, viewport.y + viewport.height - height - GAP),
  }
}

export function defaultChatPanel(viewport: ChatPanelViewport, desktop: boolean, launcher?: { left: number; right: number; bottom: number }): ChatPanelRect {
  const width = desktop ? 420 : Math.min(440, viewport.width * 0.92)
  const height = Math.min(640, viewport.height * (desktop ? 0.8 : 0.74))
  const onLeft = launcher && (launcher.left + launcher.right) / 2 < viewport.width / 2
  return fitChatPanel({
    width, height,
    x: desktop ? (launcher ? (onLeft ? launcher.left : launcher.right - width) : viewport.width - width - 24) : (viewport.width - width) / 2,
    y: desktop ? (launcher ? launcher.bottom - height : viewport.height - height - 24) : viewport.y + (viewport.height - height) / 2,
  }, viewport)
}

/**
 * Phones (< 640px): the panel is a drawer, like every other phone overlay. Full
 * width, pinned to the bottom of the visible viewport, about 85% tall. No
 * position or size of its own: nothing to drag or resize.
 */
export function phoneChatPanel(viewport: ChatPanelViewport): ChatPanelRect {
  const height = Math.max(1, Math.round(viewport.height * 0.85))
  return { x: viewport.x, y: viewport.y + viewport.height - height, width: viewport.width, height }
}

/** Move the top edge while keeping the bottom anchored, or resize the corner. */
export function resizeChatPanel(start: ChatPanelRect, dx: number, dy: number, edge: 'top' | 'corner', viewport: ChatPanelViewport): ChatPanelRect {
  const limits = panelLimits(viewport)
  if (edge === 'top') {
    const bottom = start.y + start.height
    const top = clamp(start.y + dy, viewport.y + GAP, bottom - limits.minHeight)
    return fitChatPanel({ ...start, y: top, height: bottom - top }, viewport)
  }
  return fitChatPanel({
    ...start,
    width: clamp(start.width + dx, limits.minWidth, viewport.x + viewport.width - GAP - start.x),
    height: clamp(start.height + dy, limits.minHeight, viewport.y + viewport.height - GAP - start.y),
  }, viewport)
}

export function readChatPanel(value: string | null): ChatPanelRect | null {
  try {
    const rect = JSON.parse(value ?? 'null') as ChatPanelRect | null
    return rect && ['x', 'y', 'width', 'height'].every(key => typeof rect[key as keyof ChatPanelRect] === 'number' && Number.isFinite(rect[key as keyof ChatPanelRect])) && rect.width > 0 && rect.height > 0 ? rect : null
  } catch { return null }
}
