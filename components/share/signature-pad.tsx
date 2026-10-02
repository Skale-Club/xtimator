'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/lib/i18n/use-translation'
import {
  PEN_WIDTH_CSS,
  SIGNATURE_EXPORT_HEIGHT,
  SIGNATURE_EXPORT_WIDTH,
  clientToCanvasPoint,
  computeBitmapSize,
  computeExportLayout,
  fitTransform,
  strokesBounds,
  transformStrokes,
  type Stroke,
} from '@/components/share/signature-geometry'

interface SignaturePadProps {
  signerName: string
  onSignerNameChange: (name: string) => void
  signerEmail: string
  onSignerEmailChange: (email: string) => void
  onSignatureChange: (dataUrl: string | null) => void
  brandColor?: string
}

/**
 * Render the strokes into a fresh, fixed-size (600x160, 3.75:1) PNG. The
 * signature is scaled uniformly to fit that frame, so the stored image has the
 * same aspect as the PDF signature box (150x40pt) on every device and is never
 * distorted, whatever size/shape the on-screen canvas was.
 */
function exportSignature(strokes: Stroke[]): string | null {
  const bounds = strokesBounds(strokes)
  if (!bounds) return null
  const out = document.createElement('canvas')
  out.width = SIGNATURE_EXPORT_WIDTH
  out.height = SIGNATURE_EXPORT_HEIGHT
  const ctx = out.getContext('2d')
  if (!ctx) return null
  const layout = computeExportLayout(bounds)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.strokeStyle = '#111827'
  ctx.lineWidth = layout.lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setTransform(layout.scale, 0, 0, layout.scale, layout.offsetX, layout.offsetY)
  // setTransform scales the pen too; divide so the on-image width is lineWidth.
  ctx.lineWidth = layout.lineWidth / layout.scale
  for (const stroke of strokes) {
    if (stroke.length < 2) continue
    ctx.beginPath()
    ctx.moveTo(stroke[0].x, stroke[0].y)
    for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y)
    ctx.stroke()
  }
  return out.toDataURL('image/png')
}

export function SignaturePad({
  signerName,
  onSignerNameChange,
  signerEmail,
  onSignerEmailChange,
  onSignatureChange,
  brandColor = '#2563eb',
}: SignaturePadProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isEmpty, setIsEmpty] = useState(true)
  // Strokes are kept in logical CSS-pixel coordinates of the CURRENT displayed
  // canvas box. They are the source of truth: the bitmap can be rebuilt from
  // them at any size/DPR, and the exported PNG is rendered from them.
  const strokesRef = useRef<Stroke[]>([])
  const activeStroke = useRef<Stroke | null>(null)
  const activePointerId = useRef<number | null>(null)
  // Logical (CSS px) size the bitmap was last built for.
  const sizeRef = useRef({ width: 0, height: 0 })

  const onSignatureChangeRef = useRef(onSignatureChange)
  useEffect(() => {
    onSignatureChangeRef.current = onSignatureChange
  }, [onSignatureChange])

  const paintStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (stroke.length < 2) return
    ctx.beginPath()
    ctx.moveTo(stroke[0].x, stroke[0].y)
    for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y)
    ctx.stroke()
  }, [])

  const repaint = useCallback(
    (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const { width, height } = sizeRef.current
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.strokeStyle = '#111827'
      ctx.lineWidth = PEN_WIDTH_CSS
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (const stroke of strokesRef.current) paintStroke(ctx, stroke)
    },
    [paintStroke]
  )

  // Size the bitmap from the DISPLAYED size x devicePixelRatio (on mount and on
  // every resize), then scale the context by DPR so all drawing and pointer
  // math happens in CSS pixels. The old fixed 600x160 bitmap was shown at
  // w-full x 120px, i.e. stretched ~35% horizontally on a phone.
  //
  // Resize policy: PRESERVE. If the user already signed, the stored strokes are
  // re-fit into the new box with one uniform scale (no stretching, centered)
  // and redrawn, rather than wiping a signature the user just finished or
  // keeping a stale bitmap that no longer matches the box. Setting canvas.width
  // clears the bitmap, so the redraw is always required anyway.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const sync = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (width === 0 || height === 0) return
      const bitmap = computeBitmapSize(width, height, window.devicePixelRatio || 1)
      const prev = sizeRef.current
      const sizeChanged = prev.width !== width || prev.height !== height
      if (!sizeChanged && canvas.width === bitmap.width && canvas.height === bitmap.height) return

      if (sizeChanged && prev.width > 0 && strokesRef.current.length > 0) {
        strokesRef.current = transformStrokes(
          strokesRef.current,
          fitTransform(prev, { width, height })
        )
      }
      sizeRef.current = { width, height }
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.setTransform(bitmap.dpr, 0, 0, bitmap.dpr, 0, 0)
      repaint(canvas)
    }

    sync()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(sync)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [repaint])

  function pointFromEvent(canvas: HTMLCanvasElement, e: React.PointerEvent<HTMLCanvasElement>) {
    return clientToCanvasPoint(
      e.clientX,
      e.clientY,
      canvas.getBoundingClientRect(),
      sizeRef.current.width,
      sizeRef.current.height
    )
  }

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointerId.current !== null) return // ignore a second finger
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()
    try {
      canvas.setPointerCapture(e.pointerId)
    } catch {
      // not fatal — move/up still arrive while the pointer stays over the canvas
    }
    activePointerId.current = e.pointerId
    activeStroke.current = [pointFromEvent(canvas, e)]
  }

  function draw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointerId.current !== e.pointerId) return
    const canvas = canvasRef.current
    const stroke = activeStroke.current
    if (!canvas || !stroke) return
    e.preventDefault()
    const point = pointFromEvent(canvas, e)
    const last = stroke[stroke.length - 1]
    stroke.push(point)
    // Register the stroke on its first segment so a bare tap leaves no mark.
    if (stroke.length === 2) {
      strokesRef.current.push(stroke)
      setIsEmpty(false)
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
  }

  function endDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointerId.current !== e.pointerId) return
    const canvas = canvasRef.current
    const stroke = activeStroke.current
    activePointerId.current = null
    activeStroke.current = null
    if (!canvas || !stroke || stroke.length < 2) return
    onSignatureChangeRef.current(exportSignature(strokesRef.current))
  }

  function clearSignature() {
    const canvas = canvasRef.current
    strokesRef.current = []
    activeStroke.current = null
    activePointerId.current = null
    if (canvas) repaint(canvas)
    setIsEmpty(true)
    onSignatureChange(null)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signer-name">{t('Your full name')}</Label>
        <Input
          id="signer-name"
          placeholder="John Smith"
          value={signerName}
          onChange={(e) => onSignerNameChange(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="signer-email">{t('Email (optional)')}</Label>
        <Input
          type="email"
          id="signer-email"
          placeholder="john@example.com"
          value={signerEmail}
          onChange={(e) => onSignerEmailChange(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{t('Signature')}</Label>
          {!isEmpty && (
            <button
              type="button"
              onClick={clearSignature}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {t('Clear')}
            </button>
          )}
        </div>
        <div
          className="rounded-[var(--radius-md)] border-2 border-dashed overflow-hidden bg-white"
          style={{ borderColor: isEmpty ? 'hsl(var(--border))' : brandColor }}
        >
          <canvas
            ref={canvasRef}
            // Displayed size is CSS-only (the effect above sizes the bitmap to
            // match). h-40 = 160px: comfortable for a finger on phones and
            // still >= 140px on desktop.
            className="block h-40 w-full touch-none cursor-crosshair"
            onPointerDown={startDraw}
            onPointerMove={draw}
            onPointerUp={endDraw}
            onPointerCancel={endDraw}
          />
        </div>
        {isEmpty && (
          <p className="text-xs text-muted-foreground">
            {t('Draw your signature above using your finger or mouse.')}
          </p>
        )}
      </div>
    </div>
  )
}
