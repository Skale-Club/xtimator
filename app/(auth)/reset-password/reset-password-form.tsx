'use client'

import { useState, useTransition, Suspense } from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage
} from '@/components/ui/form'
import { resetPassword, updatePassword } from '@/lib/actions/auth'

// Request reset schema
const requestSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
})

// Update password schema
const updateSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })

type RequestValues = z.infer<typeof requestSchema>
type UpdateValues = z.infer<typeof updateSchema>

function RequestResetForm() {
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<RequestValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { email: '' },
  })

  function onSubmit(values: RequestValues) {
    setFormError(null)
    startTransition(async () => {
      const formData = new FormData()
      formData.append('email', values.email)
      const result = await resetPassword(formData)
      if (result?.error) {
        setFormError(result.error)
      } else if (result?.success) {
        toast.success(result.success)
        form.reset()
      }
    })
  }

  return (
    <>
      <h1 className="mb-6 text-center text-xl font-semibold">Reset your password</h1>

      {formError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    disabled={isPending}
                    className="input-glow-strong min-h-[44px] transition-all"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" variant="primary" size="lg" className="auth-submit-shimmer mt-2 w-full text-base font-semibold transition-transform duration-200 hover:scale-[1.015] active:scale-100" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send reset link
          </Button>
        </form>
      </Form>

      <div className="mt-4 text-center text-sm">
        <Link href="/login" className="text-muted-foreground hover:text-foreground">
          Back to sign in
        </Link>
      </div>
    </>
  )
}

function UpdatePasswordForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<UpdateValues>({
    resolver: zodResolver(updateSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  function onSubmit(values: UpdateValues) {
    setFormError(null)
    startTransition(async () => {
      const formData = new FormData()
      formData.append('password', values.password)
      const result = await updatePassword(formData)
      if (result?.error) setFormError(result.error)
    })
  }

  return (
    <>
      <h1 className="mb-6 text-center text-xl font-semibold">Set new password</h1>

      {formError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      disabled={isPending}
                      className="input-glow-strong min-h-[44px] pr-10 transition-all"
                      {...field}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm new password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      disabled={isPending}
                      className="input-glow-strong min-h-[44px] pr-10 transition-all"
                      {...field}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowConfirm(!showConfirm)}
                      aria-label={showConfirm ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" variant="primary" size="lg" className="auth-submit-shimmer mt-2 w-full text-base font-semibold transition-transform duration-200 hover:scale-[1.015] active:scale-100" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update password
          </Button>
        </form>
      </Form>

      <div className="mt-4 text-center text-sm">
        <Link href="/login" className="text-muted-foreground hover:text-foreground">
          Back to sign in
        </Link>
      </div>
    </>
  )
}

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode')
  return mode === 'update' ? <UpdatePasswordForm /> : <RequestResetForm />
}

export function ResetPasswordForm() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[200px] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  )
}
