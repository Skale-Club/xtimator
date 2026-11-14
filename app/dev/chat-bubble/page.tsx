'use client'

import { notFound } from 'next/navigation'
import { useState } from 'react'
import type { UIMessage } from 'ai'
import { ChatBubble } from '@/components/chat/chat-bubble'
import { ChatComposer } from '@/components/chat/chat-composer'
import { ChatMessage } from '@/components/chat/chat-message'

const PREVIEW_MESSAGES: UIMessage[] = [
  { id: 'preview-user', role: 'user', parts: [{ type: 'text', text: 'Build a 120 ft cedar fence with a gate.\nRemove the old fence and haul away the debris.' }] },
  { id: 'preview-assistant', role: 'assistant', parts: [{ type: 'text', text: 'I can help with that. Here is the scope so far:\n\n- Remove and dispose of the existing fence\n- Install 120 ft of cedar fencing\n- Add a matching gate\n\n**What height should the fence be?**\n\n| Work | Quantity | Notes |\n| --- | --- | --- |\n| Cedar fence | 120 ft | Include posts and hardware |\n\n```text\nA-long-reference-to-check-contained-horizontal-scrolling-without-widening-the-chat-panel-or-page\n```' }] },
]

/**
 * Dev-only local text/composer preview, plus the real assistant launcher.
 * Text sends and message actions stay in local state. Photo/audio normalization
 * still needs a signed-in workspace. Nothing imports this route.
 */
export default function ChatBubblePreview() {
  const [messages, setMessages] = useState(PREVIEW_MESSAGES)
  const [votes, setVotes] = useState<Record<string, boolean>>({})
  const [streaming, setStreaming] = useState(false)
  if (process.env.NODE_ENV === 'production') notFound()
  return (
    <main className="min-h-dvh bg-background p-3 text-sm sm:p-6">
      <div className="mx-auto max-w-2xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-semibold">Chat input preview</h1>
          <button type="button" onClick={() => setStreaming((value) => !value)} className="min-h-11 rounded-lg border px-3">
            {streaming ? 'End simulated response' : 'Simulate response'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Text sends, edits, and votes stay on this page. Enter adds a line; Ctrl/⌘ + Enter sends.
          Photo and audio require a signed-in workspace.
        </p>
        <div className="flex h-[min(42rem,75dvh)] min-w-0 flex-col overflow-hidden rounded-2xl border bg-background">
          <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto overscroll-contain p-4">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                busy={streaming}
                vote={votes[message.id]}
                onVote={(id, value) => setVotes((current) => ({ ...current, [id]: value }))}
                onEdit={message.role === 'user' ? (id, value) => setMessages((current) => current.map((item) => item.id === id ? { ...item, parts: [{ type: 'text', text: value }] } : item)) : undefined}
              />
            ))}
          </div>
          <ChatComposer
            busy={streaming}
            streaming={streaming}
            onStop={() => setStreaming(false)}
            onSend={(text) => setMessages((current) => [...current, { id: `preview-${Date.now()}`, role: 'user', parts: [{ type: 'text', text }] }])}
          />
        </div>
      </div>
      <ChatBubble chatEnabled={true} />
    </main>
  )
}
