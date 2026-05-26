import Link from 'next/link'
import { Plug, ChevronRight } from 'lucide-react'

import { T } from '@/components/i18n/t'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const metadata = { title: 'Integrations | Settings' }

export default function SettingsIntegrationsPage() {
  return (
    <div className="space-y-8 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Integrations</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>Connect Xtimator to external tools and AI assistants.</T>
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Phase 90: MCP Server entry card */}
        <Link
          href="/settings/integrations/mcp"
          className="group block focus:outline-none"
        >
          <Card className="h-full transition hover:border-primary/40 hover:shadow-sm group-focus-visible:ring-2 group-focus-visible:ring-ring">
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
      </div>
    </div>
  )
}
