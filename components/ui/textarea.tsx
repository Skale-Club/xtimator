import * as React from "react"

import { cn } from "@/lib/utils"
import { FIELD_BASE } from "@/components/ui/field-styles"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-[80px] w-full rounded-[var(--radius-md)] px-3 py-2 text-sm",
        FIELD_BASE,
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
