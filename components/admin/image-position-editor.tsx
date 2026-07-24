'use client'

import { useCallback, useRef, useState } from 'react'
import { ZoomIn, RotateCcw } from 'lucide-react'
import { Slider } from '@/components/ui/slider'

export type ImagePosition = { scale: number; x: number; y: number }

export const DEFAULT_IMAGE_POSITION: ImagePosition = { scale: 1, x: 0, y: 0 }

const MIN_SCALE = 1
const MAX_SCALE = 3

interface ImagePositionEditorProps {
  src: string
  alt: string
  /** width / height, e.g. 1 for square, 3 for a 3:1 landscape card */
  aspectRatio: number
  value: ImagePosition | null
  onChange: (value: ImagePosition) => void
  shape?: 'rect' | 'circle'
  /**
   * 'cover' (default): image always fills the frame — zoom multiplies on top
   * of that baseline and pan moves the object-position focal point, so
   * dragging never reveals a gap. Use for photos placed into a fixed card.
   * 'contain': image is never cropped — zoom/pan are a plain translate+scale
   * transform, so panning far enough CAN reveal empty space around the
   * image. Use for uncropped subject cutouts (e.g. the How It Works person
   * renders), matching their existing object-contain/object-top rendering.
   */
  fit?: 'cover' | 'contain'
  /** Base object-position anchor for 'contain' mode, matching the public render's baseline. */
  containAnchor?: 'center' | 'bottom' | 'top'
  className?: string
}

export function ImagePositionEditor({
  src,
  alt,
  aspectRatio,
  value,
  onChange,
  shape = 'rect',
  fit = 'cover',
  containAnchor = 'center',
  className = '',
}: ImagePositionEditorProps) {
  const position = value ?? DEFAULT_IMAGE_POSITION
  const containerRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: position.x, origY: position.y }
    setDragging(true)
  }, [position.x, position.y])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const dxPct = ((e.clientX - dragState.current.startX) / rect.width) * 100
    const dyPct = ((e.clientY - dragState.current.startY) / rect.height) * 100
    const nextX = Math.max(-50, Math.min(50, dragState.current.origX + dxPct))
    const nextY = Math.max(-50, Math.min(50, dragState.current.origY + dyPct))
    onChange({ ...position, x: nextX, y: nextY })
  }, [onChange, position])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    dragState.current = null
    setDragging(false)
  }, [])

  function handleReset() {
    onChange(DEFAULT_IMAGE_POSITION)
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div
        ref={containerRef}
        role="slider"
        aria-label={`Drag to reposition ${alt}`}
        aria-valuenow={Math.round(position.x)}
        aria-valuemin={-50}
        aria-valuemax={50}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`relative w-full overflow-hidden border border-border bg-muted/30 select-none touch-none ${
          shape === 'circle' ? 'rounded-full' : 'rounded-xl'
        } ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ aspectRatio }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className={`pointer-events-none h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
          style={
            fit === 'cover'
              ? {
                  objectPosition: `${50 + position.x}% ${50 + position.y}%`,
                  transform: `scale(${position.scale})`,
                  transformOrigin: 'center center',
                }
              : {
                  objectPosition: containAnchor === 'center' ? undefined : `50% ${containAnchor}`,
                  transform: `translate(${position.x}%, ${position.y}%) scale(${position.scale})`,
                  transformOrigin: 'center center',
                }
          }
        />
      </div>
      <div className="flex items-center gap-3">
        <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <Slider
          min={MIN_SCALE}
          max={MAX_SCALE}
          step={0.05}
          value={[position.scale]}
          onValueChange={([scale]) => onChange({ ...position, scale })}
          aria-label={`Zoom ${alt}`}
          className="flex-1"
        />
        <button
          type="button"
          onClick={handleReset}
          aria-label="Reset image position and zoom"
          title="Reset position and zoom"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
