import { getBranding } from '@/lib/platform-config'
import { AuthCard } from '@/components/auth/auth-card'
import { SignupForm } from './signup-form'

export default async function SignupPage() {
  const branding = await getBranding()
  return (
    <AuthCard branding={branding}>
      <SignupForm />
    </AuthCard>
  )
}
