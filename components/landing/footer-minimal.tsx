import { Zap } from 'lucide-react'

interface FooterMinimalProps {
  appName: string
}

export function FooterMinimal({ appName }: FooterMinimalProps) {
  return (
    <footer className="py-8 border-t border-border">
      <div className="mx-auto w-full max-w-[1200px] px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Zap className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="text-[length:var(--font-size-sm)] font-[var(--font-weight-normal)]">{appName}</span>
        </div>
        <div className="flex flex-col items-center sm:items-end gap-0.5">
          <p className="text-[length:var(--font-size-sm)] font-[var(--font-weight-normal)] tracking-[0.04em] text-muted-foreground">
            © 2026 {appName}. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground/60">Developed by Skale Club</p>
        </div>
      </div>
    </footer>
  )
}
