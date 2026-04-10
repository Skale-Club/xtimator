'use server'

import { redirect } from 'next/navigation'

// Stub: Plan 03 replaces this with full Supabase persistence
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createOrUpdateCompany(_data: any) {
  redirect('/dashboard')
}
