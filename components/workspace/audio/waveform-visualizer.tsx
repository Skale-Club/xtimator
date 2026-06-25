'use client'

import { useRef, useEffect, useState } from 'react'

interface WaveformVisualizerProps {
  analyser: AnalyserNode | null
  isRecording: boolean
  /** Optional pixel height; defaults to 96 (matches existing usage) */
  height?: number
}

export function WaveformVisualizer({ analyser, isRecording, height = 96 }: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animFrameRef = useRef<number>(0)
  const [width, setWidth] = useState(300)

  // Observe container width
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width))
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = width
    canvas.height = height
    const barCount = Math.max(Math.floor(width / 6), 1)
    const barWidth = Math.max(0, width / barCount - 1)
    const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null

    // CSS vars don't change between frames — read them ONCE per effect run
    // instead of calling getComputedStyle 3× on every animation frame (~180
    // style reads/sec at 60fps). Fall back to literals for test envs where CSS
    // variables aren't loaded.
    const readVar = (name: string, fallback: string): string => {
      const v = getComputedStyle(canvas).getPropertyValue(name).trim()
      return v.length > 0 ? v : fallback
    }
    const primary = readVar('--primary', '224 86% 60%')
    const secondary = readVar('--secondary', '200 95% 55%')
    const mutedFg = readVar('--muted-foreground', '215 16% 47%')

    // Brand gradient depends only on the colors + height — build it once too.
    const grad = ctx.createLinearGradient(0, 0, 0, height)
    grad.addColorStop(0, `hsl(${primary})`)
    grad.addColorStop(1, `hsl(${secondary})`)

    function draw() {
      if (!ctx || !canvas) return
      ctx.clearRect(0, 0, width, height)

      if (isRecording && analyser && dataArray) {
        analyser.getByteTimeDomainData(dataArray)
      }
      const step = dataArray ? Math.floor(dataArray.length / barCount) : 1
      const now = performance.now()

      if (isRecording) {
        ctx.shadowColor = `hsl(${primary} / 0.5)`
        ctx.shadowBlur = 8
        ctx.fillStyle = grad
      } else {
        ctx.shadowBlur = 0
        ctx.fillStyle = `hsl(${mutedFg} / 0.35)`
      }

      for (let i = 0; i < barCount; i++) {
        let barHeight: number
        if (isRecording && dataArray) {
          const value = dataArray[i * step]
          const amplitude = Math.abs(value - 128) / 128
          barHeight = Math.max(3, amplitude * height * 0.9)
        } else {
          // Soft idle animation — gentle per-bar sine
          const phase = (now / 600) + i * 0.18
          const idleAmp = ((Math.sin(phase) + 1) / 2) * 6 + 3
          barHeight = idleAmp
        }
        const x = i * (barWidth + 1)
        const y = (height - barHeight) / 2
        const r = Math.min(2, barWidth / 2)
        ctx.beginPath()
        // roundRect is supported in all modern browsers (iOS Safari 16+).
        ;(ctx as CanvasRenderingContext2D & { roundRect?: (x: number, y: number, w: number, h: number, radii: number) => void }).roundRect?.(x, y, barWidth, barHeight, r)
        // Fallback path for environments without roundRect: a plain rect
        if (!(ctx as unknown as { roundRect?: unknown }).roundRect) {
          ctx.rect(x, y, barWidth, barHeight)
        }
        ctx.fill()
      }

      // Reset shadow for next frame's idle pass safety
      ctx.shadowBlur = 0
      animFrameRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [analyser, isRecording, width, height])

  return (
    <div ref={containerRef} className="relative overflow-hidden w-full" data-testid="waveform-container">
      <canvas
        ref={canvasRef}
        className="w-full rounded-md"
        style={{ imageRendering: 'pixelated', height }}
      />
    </div>
  )
}
