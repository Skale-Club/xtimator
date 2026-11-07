'use client'

import { useTransition } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { changePassword, changeEmail } from '@/lib/actions/settings'

import { SettingsCard } from '@/components/settings/settings-ui'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'
import { ownedAuthEnabled } from '@/lib/auth/mode'
import { OwnedAccountSecurity } from '@/components/auth/owned-account-security'

// Password schema
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type PasswordValues = z.infer<typeof passwordSchema>

// Email schema
const emailSchema = z.object({
  newEmail: z.string().email('Please enter a valid email'),
})

type EmailValues = z.infer<typeof emailSchema>

export function AccountSection() {
  return ownedAuthEnabled() ? <OwnedAccountSecurity /> : <LegacyAccountSection />
}

function LegacyAccountSection() {
  const { t } = useTranslation()
  const [isPendingPassword, startPasswordTransition] = useTransition()
  const [isPendingEmail, startEmailTransition] = useTransition()

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema) as Resolver<PasswordValues>,
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  const emailForm = useForm<EmailValues>({
    resolver: zodResolver(emailSchema) as Resolver<EmailValues>,
    defaultValues: {
      newEmail: '',
    },
  })

  function onPasswordSubmit(values: PasswordValues) {
    startPasswordTransition(async () => {
      const result = await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      })
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t('Password changed successfully.'))
        passwordForm.reset()
      }
    })
  }

  function onEmailSubmit(values: EmailValues) {
    startEmailTransition(async () => {
      const result = await changeEmail({ newEmail: values.newEmail })
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(result.message || t('Confirmation email sent to your new address.'))
        emailForm.reset()
      }
    })
  }

  const field = (
    name: keyof PasswordValues,
    label: string,
    autoComplete: string,
  ) => (
    <FormField
      control={passwordForm.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type="password" autoComplete={autoComplete} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <>
      <Form {...passwordForm}>
        <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}>
          <SettingsCard
            title={t('Password')}
            description={t('Use a strong password that is not shared with other services.')}
            footer={
              <Button type="submit" size="sm" disabled={isPendingPassword} className="min-w-28">
                {isPendingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('Change password')}
              </Button>
            }
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2 sm:max-w-[calc(50%-0.625rem)]">
                {field('currentPassword', t('Current password'), 'current-password')}
              </div>
              {field('newPassword', t('New password'), 'new-password')}
              {field('confirmPassword', t('Confirm new password'), 'new-password')}
            </div>
          </SettingsCard>
        </form>
      </Form>

      <Form {...emailForm}>
        <form onSubmit={emailForm.handleSubmit(onEmailSubmit)}>
          <SettingsCard
            title={t('Email')}
            description={t('A confirmation message will be sent to the new address.')}
            footer={
              <Button type="submit" size="sm" disabled={isPendingEmail} className="min-w-28">
                {isPendingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('Change email')}
              </Button>
            }
          >
            <div className="sm:max-w-[calc(50%-0.625rem)]">
              <FormField
                control={emailForm.control}
                name="newEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('New email address')}</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="new@email.com" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </SettingsCard>
        </form>
      </Form>
    </>
  )
}
