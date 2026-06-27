import { redirect } from 'next/navigation'

export const metadata = { title: 'Team | Settings' }

export default async function StaffTabPage() {
  redirect('/settings/team')
}
