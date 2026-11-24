import type { Page } from '@playwright/test'

/** Native event evidence without changing product handlers or dispatching clicks. */
export async function observeMicrophoneEvents(page: Page) {
  await page.addInitScript(() => {
    const events: unknown[] = []
    Object.assign(window, { __qaMicrophoneEvents: events })
    for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click']) {
      for (const capture of [true, false]) document.addEventListener(type, event => {
        if (events.length >= 80) return
        const microphone = document.querySelector<HTMLButtonElement>('[data-testid="capture-mic"]')
        const target = event.target instanceof Element ? event.target : null
        const touch = typeof TouchEvent !== 'undefined' && event instanceof TouchEvent ? event.changedTouches[0] : null
        const pointer = event instanceof MouseEvent ? event : touch
        events.push({
          type, capture, trusted: event.isTrusted, prevented: event.defaultPrevented,
          microphoneTarget: Boolean(microphone && target && microphone.contains(target)),
          target: target?.tagName, label: target?.getAttribute('aria-label'),
          enabled: microphone ? !microphone.disabled : null,
          x: pointer?.clientX, y: pointer?.clientY,
          rect: microphone?.getBoundingClientRect().toJSON(),
        })
      }, capture)
    }
  })
}
