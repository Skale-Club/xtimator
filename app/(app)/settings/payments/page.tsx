import { redirect } from 'next/navigation'

export default function PaymentsSettingsPage() {
  redirect('/settings/integrations/stripe')
}
