import { redirect } from 'next/navigation'

/**
 * The owner-facing in-app chat is dormant. Keep the route as a redirect so
 * stale bookmarks and browser history return users to a useful app surface
 * without loading chat data or advertising the legacy feature.
 */
export default function ChatPage() {
  redirect('/dashboard')
}
