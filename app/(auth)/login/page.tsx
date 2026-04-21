import { getBranding } from '@/lib/platform-config'
import { AuthCard } from '@/components/auth/auth-card'
import { LoginForm } from './login-form'

export default async function LoginPage() {
  const branding = await getBranding()
  return (
    <AuthCard branding={branding}>
      <LoginForm />
    </AuthCard>
  )
}
