"use client"

import * as React from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useTranslation } from "@/lib/i18n/use-translation"
import { cn } from "@/lib/utils"

// Stable identifiers retained for back-compat with existing call sites.
// Post-Phase-75 these are passive labels — hover tooltips don't need "seen" state
// because they only ever appear on user interaction (TOUR-FIX-02).
export const TOOLTIP_KEYS = {
  priceBook: "price_book",
  clients: "clients",
  estimateTotal: "estimate_total",
  whatsapp: "whatsapp",
  languageToggle: "language_toggle",
} as const

export type TooltipKey = (typeof TOOLTIP_KEYS)[keyof typeof TOOLTIP_KEYS]

type Side = "top" | "bottom" | "left" | "right"

interface ContextualTooltipProps {
  /** Stable identifier kept for back-compat. Not read at runtime — hover tooltips need no persistence. */
  tooltipKey: TooltipKey | string
  /** English source string. Translated via `t()` at render time. */
  text: string
  /** Preferred side. Radix auto-flips to opposite side when there's not enough room. */
  side?: Side
  /** Optional class for the tooltip content surface. */
  className?: string
  /** Anchor element — the child gets the hover/focus listeners via Radix's TooltipTrigger asChild. */
  children?: React.ReactNode
}

/**
 * Thin wrapper around the shadcn Radix Tooltip primitive.
 *
 * Trigger: hover OR keyboard focus on the wrapped child (Radix default).
 * Positioning: `side` is preferred; Radix auto-flips/shifts via `collisionPadding`
 * with top:64 to dodge the sticky topbar (TOUR-FIX-03).
 *
 * Phase 75 rewrite: the prior implementation rendered itself on mount by reading
 * localStorage and calling setVisible(true) with no user interaction. That is now
 * gone — the tooltip is purely interaction-driven (TOUR-FIX-02).
 */
export function ContextualTooltip({
  text,
  side = "right",
  className,
  children,
  // tooltipKey accepted and intentionally ignored — kept for back-compat
  tooltipKey: _tooltipKey,
}: ContextualTooltipProps) {
  const { t } = useTranslation()

  // Defensive: if there's no child to anchor against, render nothing tooltip-related.
  if (!children) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={8}
        collisionPadding={{ top: 64, bottom: 16, left: 16, right: 16 }}
        className={cn("max-w-xs text-pretty", className)}
      >
        {t(text)}
      </TooltipContent>
    </Tooltip>
  )
}
