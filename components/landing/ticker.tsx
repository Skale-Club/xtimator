'use client'

import { useRef } from 'react'
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
 */
export function Ticker({ halfWidth, speed = 38, className = '', children }: TickerProps) {
  const reduce = useReducedMotion()
  const x = useMotionValue(0)
  const isHoveredRef = useRef(false)
  const isDraggingRef = useRef(false)
  const pointerStartXRef = useRef(0)
  const motionStartXRef = useRef(0)

  useAnimationFrame((_, delta) => {
    if (reduce || isHoveredRef.current || isDraggingRef.current) return
    let next = x.get() - speed * (delta / 1000)
    if (next <= -halfWidth) next += halfWidth
    x.set(next)
  })

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    isDraggingRef.current = true
    pointerStartXRef.current = e.clientX
    motionStartXRef.current = x.get()
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return
    const delta = e.clientX - pointerStartXRef.current
    let next = motionStartXRef.current + delta
    // Clamp to valid loop range (-halfWidth, 0]
    next = next % halfWidth
    if (next > 0) next -= halfWidth
    x.set(next)
  }

  function onPointerUp() {
    isDraggingRef.current = false
  }

  return (
    <div
      className={`relative overflow-hidden cursor-grab active:cursor-grabbing touch-pan-y ${className}`}
      onMouseEnter={() => { isHoveredRef.current = true }}
      onMouseLeave={() => { isHoveredRef.current = false }}
    >
      {/* Edge fade masks */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[hsl(var(--background))] to-transparent sm:w-24" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[hsl(var(--background))] to-transparent sm:w-24" />

      <motion.div
        className="inline-flex select-none"
        style={{ x }}
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
