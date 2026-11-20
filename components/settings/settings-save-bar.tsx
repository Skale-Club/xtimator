'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { setSaveBarRect } from '@/lib/ui/save-bar-clearance'

/** How long the "saved" confirmation stays after a save lands. */
export const SAVED_FLASH_MS = 2200

/**
 * The save action for an edit form. It only exists while there is something
 * to save: hidden while the form matches what is stored, it slides in at the
 * bottom of the screen (above the phone bottom nav: main's own bottom padding
 * already clears it, and sticky offsets are measured inside that padding) as
 * soon as a field changes, so a change made at the top of a long form can be
 * saved without scrolling. After a save it shows a short "saved" note and
 * goes away again.
 *
 * In a <form> it submits the form. Outside one (controls that are not form
 * fields, e.g. switches), pass `onSave`.
 */
export function SettingsSaveBar({
  dirty,
  pending,
  onDiscard,
  onSave,
  saveDisabled = false,
  saveLabel = 'Save changes',
  savingLabel = 'Saving…',
  unsavedLabel = 'Unsaved changes',
  savedLabel = 'All changes saved',
  discardLabel = 'Discard',
  saveTestId,
  className,
}: {
  dirty: boolean
  pending: boolean
  onDiscard?: () => void
  /** Click handler when the bar is not inside a <form>. */
  onSave?: () => void
  /** Blocks saving while the form is invalid (the bar still shows). */
  saveDisabled?: boolean
  saveLabel?: string
  savingLabel?: string
  unsavedLabel?: string
  savedLabel?: string
  discardLabel?: string
  /** data-testid for the save button. */
  saveTestId?: string
  /** Spacing only. Inside a form it must be a direct child of the <form>:
   *  sticky needs the whole form as its containing block, so never wrap it
   *  in its own div. */
  className?: string
}) {
  const [justSaved, setJustSaved] = useState(false)
  const prev = useRef({ pending, dirty })
  const saveEndedAt = useRef(0)

  useEffect(() => {
    const was = prev.current
    prev.current = { pending, dirty }
    if (was.pending && !pending) saveEndedAt.current = Date.now()
    // Editing again hides the old confirmation at once.
    if (dirty) {
      setJustSaved(false)
      return
    }
    // A save finished and nothing is left to save. Some forms reset their
    // baseline a moment after the request ends, so a clean form shortly after
    // a save counts too; a failed save leaves the form dirty and shows nothing.
    const savedNow = was.pending && !pending
    const resetAfterSave = was.dirty && Date.now() - saveEndedAt.current < 1500
    if (!savedNow && !resetAfterSave) return
    setJustSaved(true)
    const timer = setTimeout(() => setJustSaved(false), SAVED_FLASH_MS)
    return () => clearTimeout(timer)
  }, [pending, dirty])

  const state = pending ? 'saving' : dirty ? 'dirty' : justSaved ? 'saved' : 'clean'
  const visible = state !== 'clean'
  const barRef = useRef<HTMLDivElement>(null)

  // Publish where the bar sits so the chat bubble can step above it instead
  // of covering Save (lib/ui/save-bar-clearance.ts). Re-measured on scroll and
  // resize: the bar is sticky, and rests at the form's end once that scrolls
  // into view.
  useEffect(() => {
    const el = barRef.current
    if (!visible || !el) return
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        const onScreen = r.bottom > 0 && r.top < window.innerHeight
        setSaveBarRect(onScreen ? { left: r.left, right: r.right, top: r.top } : null)
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('scroll', measure, { capture: true, passive: true })
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      window.removeEventListener('scroll', measure, { capture: true })
      window.removeEventListener('resize', measure)
      setSaveBarRect(null)
    }
  }, [visible])

  if (!visible) return null

  return (
    <div
      // Phone keyboard open: rest at the form's end instead. A sticky bar is
      // pinned to the layout viewport's bottom, which on iOS is BEHIND the
      // keyboard (Save unreachable) and on Android floats over the field being
      // typed in. At the end of the form it is a normal scroll target, and the
      // keyboard helper (lib/visual-viewport.ts) scrolls it into view when the
      // field and Save fit together.
      className={cn(
        "pointer-events-none sticky bottom-4 z-20 md:bottom-5 [html[data-keyboard='open']_&]:static",
        'animate-in fade-in slide-in-from-bottom-2 duration-200',
        className,
      )}
      data-testid="settings-save-bar"
      data-settings-save-bar={state}
    >
      <div
        ref={barRef}
        className={cn(
          // Phones: the full width inside the page gutters, just above the
          // bottom nav. Wider screens: a compact pill centred in the content
          // column, clear of the chat bubble in the bottom-right corner.
          'pointer-events-auto flex min-h-14 items-center justify-between gap-3 rounded-xl border py-2 pl-4 pr-2 shadow-xl backdrop-blur-md transition-colors',
          'md:mx-auto md:w-fit md:min-w-[26rem] md:max-w-full md:gap-6',
          state === 'saved' ? 'border-[var(--glass-border)] bg-background/90 md:min-w-0 md:pr-4' : 'border-primary/40 bg-background/95',
        )}
      >
        <p className="flex min-w-0 items-center gap-2 text-sm" aria-live="polite">
          {state === 'dirty' && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
          {state === 'saved' && <Check aria-hidden className="h-4 w-4 shrink-0 text-success" />}
          {/* Phones: the dot says "unsaved"; the words need more room than the
              buttons leave. The saved note has no buttons, so it always shows. */}
          <span className={cn('truncate text-muted-foreground', state !== 'saved' && 'max-sm:sr-only', state === 'saved' && 'text-foreground')}>
            {state === 'saving' ? savingLabel : state === 'dirty' ? unsavedLabel : savedLabel}
          </span>
        </p>
        {state !== 'saved' && (
          <div className="flex shrink-0 items-center gap-2">
            {onDiscard && (
              <Button type="button" variant="ghost" size="sm" onClick={onDiscard} disabled={pending} className="max-md:h-10">
                {discardLabel}
              </Button>
            )}
            <Button
              type={onSave ? 'button' : 'submit'}
              onClick={onSave}
              size="sm"
              disabled={pending || saveDisabled}
              data-testid={saveTestId}
              className="min-w-28 max-md:h-10"
            >
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saveLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
