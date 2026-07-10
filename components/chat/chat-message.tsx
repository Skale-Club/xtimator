'use client'

/**
 * components/chat/chat-message.tsx — renders one UIMessage by switching over
 * message.parts (CHATUI-01), plus the per-message action row (AI-chatbot parity).
 *
 * v6 UIMessages carry an ordered `parts` array. We switch on part.type:
 *   - 'text'                         → a markdown bubble (assistant) / plain bubble (user)
 *   - 'tool-<name>' | 'dynamic-tool' → delegate to ChatToolPart (progress chip / result)
 *   - anything else (step/reasoning) → null (not surfaced in v1)
 *
 * Actions (hidden while the thread is busy so a mid-stream message stays clean):
 *   - assistant: Copy (always, when there is text), 👍/👎 (when onVote is wired —
 *     i.e. the conversation is persisted), Regenerate (only on the LAST assistant
 *     message, when onRegenerate is wired).
 *   - user: Edit (pencil → inline textarea + Save/Cancel) when onEdit is wired.
 *     Editing resends via sendMessage({ text, messageId }) upstream.
 *
 * Bubbles are thin shadcn-aligned primitives (right/primary for the user, left/card
 * for the assistant) — NOT the WhatsApp MessageBubble (different data shape).
 */
import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, Pencil, RefreshCw, ThumbsDown, ThumbsUp } from 'lucide-react'
import { toast } from 'sonner'
import type { UIMessage } from 'ai'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/use-translation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ChatToolPart, type ChatToolPartShape } from '@/components/chat/chat-tool-part'

function isToolPart(type: string): boolean {
  return type.startsWith('tool-') || type === 'dynamic-tool'
}

/** All of a message's text-part content, joined — the copy/edit payload. */
function messageText(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { text?: string }).text ?? '')
    .join('\n\n')
    .trim()
}

export function ChatMessage({
  message,
  vote,
  onVote,
  onEdit,
  onRegenerate,
  busy = false,
}: {
  message: UIMessage
  /** This owner's persisted 👍(true)/👎(false) on the message, if any. */
  vote?: boolean
  onVote?: (messageId: string, isUpvoted: boolean) => void
  onEdit?: (messageId: string, text: string) => void
  /** Wired only on the LAST assistant message. */
  onRegenerate?: (messageId: string) => void
  /** The thread is streaming — suppress the action rows. */
  busy?: boolean
}) {
  const { t } = useTranslation()
  const isUser = message.role === 'user'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const text = messageText(message)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('Copied to clipboard.'))
    } catch {
      toast.error(t('Could not copy the message.'))
    }
  }

  function startEdit() {
    setDraft(text)
    setEditing(true)
  }

  function saveEdit() {
    const value = draft.trim()
    if (!value || !onEdit) return
    setEditing(false)
    if (value !== text) onEdit(message.id, value)
  }

  if (editing) {
    return (
      <div className="flex flex-col items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              saveEdit()
            }
            if (e.key === 'Escape') setEditing(false)
          }}
          aria-label={t('Edit message')}
          className="max-h-40 min-h-[60px] w-full max-w-[75%] resize-none"
          autoFocus
        />
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            {t('Cancel')}
          </Button>
          <Button type="button" size="sm" onClick={saveEdit} disabled={!draft.trim()}>
            {t('Save & resend')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('group flex flex-col gap-2', isUser ? 'items-end' : 'items-start')}>
      {message.parts.map((part, i) => {
        if (part.type === 'text') {
          const partText = (part as { text?: string }).text ?? ''
          return (
            <div
              key={i}
              className={cn(
                'max-w-[75%] rounded-2xl px-3 py-2 text-sm break-words',
                isUser
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-foreground border border-border',
              )}
            >
              {isUser ? (
                <span className="whitespace-pre-wrap">{partText}</span>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <Markdown remarkPlugins={[remarkGfm]}>{partText}</Markdown>
                </div>
              )}
            </div>
          )
        }

        if (isToolPart(part.type)) {
          return <ChatToolPart key={i} part={part as unknown as ChatToolPartShape} />
        }

        return null
      })}

      {/* Action row — hidden mid-stream; fades in on hover (desktop). */}
      {!busy && (isUser ? !!onEdit : text.length > 0) && (
        <div
          className={cn(
            'flex items-center gap-0.5 text-muted-foreground',
            'opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100',
          )}
        >
          {isUser ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={startEdit}
              aria-label={t('Edit message')}
              className="h-7 w-7"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => void copy()}
                aria-label={t('Copy message')}
                className="h-7 w-7"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              {onVote && (
                <>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => onVote(message.id, true)}
                    aria-label={t('Good response')}
                    className={cn('h-7 w-7', vote === true && 'text-primary')}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => onVote(message.id, false)}
                    aria-label={t('Bad response')}
                    className={cn('h-7 w-7', vote === false && 'text-destructive')}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              {onRegenerate && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => onRegenerate(message.id)}
                  aria-label={t('Regenerate response')}
                  className="h-7 w-7"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
