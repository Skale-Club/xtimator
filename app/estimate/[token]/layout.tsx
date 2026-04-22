export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="light" className="min-h-screen bg-background text-foreground">
      {children}
    </div>
  )
}
