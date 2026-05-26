'use client'

// Connect-to-Claude dialog (Phase 90 hotfix 2026-05-26):
// Replaces three stacked cards with a single "Connect to Claude" button that
// opens a modal containing tabs for each supported client (Claude Code,
// Claude.ai / Desktop, ChatGPT). Reduces scroll length on /settings/integrations/mcp
// and surfaces the connect flow as the primary action.

import { Plug } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { CopyButton } from './copy-button'

interface ConnectDialogProps {
  mcpUrl: string
  claudeCodeCmd: string
}

export function ConnectDialog({ mcpUrl, claudeCodeCmd }: ConnectDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="lg" className="gap-2">
          <Plug className="h-4 w-4" />
          Connect to Claude
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect Xtimator as a custom MCP connector</DialogTitle>
          <DialogDescription>
            Pick the client you want to connect from. All three use the same MCP endpoint
            and the same OAuth consent flow.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="claude-code" className="mt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
            <TabsTrigger value="claude-ai">Claude.ai / Desktop</TabsTrigger>
            <TabsTrigger value="chatgpt">ChatGPT</TabsTrigger>
          </TabsList>

          {/* Claude Code (CLI) */}
          <TabsContent value="claude-code" className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">
              Run this command in any terminal where the <code className="rounded bg-muted px-1 py-0.5">claude</code> CLI is installed.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <pre className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 text-sm">
                <code>{claudeCodeCmd}</code>
              </pre>
              <CopyButton value={claudeCodeCmd} label="Copy command" />
            </div>
            <p className="text-xs text-muted-foreground">
              When you first run a tool, Claude Code will pop the consent screen. Authorize for the active company shown there.
            </p>
          </TabsContent>

          {/* Claude.ai / Claude Desktop */}
          <TabsContent value="claude-ai" className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">
              Add Xtimator as a custom connector inside the Claude UI.
            </p>
            <ol className="ml-5 list-decimal space-y-1.5 text-sm">
              <li>Open <span className="font-medium">Settings → Connectors → Add custom connector</span></li>
              <li>Name: <code className="rounded bg-muted px-1 py-0.5">Xtimator</code></li>
              <li>
                Remote MCP server URL:
                <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <pre className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 text-sm">
                    <code>{mcpUrl}</code>
                  </pre>
                  <CopyButton value={mcpUrl} label="Copy URL" />
                </div>
              </li>
              <li>Click <span className="font-medium">Add</span> and authorize for the active company when prompted</li>
            </ol>
          </TabsContent>

          {/* ChatGPT (Connectors) */}
          <TabsContent value="chatgpt" className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">
              ChatGPT also supports remote MCP servers via custom connectors.
            </p>
            <ol className="ml-5 list-decimal space-y-1.5 text-sm">
              <li>Open <span className="font-medium">Settings → Connectors → Add custom connector</span></li>
              <li>
                Server URL:
                <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <pre className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 text-sm">
                    <code>{mcpUrl}</code>
                  </pre>
                  <CopyButton value={mcpUrl} label="Copy URL" />
                </div>
              </li>
              <li>Authorize the connector when prompted</li>
            </ol>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
