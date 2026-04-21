import { getBranding } from '@/lib/platform-config'
import { AuthCard } from '@/components/auth/auth-card'
import { ResetPasswordForm } from './reset-password-form'

export default async function ResetPasswordPage() {
  const branding = await getBranding()
  return (
    <AuthCard branding={branding}>
      <ResetPasswordForm />
    </AuthCard>
  )
}
