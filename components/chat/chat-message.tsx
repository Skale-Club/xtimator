'use client'

/**
 * components/chat/chat-message.tsx — renders one UIMessage by switching over
 * message.parts (CHATUI-01).
 *
 * v6 UIMessages carry an ordered `parts` array. We switch on part.type:
 *   - 'text'                         → a markdown bubble (assistant) / plain bubble (user)
 *   - 'tool-<name>' | 'dynamic-tool' → delegate to ChatToolPart (progress chip / result)
 *   - anything else (step/reasoning) → null (not surfaced in v1)
 *
 * Bubbles are thin shadcn-aligned primitives (right/primary for the user, left/card
 * for the assistant) — NOT the WhatsApp MessageBubble (different data shape).
 */
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { UIMessage } from 'ai'
import { cn } from '@/lib/utils'
import { ChatToolPart, type ChatToolPartShape } from '@/components/chat/chat-tool-part'

function isToolPart(type: string): boolean {
  return type.startsWith('tool-') || type === 'dynamic-tool'
}

export function ChatMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex flex-col gap-2', isUser ? 'items-end' : 'items-start')}>
      {message.parts.map((part, i) => {
        if (part.type === 'text') {
          const text = (part as { text?: string }).text ?? ''
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
                <span className="whitespace-pre-wrap">{text}</span>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
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
    </div>
  )
}
