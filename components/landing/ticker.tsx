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
  const velocityRef = useRef(0)
  const lastXRef = useRef(0)
  const lastTimeRef = useRef(0)

  // Map any number into the loop range (-halfWidth, 0].
  const wrap = (n: number) => {
    const m = ((n % halfWidth) + halfWidth) % halfWidth
    return m > 0 ? m - halfWidth : 0
  }

  useAnimationFrame((_, delta) => {
    if (reduce) return
    // While dragging, position is driven by pointermove.
    if (isDraggingRef.current) return

    const dt = delta / 1000
    let v: number

    if (Math.abs(velocityRef.current) > 8) {
      // Inertia mode: glide using the captured release velocity, then decay.
      v = velocityRef.current
      velocityRef.current *= Math.pow(0.94, delta / 16.67)
      if (Math.abs(velocityRef.current) <= 8) velocityRef.current = 0
    } else {
      // Auto-scroll mode.
      if (isHoveredRef.current) return
      velocityRef.current = 0
      v = -speed
    }

    x.set(wrap(x.get() + v * dt))
  })

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    isDraggingRef.current = true
    pointerStartXRef.current = e.clientX
    motionStartXRef.current = x.get()
    velocityRef.current = 0
    lastXRef.current = e.clientX
    lastTimeRef.current = e.timeStamp
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return

    const dtMove = e.timeStamp - lastTimeRef.current
    if (dtMove > 0) {
      const vRaw = ((e.clientX - lastXRef.current) / dtMove) * 1000
      velocityRef.current = Math.max(-4000, Math.min(4000, vRaw))
    }
    lastXRef.current = e.clientX
    lastTimeRef.current = e.timeStamp

    // 1:1 scrub.
    x.set(wrap(motionStartXRef.current + (e.clientX - pointerStartXRef.current)))
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
        className="inline-flex select-none will-change-transform transform-gpu"
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
