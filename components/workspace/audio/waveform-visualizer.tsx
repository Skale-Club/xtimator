'use client'

import { useRef, useEffect, useState } from 'react'
import {
  rmsFromTimeDomain,
  normalizeAmplitude,
  pushBar,
  BAR_WIDTH,
  BAR_GAP,
  BAR_INTERVAL_MS,
  MIN_BAR,
} from '@/lib/audio/waveform-history'

interface WaveformVisualizerProps {
  analyser: AnalyserNode | null
  isRecording: boolean
  /** Optional pixel height; defaults to 96 (matches existing usage) */
  height?: number
}

// Oldest visible bar fades to this alpha; newest bar is always fully opaque.
const MIN_BAR_ALPHA = 0.35

/**
 * 260707-shg — modern scrolling amplitude-history waveform (iOS Voice Memos /
 * WhatsApp style): rounded bars scroll right-to-left as amplitude is sampled,
 * instead of redrawing a raw oscilloscope line every frame.
 *
 * Public API is UNCHANGED from the previous oscilloscope implementation —
 * all consumers (VoiceRecorder sm/md/lg, capture-recorder's popup overlay)
 * keep working with zero prop changes.
 */
export function WaveformVisualizer({ analyser, isRecording, height = 96 }: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animFrameRef = useRef<number>(0)
  const [width, setWidth] = useState(300)

  // Amplitude history — newest bar is the LAST array element. Lives in a ref
  // (not state) so the render loop can mutate it every frame without
  // triggering React re-renders; values are raw 0..1 rms (normalized to
  // pixels at DRAW time, so resizing the canvas doesn't distort history).
  const bufferRef = useRef<number[]>([])
  // The AnalyserNode INSTANCE last seen — only a new instance (fresh
  // `startRecording()` call, per capture-recorder/voice-recorder) resets the
  // buffer. Toggling isRecording (pause/resume) reuses the same instance, so
  // the freeze-on-pause history survives.
  const analyserInstanceRef = useRef<AnalyserNode | null>(null)
  // Accumulates the PEAK rms seen since the last committed bar, and the
  // recording time (ms) elapsed since that commit. Both live in refs so a
  // pause/resume cycle (which tears down and recreates the draw effect
  // below) picks up the in-progress window where it left off, rather than
  // losing the partial sample.
  const peakRmsRef = useRef(0)
  const accumMsRef = useRef(0)

  // Observe container width
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width))
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Reset history ONLY when the analyser instance changes (new take). This
  // must be a separate effect from the draw loop below — the draw loop also
  // depends on `isRecording`, which changes on every pause/resume and must
  // NOT clear the buffer.
  useEffect(() => {
    if (analyser !== analyserInstanceRef.current) {
      analyserInstanceRef.current = analyser
      bufferRef.current = []
      peakRmsRef.current = 0
      accumMsRef.current = 0
    }
  }, [analyser])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Nested functions below (paintBars/paintIdleLine/tick) close over this
    // narrowed const rather than `ctx` directly — TS doesn't retain the
    // `!ctx` narrowing across a closure boundary.
    const context = ctx

    canvas.width = width
    canvas.height = height

    const maxBars = Math.max(Math.floor(width / (BAR_WIDTH + BAR_GAP)), 1)
    // Drop overflow from a previous, wider layout so pushBar's own trimming
    // stays in sync with the current canvas size.
    if (bufferRef.current.length > maxBars) {
      bufferRef.current = bufferRef.current.slice(bufferRef.current.length - maxBars)
    }

    // CSS vars don't change between frames — read them ONCE per effect run
    // instead of calling getComputedStyle 3× on every animation frame (~180
    // style reads/sec at 60fps). Fall back to literals for test envs where
    // CSS variables aren't loaded.
    const readVar = (name: string, fallback: string): string => {
      const v = getComputedStyle(canvas).getPropertyValue(name).trim()
      return v.length > 0 ? v : fallback
    }
    const primary = readVar('--primary', '224 86% 60%')
    const secondary = readVar('--secondary', '200 95% 55%')
    const mutedFg = readVar('--muted-foreground', '215 16% 47%')

    // Brand gradient depends only on the colors + height — build it once too.
    const grad = context.createLinearGradient(0, 0, 0, height)
    grad.addColorStop(0, `hsl(${primary})`)
    grad.addColorStop(1, `hsl(${secondary})`)

    const halfHeight = height / 2
    const step = BAR_WIDTH + BAR_GAP

    const withRoundRect = context as CanvasRenderingContext2D & {
      roundRect?: (x: number, y: number, w: number, h: number, radii: number) => void
    }

    // Flat brand-gradient bars, right-aligned (newest bar flush against the
    // right edge), fading toward MIN_BAR_ALPHA as bars age — no shadowBlur.
    function paintBars(buffer: number[]) {
      context.clearRect(0, 0, width, height)
      const count = buffer.length
      context.fillStyle = grad
      for (let i = 0; i < count; i++) {
        const barHeight = normalizeAmplitude(buffer[i], halfHeight, MIN_BAR)
        const ageIndex = count - 1 - i // 0 = newest
        const ageFrac = maxBars > 1 ? Math.min(ageIndex / (maxBars - 1), 1) : 0
        const x = width - BAR_WIDTH - ageIndex * step
        if (x + BAR_WIDTH < 0) continue // fully scrolled off-screen
        const y = (height - barHeight) / 2
        const r = Math.min(BAR_WIDTH / 2, barHeight / 2)
        context.globalAlpha = 1 - ageFrac * (1 - MIN_BAR_ALPHA)
        context.beginPath()
        if (withRoundRect.roundRect) {
          withRoundRect.roundRect(x, y, BAR_WIDTH, barHeight, r)
        } else {
          context.rect(x, y, BAR_WIDTH, barHeight)
        }
        context.fill()
      }
      context.globalAlpha = 1
    }

    // Idle (never recorded / analyser cleared with no history): a quiet
    // center line with a very subtle breathing fade — replaces the old
    // per-bar sine idle animation, which read as busy/dated.
    function paintIdleLine(now: number) {
      context.clearRect(0, 0, width, height)
      const phase = now / 2200
      const alpha = 0.22 + ((Math.sin(phase) + 1) / 2) * 0.13 // 0.22..0.35
      context.strokeStyle = `hsl(${mutedFg} / ${alpha})`
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(0, halfHeight)
      context.lineTo(width, halfHeight)
      context.stroke()
    }

    if (isRecording && analyser) {
      const activeAnalyser = analyser
      const dataArray = new Uint8Array(activeAnalyser.frequencyBinCount)
      let lastTime: number | null = null

      const tick = () => {
        const now = performance.now()
        const delta = lastTime === null ? 0 : now - lastTime
        lastTime = now

        activeAnalyser.getByteTimeDomainData(dataArray)
        const rms = rmsFromTimeDomain(dataArray)
        peakRmsRef.current = Math.max(peakRmsRef.current, rms)
        accumMsRef.current += delta

        if (accumMsRef.current >= BAR_INTERVAL_MS) {
          bufferRef.current = pushBar(bufferRef.current, peakRmsRef.current, maxBars)
          peakRmsRef.current = 0
          accumMsRef.current = 0
        }

        paintBars(bufferRef.current)
        animFrameRef.current = requestAnimationFrame(tick)
      }
      animFrameRef.current = requestAnimationFrame(tick)
    } else if (bufferRef.current.length > 0) {
      // Freeze-on-pause: paint the existing history once and stop — no rAF
      // loop, no new samples, buffer left untouched.
      paintBars(bufferRef.current)
    } else {
      const idleTick = () => {
        paintIdleLine(performance.now())
        animFrameRef.current = requestAnimationFrame(idleTick)
      }
      animFrameRef.current = requestAnimationFrame(idleTick)
    }

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
