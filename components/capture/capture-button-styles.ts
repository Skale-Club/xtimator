/**
 * The New Xtimate popup's button language (gradient pill primary, tinted pill
 * secondary, thumb dock). Shared so every sheet that lives in that ecosystem
 * (capture failure, paused estimate, buy credits) looks like one family.
 */
export const CAPTURE_PRIMARY_STYLE = {
  backgroundImage: 'linear-gradient(135deg, hsl(219 92% 65%), hsl(228 84% 54%))',
} as const

export const CAPTURE_PRIMARY_CLASS =
  'inline-flex h-14 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-base font-semibold text-white shadow-[0_10px_24px_-10px_hsl(224_86%_50%/0.8)] transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-60 sm:h-[50px] sm:text-[15px]'

export const CAPTURE_SECONDARY_CLASS =
  'inline-flex h-14 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-primary/10 px-5 text-[15px] font-semibold text-primary transition-colors hover:bg-primary/15 sm:h-[50px]'

export const CAPTURE_DOCK_CLASS = 'flex gap-2.5 px-4 pt-2.5 pb-4 sm:px-5 sm:pb-5'
