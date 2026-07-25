'use client'

import { useEffect, useRef, type RefObject } from 'react'

/**
 * useSubNavScroll — enhances the mobile/tablet Settings sub-nav pill row.
 *
 * quick-260724 (SEED-051): the horizontal pill row can hold more items than
 * fit on screen ("Message Template", "Knowledge", "Integrations" fall off the
 * right edge). Touch swipe already works via `overflow-x-auto`; this hook adds
 * the pointer-device affordances:
 *   - pointer/mouse DRAG-to-scroll with a grab/grabbing cursor
 *   - vertical mouse-wheel translated to horizontal scroll while over the row
 *   - auto-scrolling the ACTIVE pill into view on mount and on route change
 *
 * Every behaviour SELF-GATES on horizontal overflow (`scrollWidth > clientWidth`).
 * The desktop (md+) vertical rail renders the same <nav> with
 * `md:overflow-x-visible md:flex-col`, so it never overflows horizontally and
 * the hook is completely inert there — nothing to special-case for breakpoints.
 *
 * Attach the returned ref to the scrollable element (the <nav>); pass the active
 * key (route/section) so the active pill re-centres whenever it changes.
 */
export function useSubNavScroll(activeKey: string): RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement>(null)

  // Drag-to-scroll + wheel translation. Attached once; self-gates per gesture.
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const canScroll = () => el.scrollWidth > el.clientWidth + 1

    // Grab-cursor affordance only when the row can actually scroll.
    const applyCursor = () => {
      el.style.cursor = canScroll() ? 'grab' : ''
    }

    // Vertical wheel → horizontal scroll (only when the row can scroll and the
    // gesture is predominantly vertical; native horizontal trackpad gestures
    // already scroll the row, and non-scrollable = let the page scroll).
    const onWheel = (e: WheelEvent) => {
      if (!canScroll()) return
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      el.scrollLeft += e.deltaY
      e.preventDefault()
    }

    let dragging = false
    let moved = false
    let startX = 0
    let startScroll = 0
    const DRAG_THRESHOLD = 4

    const swallowClick = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }

    const onPointerDown = (e: PointerEvent) => {
      // Leave touch to native momentum scrolling; primary button only.
      if (e.pointerType === 'touch' || e.button !== 0) return
      if (!canScroll()) return
      dragging = true
      moved = false
      startX = e.clientX
      startScroll = el.scrollLeft
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - startX
      if (!moved && Math.abs(dx) > DRAG_THRESHOLD) {
        moved = true
        el.style.cursor = 'grabbing'
        el.style.userSelect = 'none'
      }
      if (moved) el.scrollLeft = startScroll - dx
    }

    const onPointerUp = () => {
      if (!dragging) return
      dragging = false
      el.style.userSelect = ''
      applyCursor()
      if (moved) {
        // Swallow the click the browser fires after a real drag so releasing
        // over a pill doesn't navigate to it. Cleared next tick if none fires.
        el.addEventListener('click', swallowClick, { capture: true, once: true })
        setTimeout(() => el.removeEventListener('click', swallowClick, true), 0)
      }
      moved = false
    }

    // Suppress the native link/image drag ghost while drag-scrolling.
    const onDragStart = (e: DragEvent) => {
      if (dragging) e.preventDefault()
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('dragstart', onDragStart)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)

    applyCursor()
    const ro = new ResizeObserver(applyCursor)
    ro.observe(el)

    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('dragstart', onDragStart)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      ro.disconnect()
      el.style.cursor = ''
      el.style.userSelect = ''
    }
  }, [])

  // Centre the active pill horizontally on mount / route change. Inert on the
  // desktop vertical rail (no horizontal overflow).
  useEffect(() => {
    const el = ref.current
    if (!el || el.scrollWidth <= el.clientWidth + 1) return
    const active = el.querySelector<HTMLElement>('[aria-current="page"]')
    if (!active) return
    const target = active.offsetLeft - el.clientWidth / 2 + active.offsetWidth / 2
    el.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
  }, [activeKey])

  return ref
}
