'use client'

import { useTransition } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { changePassword, changeEmail } from '@/lib/actions/settings'

import { Card, CardContent } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useTranslation } from '@/lib/i18n/use-translation'

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

  return (
    <Card className="w-full rounded-[var(--radius-md)]">
      <CardContent className="space-y-8 py-6">
        {/* Change Password */}
        <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <div>
            <h3 className="text-sm font-medium">{t('Change Password')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('Use a strong password that is not shared with other services.')}
            </p>
          </div>
          <Form {...passwordForm}>
            <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
              <FormField
                control={passwordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Current Password')}</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('New Password')}</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Confirm New Password')}</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isPendingPassword} className="min-w-40">
                {isPendingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('Change Password')}
              </Button>
            </form>
          </Form>
        </div>

        <Separator />

        {/* Change Email */}
        <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <div>
            <h3 className="text-sm font-medium">{t('Change Email')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('A confirmation message will be sent to the new address.')}
            </p>
          </div>
          <Form {...emailForm}>
            <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
              <FormField
                control={emailForm.control}
                name="newEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('New Email Address')}</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="new@email.com" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isPendingEmail} className="min-w-40">
                {isPendingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('Change Email')}
              </Button>
            </form>
          </Form>
        </div>
      </CardContent>
    </Card>
  )
}
