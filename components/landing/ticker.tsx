'use client'

import { useRef, useEffect } from 'react'
import { motion, useMotionValue, useAnimationFrame, useReducedMotion } from 'framer-motion'

interface TickerProps {
  /** Width in px of one full set of items — the loop resets here. */
  halfWidth: number
  /** Scroll speed in pixels per second. */
  speed?: number
  className?: string
  children: React.ReactNode
}

/**
 * Infinite auto-scrolling ticker with:
 *  - Pause on hover (mouse)
 *  - Drag to scrub in either direction (mouse + touch via Pointer Events)
 *  - Seamless loop: when x reaches -halfWidth it wraps to 0
 *  - Respects prefers-reduced-motion (stops animating, content still visible)
 *
 * Mobile smoothness: pointer capture is deferred until horizontal intent is
 * confirmed (dx > dy). A non-passive touchmove listener calls preventDefault()
 * only during confirmed horizontal drags, preventing page-scroll jitter.
 */
export function Ticker({ halfWidth, speed = 38, className = '', children }: TickerProps) {
  const reduce = useReducedMotion()
  const x = useMotionValue(0)
  const isHoveredRef = useRef(false)
  const isDraggingRef = useRef(false)
  const dragDirectionRef = useRef<'h' | 'v' | null>(null)
  const pointerStartXRef = useRef(0)
  const pointerStartYRef = useRef(0)
  const motionStartXRef = useRef(0)
  const velocityRef = useRef(0)
  const lastXRef = useRef(0)
  const lastTimeRef = useRef(0)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Map any number into the loop range (-halfWidth, 0].
  const wrap = (n: number) => {
    const m = ((n % halfWidth) + halfWidth) % halfWidth
    return m > 0 ? m - halfWidth : 0
  }

  // Non-passive touchmove listener — the only way to call preventDefault() on
  // touch events (React's synthetic events are passive by default).
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const onTouchMove = (e: TouchEvent) => {
      if (isDraggingRef.current && dragDirectionRef.current === 'h') e.preventDefault()
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [])

  useAnimationFrame((_, delta) => {
    if (reduce) return
    if (isDraggingRef.current) return

    const dt = delta / 1000
    let v: number

    if (Math.abs(velocityRef.current) > 8) {
      v = velocityRef.current
      velocityRef.current *= Math.pow(0.94, delta / 16.67)
      if (Math.abs(velocityRef.current) <= 8) velocityRef.current = 0
    } else {
      if (isHoveredRef.current) return
      velocityRef.current = 0
      v = -speed
    }

    x.set(wrap(x.get() + v * dt))
  })

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    isDraggingRef.current = true
    dragDirectionRef.current = null
    pointerStartXRef.current = e.clientX
    pointerStartYRef.current = e.clientY
    motionStartXRef.current = x.get()
    velocityRef.current = 0
    lastXRef.current = e.clientX
    lastTimeRef.current = e.timeStamp
    // Pointer capture is deferred to onPointerMove after horizontal intent is confirmed.
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return

    // Determine drag direction on the first significant movement.
    if (dragDirectionRef.current === null) {
      const dx = Math.abs(e.clientX - pointerStartXRef.current)
      const dy = Math.abs(e.clientY - pointerStartYRef.current)
      if (dx < 4 && dy < 4) return
      dragDirectionRef.current = dx >= dy ? 'h' : 'v'
      if (dragDirectionRef.current === 'h') {
        e.currentTarget.setPointerCapture(e.pointerId)
      } else {
        isDraggingRef.current = false
        return
      }
    }

    if (dragDirectionRef.current !== 'h') return

    const dtMove = e.timeStamp - lastTimeRef.current
    if (dtMove > 0) {
      const vRaw = ((e.clientX - lastXRef.current) / dtMove) * 1000
      velocityRef.current = Math.max(-4000, Math.min(4000, vRaw))
    }
    lastXRef.current = e.clientX
    lastTimeRef.current = e.timeStamp

    x.set(wrap(motionStartXRef.current + (e.clientX - pointerStartXRef.current)))
  }

  function onPointerUp() {
    isDraggingRef.current = false
  }

  return (
    <div
      ref={wrapperRef}
      className={`relative overflow-hidden cursor-grab active:cursor-grabbing select-none ${className}`}
      onMouseEnter={() => { isHoveredRef.current = true }}
      onMouseLeave={() => { isHoveredRef.current = false }}
    >
      {/* Edge fade masks */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[hsl(var(--background))] to-transparent sm:w-24" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[hsl(var(--background))] to-transparent sm:w-24" />

      <motion.div
        className="inline-flex will-change-transform transform-gpu"
        style={{ x, touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </motion.div>
    </div>
  )
}
