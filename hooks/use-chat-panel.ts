'use client'

import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react'
import { defaultChatPanel, fitChatPanel, phoneChatPanel, readChatPanel, resizeChatPanel, type ChatPanelRect, type ChatPanelViewport } from '@/lib/chat/panel-geometry'

const STORAGE_KEY = 'xtimator.chat-panel.v1'
type Gesture = { id: number; kind: 'move' | 'top' | 'corner'; start: ChatPanelRect; preferred: ChatPanelRect; x: number; y: number }

function visibleViewport(): ChatPanelViewport {
  const vv = window.visualViewport
  return { x: vv?.offsetLeft ?? 0, y: vv?.offsetTop ?? 0, width: vv?.width ?? window.innerWidth, height: vv?.height ?? window.innerHeight }
}

function storageKey() { return `${STORAGE_KEY}.${window.innerWidth >= 1024 ? 'desktop' : 'mobile'}` }

/** `phone`: the panel is a pinned bottom drawer (no drag, no resize, nothing saved). */
export function useChatPanel(phone = false) {
  const [viewport, setViewport] = useState<ChatPanelViewport>({ x: 0, y: 0, width: 390, height: 844 })
  const [preferred, setPreferred] = useState<ChatPanelRect | null>(null)
  const [gestureKind, setGestureKind] = useState<Gesture['kind'] | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const latest = useRef<ChatPanelRect | null>(null)
  const activeKey = useRef('')

  useEffect(() => {
    const sync = () => {
      setViewport(visibleViewport())
      const key = storageKey()
      if (activeKey.current !== key) {
        activeKey.current = key
        let saved: ChatPanelRect | null = null
        try { saved = readChatPanel(window.localStorage.getItem(key)) } catch { /* blocked storage */ }
        latest.current = saved
        setPreferred(saved)
      }
    }
    sync()
    window.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('scroll', sync)
    return () => {
      window.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('scroll', sync)
    }
  }, [])

  const rect = phone ? phoneChatPanel(viewport) : fitChatPanel(preferred ?? defaultChatPanel(viewport, viewport.width >= 1024), viewport)

  function save(next: ChatPanelRect) {
    latest.current = next
    setPreferred(next)
    try { window.localStorage.setItem(storageKey(), JSON.stringify(next)) } catch { /* keep session position */ }
  }

  function place(launcher?: DOMRect) {
    const bounds = visibleViewport()
    setViewport(bounds)
    if (phone) return
    // Opening again preserves the owner's chosen size and position.
    if (!latest.current) {
      const next = defaultChatPanel(bounds, window.innerWidth >= 1024, launcher)
      latest.current = next
      setPreferred(next)
    }
  }

  function start(event: PointerEvent<HTMLElement>, kind: Gesture['kind']) {
    if (phone) return
    if (gesture.current) return // A second finger must not replace an active drag.
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (kind === 'move' && (event.target as Element).closest('button, a, [role="menuitem"]')) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { id: event.pointerId, kind, start: rect, preferred: latest.current ?? rect, x: event.clientX, y: event.clientY }
    latest.current = rect
    setGestureKind(kind)
  }

  function move(event: PointerEvent<HTMLElement>) {
    const g = gesture.current
    if (!g || g.id !== event.pointerId) return
    const bounds = visibleViewport()
    const dx = event.clientX - g.x
    const dy = event.clientY - g.y
    const next = g.kind === 'move'
      ? fitChatPanel({ ...g.start, x: g.start.x + dx, y: g.start.y + dy }, bounds)
      : resizeChatPanel(g.start, dx, dy, g.kind, bounds)
    latest.current = next
    setPreferred(next)
  }

  function end(event: PointerEvent<HTMLElement>) {
    const g = gesture.current
    if (!g || g.id !== event.pointerId) return
    gesture.current = null
    setGestureKind(null)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (event.type === 'pointercancel') {
      latest.current = g.preferred
      setPreferred(g.preferred)
    } else if (latest.current) save(latest.current)
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>, kind: Gesture['kind']) {
    if (phone) return
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
    if (kind === 'move' && event.target !== event.currentTarget) return
    event.preventDefault()
    const step = event.shiftKey ? 32 : 12
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
    save(kind === 'move' ? fitChatPanel({ ...rect, x: rect.x + dx, y: rect.y + dy }, viewport) : resizeChatPanel(rect, dx, dy, kind, viewport))
  }

  const handlers = (kind: Gesture['kind']) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => start(event, kind),
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => onKeyDown(event, kind),
  })

  return { rect, place, handlers, gestureKind }
}
