import { redirect } from 'next/navigation'
import { isDemoSession } from '@/lib/demo/guard'

/**
 * WhatsApp integration is connect-and-send only — never available in the
 * read-only public demo. Redirect demo sessions back to the dashboard
 * (defense-in-depth alongside the hidden nav entry).
 */
export default async function WhatsAppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (await isDemoSession()) redirect('/dashboard')
  return <>{children}</>
}
