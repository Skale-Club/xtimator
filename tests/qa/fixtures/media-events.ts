import type { Page } from '@playwright/test'

/** Native event evidence without changing product handlers or dispatching clicks. */
export async function observeMicrophoneEvents(page: Page) {
  await page.addInitScript(() => {
    const events: unknown[] = []
    Object.assign(window, { __qaMicrophoneEvents: events })
    let installedGetUserMedia: MediaDevices['getUserMedia'] | undefined
    document.addEventListener('DOMContentLoaded', () => {
      const device = navigator.mediaDevices
      const ownMethod = device && Object.getOwnPropertyDescriptor(device, 'getUserMedia')?.value
      if (typeof ownMethod === 'function') installedGetUserMedia = ownMethod
    }, { once: true })
    if (typeof PerformanceObserver === 'function') {
      const observer = new PerformanceObserver(list => {
        for (const mark of list.getEntries()) {
          if (events.length >= 80) return
          if (mark.name.startsWith('xtimator:capture-mic:')) events.push({ type: 'app-phase', name: mark.name })
        }
      })
      observer.observe({ entryTypes: ['mark'] })
    }
    for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click']) {
      for (const capture of [true, false]) document.addEventListener(type, event => {
        if (events.length >= 80) return
        const microphone = document.querySelector<HTMLButtonElement>('[data-testid="capture-mic"]')
        const target = event.target instanceof Element ? event.target : null
        const touch = typeof TouchEvent !== 'undefined' && event instanceof TouchEvent ? event.changedTouches[0] : null
        const mouse = event instanceof MouseEvent ? event : null
        const pointer = mouse ?? touch
        const propsKey = microphone && Object.getOwnPropertyNames(microphone).find(key => key.startsWith('__reactProps$'))
        const props = microphone && propsKey ? Reflect.get(microphone, propsKey) : null
        const device = navigator.mediaDevices
        events.push({
          type, capture, trusted: event.isTrusted, prevented: event.defaultPrevented,
          microphoneTarget: Boolean(microphone && target && microphone.contains(target)),
          target: target?.tagName, label: target?.getAttribute('aria-label'),
          enabled: microphone ? !microphone.disabled : null,
          disabledByDom: microphone?.matches(':disabled') ?? null,
          button: mouse?.button, buttons: mouse?.buttons, detail: mouse?.detail,
          pointerType: typeof PointerEvent !== 'undefined' && event instanceof PointerEvent ? event.pointerType : null,
          reactOnClick: typeof props?.onClick === 'function', reactDisabled: props?.disabled === true,
          ownGetUserMedia: Boolean(device && Object.prototype.hasOwnProperty.call(device, 'getUserMedia')),
          sameInstalledGetUserMedia: installedGetUserMedia ? device?.getUserMedia === installedGetUserMedia : null,
          x: pointer?.clientX, y: pointer?.clientY,
          rect: microphone?.getBoundingClientRect().toJSON(),
        })
      }, capture)
    }
  })
}
