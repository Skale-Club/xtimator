'use client'
import * as React from 'react'

interface CircularProgressRingProps {
  progress: number       // 0..1
  size?: number          // px (default 240)
  strokeWidth?: number   // px (default 8)
  colorClass: string     // e.g. 'stroke-primary' | 'stroke-amber-500' | 'stroke-red-500'
  children: React.ReactNode
}

export function CircularProgressRing({
  progress, size = 240, strokeWidth = 8, colorClass, children,
}: CircularProgressRingProps) {
  const clamped = Math.min(Math.max(progress, 0), 1)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped)

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`${colorClass} transition-[stroke-dashoffset,stroke] duration-300`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  )
}
