import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-[var(--radius-md)] border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow,border-color] duration-150 outline-none",
        "selection:bg-primary selection:text-primary-foreground",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "placeholder:text-muted-foreground",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-[hsl(var(--primary))] focus-visible:shadow-glow-brand",
        "aria-invalid:border-destructive aria-invalid:shadow-[0_0_0_3px_hsl(var(--destructive)/0.25)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
