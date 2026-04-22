export function ProductMockup() {
  return (
    <div className="relative flex items-center justify-center">
      {/* Outer glow */}
      <div
        className="relative rounded-[2rem] border border-border overflow-hidden"
        style={{
          boxShadow: '0 0 60px hsl(var(--primary) / 0.15)',
          width: '280px',
          height: '460px',
          background: 'hsl(var(--card))',
        }}
      >
        {/* Phone frame header */}
        <div className="flex items-center justify-center pt-4 pb-2">
          <div className="w-20 h-1.5 rounded-full bg-border" />
        </div>

        {/* Content area */}
        <div className="flex flex-col items-center justify-center h-[calc(100%-48px)] gap-8 px-6">
          {/* State A: Audio waveform */}
          <div className="flex flex-col items-center gap-3">
            <p className="text-[length:var(--font-size-sm)] text-muted-foreground tracking-widest uppercase">Recording</p>
            <div className="flex items-end gap-1.5 h-12" aria-hidden="true">
              {[40, 70, 55, 90, 65, 80, 50].map((h, i) => (
                <div
                  key={i}
                  className="w-2 rounded-full bg-primary motion-safe:animate-[waveform_0.8s_ease-in-out_infinite_alternate]"
                  style={{
                    height: `${h}%`,
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Arrow between states */}
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-px w-8 bg-border" />
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M1 6h10M7 2l4 4-4 4" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div className="h-px w-8 bg-border" />
          </div>

          {/* State B: Estimate preview */}
          <div className="flex flex-col gap-2 w-full">
            <p className="text-[length:var(--font-size-sm)] text-muted-foreground tracking-widest uppercase text-center">Estimate</p>
            <div className="flex flex-col gap-2">
              <div className="h-2 rounded-full bg-muted-foreground/30 w-full" />
              <div className="h-2 rounded-full bg-muted-foreground/20 w-3/4" />
              <div className="h-2 rounded-full bg-muted-foreground/20 w-5/6" />
              <div className="h-2 rounded-full bg-primary/30 w-1/2" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
