import { redirect } from 'next/navigation'

export default function AdminWhatsAppRedirect() {
  redirect('/admin/inbox')
}
