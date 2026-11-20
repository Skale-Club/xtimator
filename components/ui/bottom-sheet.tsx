'use client'

// One bottom sheet for the whole app: a Radix dialog that is a sheet pinned to
// the bottom on phones (< sm) and a centred card from sm up, with a grab handle
// that really drags. Pull the handle (or any element marked data-sheet-drag,
// usually the header) up and the sheet grows taller, up to its max-height; it
// never leaves the bottom edge. Pull it down and it shrinks back to the height
// it opened at, then follows the finger down; let go past ~30% of its height,
// or flick it down, and it closes. Otherwise it springs back.
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

/**
 * The round X used in every bottom-sheet header: 40px hit area, 36px visual.
 * Closes through Radix, so it goes through the caller's onOpenChange like
 * Escape or the drag (a caller that refuses to close keeps the sheet).
 * The fill is a translucent foreground with a hairline ring, so it stands out
 * on any sheet surface in both themes (bg-muted all but vanished on the dark
 * nx-surface).
 */
export function BottomSheetCloseButton({
  label,
  className,
  disabled,
}: {
  label: string
  className?: string
  disabled?: boolean
}) {
  return (
    <DialogPrimitive.Close
      aria-label={label}
      disabled={disabled}
      data-sheet-close=""
      className={cn(
        'group flex size-10 shrink-0 items-center justify-center rounded-full focus:outline-none disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-foreground/10 text-foreground/80 ring-1 ring-inset ring-foreground/10 transition-colors group-hover:bg-foreground/15 group-hover:text-foreground group-active:bg-foreground/20 group-focus-visible:ring-2 group-focus-visible:ring-ring">
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


/** Animation shared by the spring-back, the snap and the close slide. */
const SHEET_EASE = '220ms cubic-bezier(0.32,0.72,0,1)'
/** Below this speed (px/ms) a release is a placement, above it a flick. */
const FLICK_VELOCITY = 0.5

/**
 * The gesture behind the handle (phones only).
 *
 * The sheet stays pinned to the bottom of the screen; it never moves up.
 *  - Pulling up makes it taller, up to its own CSS max-height (92dvh, or the
 *    area the keyboard leaves visible). The height asked for is written to
 *    --sheet-h with [data-sheet-resized]; globals.css turns that into a
 *    clamped min-height, so the content can still grow past it and the cap
 *    follows the keyboard and rotation without any code.
 *  - Its natural height (what it opens at) is the floor. Pulling down from a
 *    taller sheet shrinks it to that floor first; past the floor the sheet
 *    slides down and closes after ~30% of its height or a flick.
 *  - Released between the floor and the cap it stays where it was left; a
 *    flick up goes to the cap and a flick down back to the floor.
 */
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
    let startHeight = 0 // rendered height when the drag began
    let natural = 0 // height the content asks for (the floor)
    let cap = 0 // the sheet's max-height in px (the ceiling)
    let height = 0 // height asked for right now (>= natural)
    let offset = 0 // slide down below the floor, px (>= 0)
    let lastY = 0
    let lastT = 0
    let velocity = 0 // px per ms, positive = down
    let frame = 0

    const animate = (on: boolean) => {
      sheet.style.transition = on && !reduceMotion.matches ? `transform ${SHEET_EASE}, min-height ${SHEET_EASE}` : 'none'
    }

    function applyHeight(px: number) {
      if (px > natural + 0.5) {
        sheet!.style.setProperty('--sheet-h', `${Math.round(px)}px`)
        sheet!.setAttribute('data-sheet-resized', '')
      } else {
        sheet!.style.removeProperty('--sheet-h')
        sheet!.removeAttribute('data-sheet-resized')
      }
    }

    function applyOffset(px: number) {
      sheet!.style.transform = px > 0 ? `translate3d(0, ${px}px, 0)` : ''
    }

    function flush() {
      if (frame) window.cancelAnimationFrame(frame)
      frame = 0
      applyHeight(height)
      applyOffset(offset)
    }

    // At most one style write per frame while the finger moves.
    function schedule() {
      if (typeof window.requestAnimationFrame !== 'function') return flush()
      if (!frame) frame = window.requestAnimationFrame(flush)
    }

    /** The height the content asks for: measured without the resize, in one
     *  synchronous layout (no paint in between, so nothing flickers). */
    function measureNatural(): number {
      const resized = sheet!.hasAttribute('data-sheet-resized')
      if (resized) sheet!.removeAttribute('data-sheet-resized')
      const h = sheet!.offsetHeight
      if (resized) sheet!.setAttribute('data-sheet-resized', '')
      return h
    }

    function measureCap(): number {
      const max = Number.parseFloat(window.getComputedStyle(sheet!).maxHeight)
      return Number.isFinite(max) && max > 0 ? max : window.innerHeight
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
      velocity = 0
      offset = 0
      natural = measureNatural()
      startHeight = sheet!.offsetHeight
      cap = Math.max(measureCap(), natural)
      height = Math.max(startHeight, natural)
      animate(false)
      try { sheet!.setPointerCapture(e.pointerId) } catch { /* not capturable: drag still works while over the sheet */ }
    }

    function onMove(e: PointerEvent) {
      if (e.pointerId !== pointerId) return
      const dy = e.clientY - startY
      const wanted = startHeight - dy
      if (wanted >= natural) {
        height = Math.min(wanted, cap)
        offset = 0
      } else {
        height = natural
        offset = natural - wanted
      }
      const dt = e.timeStamp - lastT
      if (dt > 0) velocity = (e.clientY - lastY) / dt
      lastY = e.clientY
      lastT = e.timeStamp
      if (Math.abs(dy) > 2) e.preventDefault()
      schedule()
    }

    function onUp(e: PointerEvent) {
      if (e.pointerId !== pointerId) return
      pointerId = null
      try { sheet!.releasePointerCapture(e.pointerId) } catch { /* already released */ }
      flush()

      // Below the floor: the close gesture.
      if (offset > 0) {
        const shouldClose = offset > Math.min(natural * 0.3, 180) || (velocity > FLICK_VELOCITY && offset > 24)
        animate(true)
        if (!shouldClose) {
          offset = 0
          applyOffset(0)
          return
        }
        applyOffset(natural + 32)
        window.setTimeout(() => {
          closeRef.current?.click()
          // The caller may refuse to close (pending work, a confirm step): bring
          // the sheet back if it is still on screen a moment later.
          window.setTimeout(() => {
            if (sheet!.isConnected) { offset = 0; applyOffset(0) }
          }, 120)
        }, reduceMotion.matches ? 0 : 180)
        return
      }

      // At or above the floor: a flick snaps, a slow release stays put.
      if (velocity < -FLICK_VELOCITY && height < cap) {
        animate(true)
        height = cap
        applyHeight(cap)
      } else if (velocity > FLICK_VELOCITY && height > natural + 0.5) {
        animate(true)
        // min-height cannot animate to auto: animate to the natural height in
        // px, then drop the resize once the transition is over.
        sheet!.style.setProperty('--sheet-h', `${Math.round(natural)}px`)
        height = natural
        window.setTimeout(() => {
          if (pointerId === null && height <= natural + 0.5) applyHeight(natural)
        }, reduceMotion.matches ? 0 : 240)
      }
    }

    function onCancel(e: PointerEvent) {
      if (e.pointerId !== pointerId) return
      pointerId = null
      flush()
      animate(true)
      offset = 0
      applyOffset(0)
    }

    sheet.addEventListener('pointerdown', onDown)
    sheet.addEventListener('pointermove', onMove)
    sheet.addEventListener('pointerup', onUp)
    sheet.addEventListener('pointercancel', onCancel)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      sheet.removeEventListener('pointerdown', onDown)
      sheet.removeEventListener('pointermove', onMove)
      sheet.removeEventListener('pointerup', onUp)
      sheet.removeEventListener('pointercancel', onCancel)
    }
  }, [zoneRef, closeRef])
}
