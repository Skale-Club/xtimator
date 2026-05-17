import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-sm)] bg-muted",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.10),transparent)]",
        "motion-safe:before:animate-[shimmer_1.8s_ease-in-out_infinite]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
