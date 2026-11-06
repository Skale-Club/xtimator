import { redirect } from 'next/navigation'

// Delivery and signature now live with the other estimate defaults (one form,
// one save). Old links land there.
export default function DeliveryTabPage() {
  redirect('/settings/estimates')
}
