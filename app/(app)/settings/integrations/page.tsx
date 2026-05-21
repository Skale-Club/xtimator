import { T } from '@/components/i18n/t'

export const metadata = { title: 'Integrations | Settings' }

export default function SettingsIntegrationsPage() {
  return (
    <div className="space-y-8 px-6 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Integrations</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>Configure AI model providers for estimate generation, photo analysis, and audio transcription.</T>
        </p>
      </header>

      <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
        <p className="text-sm"><T>OpenRouter integration coming soon.</T></p>
      </div>
    </div>
  )
}
