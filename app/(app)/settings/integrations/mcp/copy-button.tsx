'use client'

// Phase 90: copy-to-clipboard button for the MCP settings page.
//
// Used twice on /settings/integrations/mcp — once for the connect URL and once
// for the `claude mcp add ...` command. Falls back silently if the browser does
// not expose the Clipboard API (older Safari, http://localhost without secure
// context, etc.); copy-paste from the visible <code> block still works.

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface CopyButtonProps {
  /** The text written to the clipboard on click. */
  value: string
  /** Optional accessible label. Defaults to "Copy". */
  label?: string
  /** Tailwind classes forwarded to the button. */
  className?: string
}

export function CopyButton({ value, label = 'Copy', className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  async function handleClick() {
    try {
      // navigator.clipboard requires a secure context (https or localhost).
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        // Reset the icon after a short delay so a second copy still shows feedback.
        setTimeout(() => setCopied(false), 1500)
      }
    } catch {
      // Swallow — the user can still select + copy the visible text manually.
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      aria-label={copied ? 'Copied' : label}
      className={className}
    >
      {copied ? (
        <>
          <Check className="mr-1.5 h-4 w-4" aria-hidden />
          Copied
        </>
      ) : (
        <>
          <Copy className="mr-1.5 h-4 w-4" aria-hidden />
          {label}
        </>
      )}
    </Button>
  )
}
