"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:border group-[.toaster]:border-[var(--glass-border)] group-[.toaster]:bg-[var(--glass-bg-strong)] group-[.toaster]:backdrop-blur-[var(--glass-blur)] group-[.toaster]:text-foreground group-[.toaster]:rounded-[var(--radius-md)] group-[.toaster]:shadow-glass " +
            "group-[.toaster]:border-l-[3px] " +
            "data-[type=success]:group-[.toaster]:border-l-emerald-500 " +
            "data-[type=error]:group-[.toaster]:border-l-rose-500 " +
            "data-[type=warning]:group-[.toaster]:border-l-amber-500 " +
            "data-[type=info]:group-[.toaster]:border-l-[hsl(var(--primary))]",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-md)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
