'use client'

import { notFound } from 'next/navigation'
import { ChatBubble } from '@/components/chat/chat-bubble'

/**
 * Dev-only check for dragging the chat launcher without signing in. Rendered
 * with chatEnabled={false}, so opening it shows the upgrade card and calls no
 * server action. Nothing imports this route.
 */
export default function ChatBubblePreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <main className="min-h-dvh bg-background p-6 text-sm text-muted-foreground">
    Drag the chat bubble with the mouse or a finger. Release it and it snaps to the nearer side.
    <ChatBubble chatEnabled={false} />
  </main>
}
