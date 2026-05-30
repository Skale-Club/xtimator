'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Ends the demo session and sends the visitor to the landing page with the
 * signup dialog open. Signing out first avoids the demo session conflicting
 * with the new account the visitor is about to create (Decision D09).
 */
export async function exitDemoToSignup() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/?auth=signup')
}
