import Link from 'next/link'
import { Plug, ChevronRight, Sparkles, Mic } from 'lucide-react'

import { T } from '@/components/i18n/t'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getSelectedAIProvider } from '@/lib/platform-config'

export const metadata = { title: 'Integrations | Settings' }

// Display labels for the platform-selected LLM provider. These are brand names
// (not secrets) — the read-only AI card surfaces *what powers estimates* for
// transparency, never the API keys, which stay platform-managed in admin.
const AI_PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Claude (Anthropic)',
  gemini: 'Gemini (Google)',
  openrouter: 'OpenRouter',
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </h2>
  )
}

export default async function SettingsIntegrationsPage() {
  // Active LLM provider is a non-secret display value.
  const aiProvider = await getSelectedAIProvider()

  const estimateModelLabel = AI_PROVIDER_LABELS[aiProvider] ?? AI_PROVIDER_LABELS.anthropic

  return (
    <div className="space-y-8 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Integrations</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>Connect outbound channels and AI assistants.</T>
        </p>
      </header>

      {/* AI — read-only transparency card. No setup, no secrets; just shows what
          powers estimates. AI keys are platform-managed in admin. */}
      <section className="space-y-3">
        <SectionHeading>
          <T>AI</T>
        </SectionHeading>
        <Card className="bg-muted/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" aria-hidden />
              <CardTitle className="text-base">
                <T>Powering your estimates</T>
              </CardTitle>
            </div>
            <CardDescription>
              <T>
                Managed by Xtimator. No setup required. These models turn your
                audio and photos into a finished estimate.
              </T>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <Sparkles className="h-4 w-4" aria-hidden />
                  <T>Estimate generation &amp; photo analysis</T>
                </dt>
                <dd className="font-medium">{estimateModelLabel}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <Mic className="h-4 w-4" aria-hidden />
                  <T>Audio transcription</T>
                </dt>
                <dd className="font-medium">Whisper (OpenAI)</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </section>

      {/* Assistants — use Xtimator from inside AI clients via MCP. */}
      <section className="space-y-3">
        <SectionHeading>
          <T>Assistants</T>
        </SectionHeading>
        <Link
          href="/settings/integrations/mcp"
          className="group block focus:outline-none"
        >
          <Card className="transition hover:border-primary/40 hover:shadow-sm group-focus-visible:ring-2 group-focus-visible:ring-ring">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Plug className="h-5 w-5 text-primary" aria-hidden />
                  <CardTitle className="text-base">MCP Server</CardTitle>
                  <Badge variant="secondary">Beta</Badge>
                </div>
                <ChevronRight
                  className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5"
                  aria-hidden
                />
              </div>
              <CardDescription>
                Use Xtimator from inside Claude, Claude Code, or ChatGPT.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              6 tools available · OAuth 2.0 · per-company scope
            </CardContent>
          </Card>
        </Link>
      </section>
    </div>
  )
}
