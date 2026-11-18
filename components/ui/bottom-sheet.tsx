'use client'

// One bottom sheet for the whole app: a Radix dialog that is a sheet pinned to
// the bottom on phones (< sm) and a centred card from sm up, with a grab handle
// that really drags. Pull the handle (or any element marked data-sheet-drag,
// usually the header) down and the sheet follows the finger; let go past ~30%
// of its height, or flick it down, and it closes. Otherwise it springs back.
//
// The drag closes through a hidden Radix Close button, so it goes through the
// caller's onOpenChange exactly like the X or Escape: a caller that refuses to
// close (a pending save, a confirm step) keeps the sheet, which springs back.
//
// No dependency: vaul (the usual choice) is marked unmaintained. Plain pointer
// events; the sheet moves with an inline transform, which stacks with the
// Tailwind `translate` property the layout classes use.

import * as React from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { DialogContent } from '@/components/ui/dialog'

/** Surface shared by every bottom sheet (no glass: blur inside a tall
 *  scrolling surface froze phones). */
export const BOTTOM_SHEET_SURFACE =
  'flex flex-col gap-0 overflow-hidden border-border bg-background p-0 backdrop-blur-none'

/** Phones: full width, pinned to the bottom, square bottom corners, safe area,
 *  slides up on open. */
export const BOTTOM_SHEET_PHONE =
  'top-auto bottom-0 left-0 max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-t-[28px] rounded-b-none pb-[env(safe-area-inset-bottom)] max-sm:motion-safe:animate-[bottom-sheet-in_280ms_cubic-bezier(0.32,0.72,0,1)]'

/** sm and up: centred card. The caller adds its own sm:max-w-[…]. */
export const BOTTOM_SHEET_DESKTOP =
  'sm:top-[50%] sm:bottom-auto sm:left-[50%] sm:max-h-[85dvh] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-[28px] sm:pb-0'

const PHONE_QUERY = '(max-width: 639px)'
/** Elements inside a drag area that keep their own tap (they never start a drag). */
const INTERACTIVE = 'button, a, input, textarea, select, label, [role="button"], [role="combobox"], [role="switch"], [role="radio"], [contenteditable="true"]'

type BottomSheetContentProps = React.ComponentProps<typeof DialogContent> & {
  /** Desktop width, e.g. "sm:max-w-[560px]". */
  desktopClassName?: string
}

/**
 * Drop-in for DialogContent: bottom sheet on phones, centred card from sm up,
 * with the drag handle on top. Mark the header `data-sheet-drag` so it drags too.
 */
export function BottomSheetContent({
  className,
  desktopClassName = 'sm:max-w-[480px]',
  children,
  ...props
}: BottomSheetContentProps) {
  return (
    <DialogContent
      showCloseButton={false}
      data-bottom-sheet=""
      className={cn(BOTTOM_SHEET_SURFACE, BOTTOM_SHEET_PHONE, BOTTOM_SHEET_DESKTOP, desktopClassName, className)}
      {...props}
    >
      <SheetGrabber />
      {children}
    </DialogContent>
  )
}

/** The round X used in bottom-sheet headers: 40px hit area, 36px visual. */
export function BottomSheetCloseButton({ label, className }: { label: string; className?: string }) {
  return (
    <DialogPrimitive.Close
      aria-label={label}
      className={cn('group flex size-10 shrink-0 items-center justify-center rounded-full focus:outline-none', className)}
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:text-foreground group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <X className="h-4 w-4" />
      </span>
    </DialogPrimitive.Close>
  )
}

/**
 * The grab handle (phones only). Works inside any Radix Dialog or Sheet
 * content: it drags the nearest [role="dialog"] and closes it through Radix.
 */
export function SheetGrabber({ className, alwaysVisible = false }: { className?: string; alwaysVisible?: boolean }) {
  const zoneRef = React.useRef<HTMLDivElement>(null)
  const closeRef = React.useRef<HTMLButtonElement>(null)
  useSheetDrag(zoneRef, closeRef)

  return (
    <>
      <div
        ref={zoneRef}
        data-sheet-drag=""
        data-sheet-grabber=""
        data-testid="sheet-grabber"
        aria-hidden="true"
        // A full-width, 24px-tall strip is the target; the bar is what shows.
        className={cn(
          'flex h-6 w-full shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing',
          !alwaysVisible && 'sm:hidden',
          className,
        )}
      >
        <span className="h-[5px] w-10 rounded-full bg-foreground/30" />
      </div>
      <DialogPrimitive.Close ref={closeRef} tabIndex={-1} aria-hidden="true" className="hidden" />
    </>
  )
}

function useSheetDrag(
  zoneRef: React.RefObject<HTMLDivElement | null>,
  closeRef: React.RefObject<HTMLButtonElement | null>,
) {
  React.useEffect(() => {
    const zone = zoneRef.current
    const sheet = zone?.closest<HTMLElement>('[role="dialog"]')
    if (!zone || !sheet || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const phone = window.matchMedia(PHONE_QUERY)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

    let pointerId: number | null = null
    let startY = 0
    let offset = 0
    let lastY = 0
    let lastT = 0
    let velocity = 0 // px per ms, positive = down

    function setOffset(px: number, animate: boolean) {
      sheet!.style.transition = animate && !reduceMotion.matches ? 'transform 220ms cubic-bezier(0.32,0.72,0,1)' : 'none'
      sheet!.style.transform = px === 0 ? '' : `translate3d(0, ${px}px, 0)`
    }

    function onDown(e: PointerEvent) {
      if (!phone.matches || pointerId !== null) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const target = e.target as Element | null
      const area = target?.closest('[data-sheet-drag]')
      if (!area || !sheet!.contains(area)) return
      // A button inside the header keeps its tap; the handle itself always drags.
      if (!target!.closest('[data-sheet-grabber]') && target!.closest(INTERACTIVE)) return
      pointerId = e.pointerId
      startY = lastY = e.clientY
      lastT = e.timeStamp
      offset = 0
      velocity = 0
      try { sheet!.setPointerCapture(e.pointerId) } catch { /* not capturable: drag still works while over the sheet */ }
    }

    function onMove(e: PointerEvent) {
      if (e.pointerId !== pointerId) return
      const dy = e.clientY - startY
      // Upward pull gives a little (rubber band), downward follows the finger.
      offset = dy >= 0 ? dy : -Math.min(16, Math.sqrt(-dy) * 2)
      const dt = e.timeStamp - lastT
      if (dt > 0) velocity = (e.clientY - lastY) / dt
      lastY = e.clientY
      lastT = e.timeStamp
      if (Math.abs(dy) > 2) e.preventDefault()
      setOffset(offset, false)
    }

    function onUp(e: PointerEvent) {
      if (e.pointerId !== pointerId) return
      pointerId = null
      try { sheet!.releasePointerCapture(e.pointerId) } catch { /* already released */ }
      const height = sheet!.offsetHeight
      const shouldClose = offset > Math.min(height * 0.3, 180) || (velocity > 0.5 && offset > 24)
      if (!shouldClose) {
        setOffset(0, true)
        return
      }
      setOffset(height + 32, true)
      window.setTimeout(() => {
        closeRef.current?.click()
        // The caller may refuse to close (pending work, a confirm step): bring
        // the sheet back if it is still on screen a moment later.
        window.setTimeout(() => {
          if (sheet!.isConnected) setOffset(0, true)
        }, 120)
      }, reduceMotion.matches ? 0 : 180)
    }

    function onCancel(e: PointerEvent) {
      if (e.pointerId !== pointerId) return
      pointerId = null
      setOffset(0, true)
    }

    sheet.addEventListener('pointerdown', onDown)
    sheet.addEventListener('pointermove', onMove)
    sheet.addEventListener('pointerup', onUp)
    sheet.addEventListener('pointercancel', onCancel)
    return () => {
      sheet.removeEventListener('pointerdown', onDown)
      sheet.removeEventListener('pointermove', onMove)
      sheet.removeEventListener('pointerup', onUp)
      sheet.removeEventListener('pointercancel', onCancel)
    }
  }, [zoneRef, closeRef])
}
