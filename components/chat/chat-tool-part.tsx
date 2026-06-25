'use client'

/**
 * components/chat/chat-tool-part.tsx — per-tool-call progress chip / result (CHATUI-01).
 *
 * The Phase-124 route streams the 8 neutral tools as v6 ToolUIPart parts on the
 * assistant message. Each part walks the 4-state lifecycle:
 *   - input-streaming | input-available → a labeled progress chip (Loader2 spin)
 *   - output-error                      → an error chip (part.errorText)
 *   - output-available                  → the result: for tool-createEstimate a
 *       seam slot Plan 02 fills with the EstimateCard; for the 7 read tools a
 *       compact stringified result in a muted box.
 *
 * The prop is typed loosely as the v6 ToolUIPart union shape so we don't
 * over-constrain across the 8 tool types.
 */
import { Loader2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'
import { EstimateCard } from '@/components/chat/estimate-card'

/** Owner-facing in-flight labels per tool type (research Pattern 5). */
const TOOL_LABEL: Record<string, string> = {
  'tool-createEstimate': 'Generating estimate…',
  'tool-askKnowledge': 'Looking up the answer…',
  'tool-findClientByName': 'Looking up the client…',
  'tool-getLatestEstimateForClient': "Finding the client's last quote…",
  'tool-getProjectStatus': 'Checking the project status…',
  'tool-findServiceByName': 'Looking up the service…',
  'tool-listRecentEstimates': 'Listing recent estimates…',
  'tool-listServices': 'Listing your services…',
}

export interface ChatToolPartShape {
  type: string
  state: string
  input?: unknown
  output?: unknown
  errorText?: string
}

export function ChatToolPart({ part }: { part: ChatToolPartShape }) {
  const { t } = useTranslation()

  // In-flight → labeled progress chip.
  if (part.state === 'input-streaming' || part.state === 'input-available') {
    const label = TOOL_LABEL[part.type] ?? 'Working…'
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>{t(label)}</span>
      </div>
    )
  }

  // Error → error chip.
  if (part.state === 'output-error') {
    return (
      <div className="inline-flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
        <span>{part.errorText ?? t('Something went wrong.')}</span>
      </div>
    )
  }

  // Completed → result.
  if (part.state === 'output-available') {
    if (part.type === 'tool-createEstimate') {
      // ESTIMATE_CARD_SEAM — the inline card polls the job + links to the editor.
      const jobId = (part.output as { jobId?: string } | undefined)?.jobId
      const projectId = (part.input as { projectId?: string } | undefined)?.projectId
      if (jobId && projectId) {
        return <EstimateCard jobId={jobId} projectId={projectId} />
      }
      // Fallback when the tool output/input shape is unexpected.
      return (
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          {t('Estimate ready.')}
        </div>
      )
    }
    // The 7 read tools: a compact result box.
    return (
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2 text-xs text-foreground">
        {typeof part.output === 'string'
          ? part.output
          : JSON.stringify(part.output, null, 2)}
      </pre>
    )
  }

  return null
}
