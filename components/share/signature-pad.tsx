'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/lib/i18n/use-translation'

interface SignaturePadProps {
  signerName: string
  onSignerNameChange: (name: string) => void
  signerEmail: string
  onSignerEmailChange: (email: string) => void
  onSignatureChange: (dataUrl: string | null) => void
  brandColor?: string
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
  const [isDrawing, setIsDrawing] = useState(false)
  const [isEmpty, setIsEmpty] = useState(true)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  function getPos(canvas: HTMLCanvasElement, e: MouseEvent | Touch) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()
    setIsDrawing(true)
    const point = 'touches' in e
      ? getPos(canvas, e.nativeEvent.touches[0])
      : getPos(canvas, e.nativeEvent as MouseEvent)
    lastPos.current = point
  }, [])

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()
    const ctx = canvas.getContext('2d')
    if (!ctx || !lastPos.current) return

    const point = 'touches' in e
      ? getPos(canvas, e.nativeEvent.touches[0])
      : getPos(canvas, e.nativeEvent as MouseEvent)

    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    lastPos.current = point
    setIsEmpty(false)
  }, [isDrawing])

  const endDraw = useCallback(() => {
    if (!isDrawing) return
    setIsDrawing(false)
    lastPos.current = null
    const canvas = canvasRef.current
    if (!canvas) return
    onSignatureChange(canvas.toDataURL('image/png'))
  }, [isDrawing, onSignatureChange])

  function clearSignature() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
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
            width={600}
            height={160}
            className="w-full touch-none cursor-crosshair"
            style={{ height: '120px' }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
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
