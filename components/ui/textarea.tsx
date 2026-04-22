import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-[80px] w-full rounded-[var(--radius-md)] border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow,border-color] duration-150 outline-none",
        "placeholder:text-muted-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:shadow-[var(--shadow-focus)]",
        "aria-invalid:border-destructive aria-invalid:shadow-[0_0_0_3px_hsl(var(--destructive)/0.25)]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
