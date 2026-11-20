import { cn } from '@/lib/utils'

/*
 * One look for every form field (Input, Textarea, SelectTrigger, the phone
 * country button, the color hex box, the code boxes). Fields are a filled
 * surface (`--field`) with a border (`--field-border`) that reads against the
 * card in both themes; the placeholder is dimmer than a typed value so an empty
 * field never looks filled. Tokens live in app/globals.css per theme scope.
 */

/** Surface, border and hover. */
export const FIELD_SURFACE =
  'border border-field-border bg-field text-foreground shadow-xs outline-none transition-[color,box-shadow,border-color,background-color] duration-150 hover:border-field-border-hover'

/** Keyboard focus: brand border plus glow. */
export const FIELD_FOCUS = 'focus-visible:border-primary focus-visible:shadow-glow-brand'

export const FIELD_PLACEHOLDER = 'placeholder:text-field-placeholder'

export const FIELD_INVALID =
  'aria-invalid:border-destructive aria-invalid:shadow-[0_0_0_3px_hsl(var(--destructive)/0.25)]'

export const FIELD_DISABLED = 'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-field-border'

/** Everything above, for a plain text-like control. */
export const FIELD_BASE = cn(FIELD_SURFACE, FIELD_FOCUS, FIELD_PLACEHOLDER, FIELD_INVALID, FIELD_DISABLED)
