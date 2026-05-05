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
    const barCount = Math.max(48, Math.floor(width / 6))
    const barWidth = width / barCount - 1
    const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null

    function draw() {
      if (!ctx) return
      ctx.clearRect(0, 0, width, height)
      if (isRecording && analyser && dataArray) {
        analyser.getByteTimeDomainData(dataArray)
      }
      const step = dataArray ? Math.floor(dataArray.length / barCount) : 1
      for (let i = 0; i < barCount; i++) {
        const value = dataArray && isRecording ? dataArray[i * step] : 128
        const amplitude = Math.abs(value - 128) / 128
        const barHeight = Math.max(4, amplitude * height * 0.9)
        const x = i * (barWidth + 1)
        const y = (height - barHeight) / 2
        ctx.fillStyle = isRecording ? 'hsl(0, 84%, 60%)' : 'hsl(0, 0%, 70%)'
        ctx.fillRect(x, y, barWidth, barHeight)
      }
      animFrameRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [analyser, isRecording, width, height])

  return (
    <div ref={containerRef} className="w-full" data-testid="waveform-container">
      <canvas
        ref={canvasRef}
        className="w-full rounded-md"
        style={{ imageRendering: 'pixelated', height }}
      />
    </div>
  )
}
