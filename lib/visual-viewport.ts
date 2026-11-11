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
//   --app-kb      how much of the layout viewport's bottom the keyboard covers
//                 (0 when it is closed): bottom sheets sit on top of it
//
// While the keyboard is open <html data-keyboard="open"> is set; globals.css
// uses it to keep EVERY dialog, alert dialog and sheet inside the visible
// area and to hide fixed bottom bars marked data-hide-on-keyboard. The module
// is imported by the dialog/sheet primitives and the root layout, so it is
// always installed.
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
  let revealedFor: Element | null = null

  // Brings the focused field into the visible area AND, when they fit together,
  // the action that completes it (the form's submit button, or the last button
  // of the dialog/sheet/form it lives in), so "type, then tap Continue" never
  // needs the keyboard closed first. globals.css adds keyboard-height scroll
  // room at the bottom of the page so a page that exactly fits the screen can
  // still be scrolled up above the keyboard.
  const primaryActionFor = (el: HTMLElement): HTMLElement | null => {
    const scope = el.closest('form, [data-slot="dialog-content"], [data-slot="alert-dialog-content"], [data-slot="sheet-content"]')
    if (!scope) return null
    const submit = scope.querySelector<HTMLElement>('button[type="submit"]:not([disabled]), input[type="submit"]')
    if (submit && submit.offsetParent) return submit
    // Otherwise the last visible button that comes after the field.
    const buttons = Array.from(scope.querySelectorAll<HTMLElement>('button')).filter(
      (b) => b.offsetParent && !b.closest('[data-slot="dialog-close"], [data-slot="sheet-close"]') &&
        (el.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    )
    return buttons[buttons.length - 1] ?? null
  }

  const revealFocused = () => {
    const el = document.activeElement
    if (!isTextEntry(el)) return
    const visibleTop = vv.offsetTop + EDGE_GAP_PX
    const visibleBottom = vv.offsetTop + vv.height - EDGE_GAP_PX
    const field = el.getBoundingClientRect()
    const action = primaryActionFor(el)
    // Inner scroll containers (a dialog body) first, then the page itself.
    if (action) {
      const a = action.getBoundingClientRect()
      const span = a.bottom - Math.min(field.top, a.top)
      if (a.top >= field.top && span <= visibleBottom - visibleTop) {
        action.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        const after = action.getBoundingClientRect()
        if (after.bottom > visibleBottom) window.scrollBy({ top: after.bottom - visibleBottom })
        const f = el.getBoundingClientRect()
        if (f.top < visibleTop) window.scrollBy({ top: f.top - visibleTop })
        return
      }
    }
    if (field.top >= visibleTop && field.bottom <= visibleBottom) return
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const f = el.getBoundingClientRect()
    if (f.bottom > visibleBottom) window.scrollBy({ top: f.bottom - visibleBottom })
    else if (f.top < visibleTop) window.scrollBy({ top: f.top - visibleTop })
  }

  const sync = () => {
    frame = 0
    const width = Math.round(vv.width)
    if (width !== baseline.width) baseline = { width, height: vv.height }
    else if (vv.height > baseline.height) baseline.height = vv.height
    root.style.setProperty('--app-vvh', `${vv.height}px`)
    root.style.setProperty('--app-vv-top', `${vv.offsetTop}px`)
    const open = Boolean(touch?.matches) && isTextEntry(document.activeElement) && baseline.height - vv.height > KEYBOARD_MIN_PX
    // --app-kb: what the keyboard covers of the layout viewport's bottom right
    // now (moves with iOS panning; bottom sheets sit on it). --app-kb-room: the
    // keyboard's height, stable while panning (page scroll room). Both are 0
    // when the browser shrinks the layout viewport itself (Android).
    const covered = open ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0
    const room = open ? Math.max(0, window.innerHeight - vv.height) : 0
    root.style.setProperty('--app-kb', `${Math.round(covered)}px`)
    root.style.setProperty('--app-kb-room', `${Math.round(room)}px`)
    if (open) root.dataset.keyboard = 'open'
    else delete root.dataset.keyboard
    // Reveal once per keyboard opening / focused field, not on every viewport
    // scroll, so it never fights the user scrolling the page themselves.
    const focused = open ? document.activeElement : null
    if (focused && focused !== revealedFor) window.requestAnimationFrame(revealFocused)
    revealedFor = focused
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
