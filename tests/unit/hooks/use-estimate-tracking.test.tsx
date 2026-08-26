/**
 * hooks/use-estimate-tracking.ts — client-side engagement tracker.
 *
 * "RTL smoke: estimate-view mounts with tracking hook without network (mock
 * beacon)" (193-01-PLAN.md Tests section) is covered here at the hook level
 * rather than through a full <EstimateView> mount: EstimateView pulls in
 * next/dynamic chunks for both document renderers (dnd-kit, the full editor)
 * that aren't wired for a jsdom test harness, and its actual DOM-tracking
 * contract lives entirely in this hook. A plain ref + a couple of
 * data-track-section nodes exercises the exact same DOM surface EstimateView
 * wires up (see components/share/estimate-view.tsx's documentContainerRef).
 *
 * navigator.sendBeacon is mocked throughout — no test in this file ever
 * touches the real network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEstimateTracking } from '@/hooks/use-estimate-tracking'

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  callback: IntersectionObserverCallback
  observed: Element[] = []
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    FakeIntersectionObserver.instances.push(this)
  }
  observe(el: Element) {
    this.observed.push(el)
  }
  unobserve(el: Element) {
    this.observed = this.observed.filter((e) => e !== el)
  }
  disconnect() {
    this.observed = []
  }
  takeRecords() {
    return []
  }
  trigger(el: Element, ratio: number) {
    this.callback(
      [{ target: el, intersectionRatio: ratio } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    )
  }
}

function installSendBeacon() {
  const sendBeacon = vi.fn().mockReturnValue(true)
  Object.defineProperty(navigator, 'sendBeacon', {
    value: sendBeacon,
    configurable: true,
    writable: true,
  })
  return sendBeacon
}

async function decodeCalls(sendBeacon: ReturnType<typeof vi.fn>) {
  return Promise.all(
    sendBeacon.mock.calls.map(async ([url, blob]: [string, Blob]) => ({
      url,
      body: JSON.parse(await blob.text()),
    }))
  )
}

function makeContainer() {
  const container = document.createElement('div')
  container.getBoundingClientRect = () =>
    ({ top: 100, left: 0, width: 500, height: 800, right: 500, bottom: 900, x: 0, y: 100 }) as DOMRect
  document.body.appendChild(container)
  return container
}

function setScrollGeometry({ scrollHeight, innerHeight, scrollY }: { scrollHeight: number; innerHeight: number; scrollY: number }) {
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: scrollHeight, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true })
  Object.defineProperty(window, 'scrollY', { value: scrollY, configurable: true })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  FakeIntersectionObserver.instances = []
  window.localStorage.clear()
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useEstimateTracking', () => {
  it('does not touch the network synchronously on mount', () => {
    const sendBeacon = installSendBeacon()
    const container = makeContainer()
    renderHook(() => useEstimateTracking({ token: 'tok-1', containerRef: { current: container } }))
    expect(sendBeacon).not.toHaveBeenCalled()
  })

  it('flushes a batched "view" event on the 5s interval, coarsening device from viewport width', async () => {
    const sendBeacon = installSendBeacon()
    const container = makeContainer()
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true })

    renderHook(() => useEstimateTracking({ token: 'tok-1', containerRef: { current: container } }))
    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })

    expect(sendBeacon).toHaveBeenCalledTimes(1)
    const [{ url, body }] = await decodeCalls(sendBeacon)
    expect(url).toBe('/api/track/estimate')
    expect(body.token).toBe('tok-1')
    expect(typeof body.visitor_id).toBe('string')
    expect(typeof body.session_id).toBe('string')
    expect(body.events).toEqual([
      expect.objectContaining({ event_type: 'view', device: 'mobile', viewport_w: 500 }),
    ])
  })

  it('desktop viewport coarsens device to "desktop"', async () => {
    const sendBeacon = installSendBeacon()
    const container = makeContainer()
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true })

    renderHook(() => useEstimateTracking({ token: 'tok-1', containerRef: { current: container } }))
    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })

    const [{ body }] = await decodeCalls(sendBeacon)
    expect(body.events[0]).toEqual(expect.objectContaining({ device: 'desktop' }))
  })

  it('records a click inside the container with x_pct/y_px/doc_h and the nearest data-track-section as target', async () => {
    const sendBeacon = installSendBeacon()
    const container = makeContainer()
    const child = document.createElement('div')
    child.setAttribute('data-track-section', 'header')
    container.appendChild(child)

    renderHook(() => useEstimateTracking({ token: 'tok-1', containerRef: { current: container } }))
    child.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 50, clientY: 150 }))

    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })

    const [{ body }] = await decodeCalls(sendBeacon)
    const click = body.events.find((e: { event_type: string }) => e.event_type === 'click')
    expect(click).toEqual(
      expect.objectContaining({ target: 'header', x_pct: 10, y_px: 50, doc_h: 800 })
    )
  })

  it('fires section_view once, on the first ≥50%-visible IntersectionObserver entry, and never again for the same section', async () => {
    const sendBeacon = installSendBeacon()
    const container = makeContainer()
    const section = document.createElement('div')
    section.setAttribute('data-track-section', 'totals')
    container.appendChild(section)

    renderHook(() => useEstimateTracking({ token: 'tok-1', containerRef: { current: container } }))
    const observer = FakeIntersectionObserver.instances.at(-1)!
    act(() => observer.trigger(section, 0.4)) // below threshold — ignored
    act(() => observer.trigger(section, 0.6)) // crosses threshold — recorded
    act(() => observer.trigger(section, 0.9)) // already seen — not duplicated

    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })

    const [{ body }] = await decodeCalls(sendBeacon)
    const sectionViews = body.events.filter((e: { event_type: string }) => e.event_type === 'section_view')
    expect(sectionViews).toEqual([expect.objectContaining({ target: 'totals' })])
  })

  it('records each scroll-depth milestone (25/50/75/100) at most once', async () => {
    const sendBeacon = installSendBeacon()
    const container = makeContainer()
    setScrollGeometry({ scrollHeight: 2000, innerHeight: 1000, scrollY: 0 })

    renderHook(() => useEstimateTracking({ token: 'tok-1', containerRef: { current: container } }))

    // scrollableHeight = 2000 - 1000 = 1000 → 50% at scrollY 500.
    act(() => {
      setScrollGeometry({ scrollHeight: 2000, innerHeight: 1000, scrollY: 500 })
      window.dispatchEvent(new Event('scroll'))
    })
    act(() => {
      // No further movement — must not re-fire the 25/50 milestones.
      window.dispatchEvent(new Event('scroll'))
    })

    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })

    const [{ body }] = await decodeCalls(sendBeacon)
    const milestones = body.events
      .filter((e: { event_type: string }) => e.event_type === 'scroll_depth')
      .map((e: { metadata: { pct: number } }) => e.metadata.pct)
    expect(milestones).toEqual([25, 50])
  })

  it('does not emit a heartbeat while the tab is hidden', async () => {
    const sendBeacon = installSendBeacon()
    const container = makeContainer()
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })

    renderHook(() => useEstimateTracking({ token: 'tok-1', containerRef: { current: container } }))
    await act(async () => {
      vi.advanceTimersByTime(20_000)
      vi.advanceTimersByTime(5_000)
    })

    const [{ body }] = await decodeCalls(sendBeacon)
    expect(body.events.some((e: { event_type: string }) => e.event_type === 'heartbeat')).toBe(false)
  })

  it('emits a heartbeat every 20s while visible', async () => {
    const sendBeacon = installSendBeacon()
    const container = makeContainer()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })

    renderHook(() => useEstimateTracking({ token: 'tok-1', containerRef: { current: container } }))
    await act(async () => {
      vi.advanceTimersByTime(20_000)
      vi.advanceTimersByTime(5_000) // next flush tick picks it up
    })

    // The heartbeat and the initial "view" land in different flush batches
    // (view flushes at the 5s tick, heartbeat only fires at 20s) — collect
    // events across every sendBeacon call rather than assuming one batch.
    const calls = await decodeCalls(sendBeacon)
    const allEvents = calls.flatMap((c) => c.body.events)
    expect(allEvents).toContainEqual(
      expect.objectContaining({ event_type: 'heartbeat', metadata: { seconds: 20 } })
    )
  })

  it('flushes remaining buffered events on unmount (covers pagehide/tab-close)', async () => {
    const sendBeacon = installSendBeacon()
    const container = makeContainer()

    const { unmount } = renderHook(() =>
      useEstimateTracking({ token: 'tok-1', containerRef: { current: container } })
    )
    expect(sendBeacon).not.toHaveBeenCalled()

    unmount()
    expect(sendBeacon).toHaveBeenCalledTimes(1)
    const [{ body }] = await decodeCalls(sendBeacon)
    expect(body.events).toEqual([expect.objectContaining({ event_type: 'view' })])
  })

  it('falls back to fetch(keepalive) when sendBeacon is unavailable', async () => {
    // @ts-expect-error — simulating an old browser without the Beacon API.
    delete navigator.sendBeacon
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const container = makeContainer()

    renderHook(() => useEstimateTracking({ token: 'tok-1', containerRef: { current: container } }))
    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/track/estimate')
    expect(init).toEqual(
      expect.objectContaining({ method: 'POST', keepalive: true })
    )
    expect(JSON.parse(init.body).token).toBe('tok-1')
  })

  it('is a total no-op when enabled=false — no listeners, no view event, nothing on unmount', async () => {
    const sendBeacon = installSendBeacon()
    const container = makeContainer()
    const child = document.createElement('div')
    child.setAttribute('data-track-section', 'header')
    container.appendChild(child)

    const { unmount } = renderHook(() =>
      useEstimateTracking({ token: 'tok-1', containerRef: { current: container }, enabled: false })
    )
    child.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }))
    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })
    unmount()

    expect(sendBeacon).not.toHaveBeenCalled()
  })

  it('persists visitor_id in localStorage across separate mounts (session_id still changes)', async () => {
    const sendBeacon = installSendBeacon()

    const containerA = makeContainer()
    const { unmount: unmountA } = renderHook(() =>
      useEstimateTracking({ token: 'tok-1', containerRef: { current: containerA } })
    )
    unmountA()
    const [{ body: firstBody }] = await decodeCalls(sendBeacon)
    sendBeacon.mockClear()

    const containerB = makeContainer()
    const { unmount: unmountB } = renderHook(() =>
      useEstimateTracking({ token: 'tok-1', containerRef: { current: containerB } })
    )
    unmountB()
    const [{ body: secondBody }] = await decodeCalls(sendBeacon)

    expect(secondBody.visitor_id).toBe(firstBody.visitor_id)
    expect(secondBody.session_id).not.toBe(firstBody.session_id)
  })

  it('degrades gracefully when localStorage throws (Safari private mode) — still tracks, just without cross-session dedup', async () => {
    const sendBeacon = installSendBeacon()
    const container = makeContainer()
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    const { unmount } = renderHook(() =>
      useEstimateTracking({ token: 'tok-1', containerRef: { current: container } })
    )
    unmount()

    expect(sendBeacon).toHaveBeenCalledTimes(1)
    const [{ body }] = await decodeCalls(sendBeacon)
    expect(typeof body.visitor_id).toBe('string')
    expect(body.visitor_id.length).toBeGreaterThan(0)
  })
})
