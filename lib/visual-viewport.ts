'use client'

// The part of the screen the phone keyboard leaves visible.
//
// A phone keyboard does not shrink the layout viewport on iOS (nor on Android
// without interactive-widget), so anything fixed and centred (a dialog) sits
// half behind it and its submit button disappears. This module keeps two CSS
// variables on <html> in step with window.visualViewport, which does shrink:
//
//   --app-vvh     height of the visible area (CSS falls back to 100dvh)
//   --app-vv-top  how far the visible area is scrolled down the layout viewport
//
// Dialogs centre themselves in that area (see VISIBLE_AREA_DIALOG), and the
// focused field is brought back into view when the keyboard covers it.
// Import it once for its side effect; repeated imports install it once.

const KEYBOARD_MIN_PX = 120
const EDGE_GAP_PX = 12

/** Centres a dialog in what the keyboard leaves visible and lets it scroll there. */
export const VISIBLE_AREA_DIALOG =
  'top-[calc(var(--app-vv-top,0px)+var(--app-vvh,100dvh)/2)] max-h-[min(88dvh,calc(var(--app-vvh,100dvh)-1.5rem))] overflow-y-auto overscroll-contain'

function isTextEntry(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable || el instanceof HTMLTextAreaElement) return true
  if (!(el instanceof HTMLInputElement)) return false
  return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(el.type)
}

function install() {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement
  const touch = window.matchMedia?.('(pointer: coarse)')
  let baseline = { width: 0, height: 0 }
  let frame = 0

  const revealFocused = () => {
    const el = document.activeElement
    if (!isTextEntry(el)) return
    const rect = el.getBoundingClientRect()
    const top = vv.offsetTop
    const bottom = top + vv.height
    if (rect.top >= top + EDGE_GAP_PX && rect.bottom <= bottom - EDGE_GAP_PX) return
    el.scrollIntoView({ block: 'center', inline: 'nearest' })
  }

  const sync = () => {
    frame = 0
    const width = Math.round(vv.width)
    if (width !== baseline.width) baseline = { width, height: vv.height }
    else if (vv.height > baseline.height) baseline.height = vv.height
    root.style.setProperty('--app-vvh', `${vv.height}px`)
    root.style.setProperty('--app-vv-top', `${vv.offsetTop}px`)
    const open = Boolean(touch?.matches) && isTextEntry(document.activeElement) && baseline.height - vv.height > KEYBOARD_MIN_PX
    if (open) root.dataset.keyboard = 'open'
    else delete root.dataset.keyboard
    if (open) window.requestAnimationFrame(revealFocused)
  }

  const schedule = () => { if (!frame) frame = window.requestAnimationFrame(sync) }
  vv.addEventListener('resize', schedule)
  vv.addEventListener('scroll', schedule)
  document.addEventListener('focusin', schedule)
  document.addEventListener('focusout', schedule)
  sync()
}

declare global { interface Window { __xtimatorVisualViewport?: boolean } }

if (typeof window !== 'undefined' && !window.__xtimatorVisualViewport) {
  window.__xtimatorVisualViewport = true
  install()
}
