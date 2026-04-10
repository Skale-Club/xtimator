'use client'

import { useRef, useEffect } from 'react'

interface WaveformVisualizerProps {
  analyser: AnalyserNode | null
  isRecording: boolean
}

export function WaveformVisualizer({ analyser, isRecording }: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas resolution to match display size
    const width = 300
    const height = 96
    canvas.width = width
    canvas.height = height

    const barCount = 64
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
        // Get value: 128 is silence, 0 and 255 are peaks
        const value = dataArray && isRecording
          ? dataArray[i * step]
          : 128

        // Map value to bar height: silence = small bar, peak = full height
        const amplitude = Math.abs(value - 128) / 128
        const barHeight = Math.max(4, amplitude * height * 0.9)

        const x = i * (barWidth + 1)
        const y = (height - barHeight) / 2

        ctx.fillStyle = isRecording
          ? 'hsl(0, 84%, 60%)'
          : 'hsl(0, 0%, 70%)'
        ctx.fillRect(x, y, barWidth, barHeight)
      }

      animFrameRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [analyser, isRecording])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-24 rounded-md"
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
