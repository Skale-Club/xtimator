// Phase 90: MCP settings sub-page.
//
// Surface that lets the user add Xtimator as a custom MCP connector inside
// Claude Code, Claude.ai / Claude Desktop, and ChatGPT. The page is a pure
// server component: it resolves the canonical issuer URL (Phase 86) and the
// active company name (Phase 79) and renders static instructions plus copy
// buttons. No DB writes — all OAuth / consent state is managed by the
// /api/oauth/* endpoints (Phase 86) and triggered by the connector itself on
// first tool call.

import { redirect } from 'next/navigation'
import Link from 'next/link'

import { getActiveCompany } from '@/lib/queries/active-company'
import { resolveIssuer } from '@/lib/oauth/issuer'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

import { CopyButton } from './copy-button'

export const metadata = { title: 'MCP Server | Integrations | Settings' }

export default async function McpSettingsPage() {
  const [company, issuer] = await Promise.all([
    getActiveCompany(),
    resolveIssuer(),
  ])

  // No active company → user has zero memberships. Send to onboarding (same
  // pattern the rest of the settings sub-pages use).
  if (!company) redirect('/onboarding')

  const mcpUrl = `${issuer}/api/mcp`
  const claudeCodeCmd = `claude mcp add xtimator ${mcpUrl}`

  return (
    <div className="space-y-8 p-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
            MCP Server
          </h1>
          <Badge variant="secondary">Beta</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Add Xtimator as a custom MCP connector in Claude to use
          {' '}<code className="rounded bg-muted px-1 py-0.5 text-xs">list_estimates</code>,
          {' '}<code className="rounded bg-muted px-1 py-0.5 text-xs">get_estimate</code>,
          {' '}<code className="rounded bg-muted px-1 py-0.5 text-xs">list_clients</code>,
          {' '}<code className="rounded bg-muted px-1 py-0.5 text-xs">list_projects</code>,
          {' '}<code className="rounded bg-muted px-1 py-0.5 text-xs">create_estimate</code>, and
          {' '}<code className="rounded bg-muted px-1 py-0.5 text-xs">check_job_status</code>{' '}
          from inside the chat.
        </p>
        <Link
          href="/settings/integrations"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          ← Back to Integrations
        </Link>
      </header>

      {/* Connect URL */}
      <Card>
        <CardHeader>
          <CardTitle>Connect URL</CardTitle>
          <CardDescription>
            The remote MCP server endpoint. Paste this into any MCP-compatible client.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <pre className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 text-sm">
              <code>{mcpUrl}</code>
            </pre>
            <CopyButton value={mcpUrl} label="Copy URL" />
          </div>
        </CardContent>
      </Card>

      {/* How to connect */}
      <section className="space-y-6">
        <h2 className="text-xl font-semibold tracking-tight">How to connect</h2>

        {/* Claude Code */}
        <Card>
          <CardHeader>
            <CardTitle>Claude Code (CLI)</CardTitle>
            <CardDescription>
              Run this in any terminal where the <code>claude</code> CLI is installed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <pre className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 text-sm">
                <code>{claudeCodeCmd}</code>
              </pre>
              <CopyButton value={claudeCodeCmd} label="Copy command" />
            </div>
            <p className="text-sm text-muted-foreground">
              When you first run a tool, Claude Code will pop the consent screen.
              Authorize for the active company shown there.
            </p>
          </CardContent>
        </Card>

        {/* Claude.ai / Claude Desktop */}
        <Card>
          <CardHeader>
            <CardTitle>Claude.ai / Claude Desktop</CardTitle>
            <CardDescription>
              Add Xtimator as a custom connector in the Claude UI.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="ml-5 list-decimal space-y-1.5 text-sm">
              <li>Open <span className="font-medium">Settings → Connectors → Add custom connector</span></li>
              <li>Name: <code className="rounded bg-muted px-1 py-0.5">Xtimator</code></li>
              <li>
                Remote MCP server URL:{' '}
                <code className="rounded bg-muted px-1 py-0.5">{mcpUrl}</code>
              </li>
              <li>Click <span className="font-medium">Add</span></li>
            </ol>
          </CardContent>
        </Card>

        {/* ChatGPT */}
        <Card>
          <CardHeader>
            <CardTitle>ChatGPT (Connectors)</CardTitle>
            <CardDescription>
              ChatGPT also supports remote MCP servers via custom connectors.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="ml-5 list-decimal space-y-1.5 text-sm">
              <li>Open <span className="font-medium">Settings → Connectors → Add custom connector</span></li>
              <li>
                Server URL:{' '}
                <code className="rounded bg-muted px-1 py-0.5">{mcpUrl}</code>
              </li>
              <li>Authorize the connector when prompted</li>
            </ol>
          </CardContent>
        </Card>
      </section>

      {/* Available tools */}
      <Card>
        <CardHeader>
          <CardTitle>Available tools</CardTitle>
          <CardDescription>
            Six tools are exposed today. Read tools carry{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">readOnlyHint</code> so
            Claude.ai groups them under a single &quot;Always allow&quot; toggle.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Read-only (4)</h3>
            <ul className="ml-5 mt-1 list-disc space-y-1 text-sm">
              <li><code>list_estimates</code> — paginated list, optional filters</li>
              <li><code>get_estimate</code> — full estimate with sections + items</li>
              <li><code>list_clients</code> — name/email substring search supported</li>
              <li><code>list_projects</code> — paginated list, optional filters</li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Write (2)</h3>
            <ul className="ml-5 mt-1 list-disc space-y-1 text-sm">
              <li><code>create_estimate</code> — async; returns <code>job_id</code></li>
              <li><code>check_job_status</code> — poll <code>job_id</code> until <code>status=complete</code></li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Permissions */}
      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            When you connect, Claude asks you to authorize. The consent screen
            shows the active company (currently:{' '}
            <span className="font-medium">{company.name}</span>). All MCP tool
            calls are scoped to that company.
          </p>
          <p className="text-muted-foreground">
            You can revoke access any time from{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">/settings/integrations/mcp/revoke</code>{' '}
            (coming soon).
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
