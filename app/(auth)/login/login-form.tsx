'use client'

import { useRef, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { GoogleOAuthButton } from '@/components/auth/google-oauth-button'
import { TurnstileWidget, type TurnstileWidgetRef } from '@/components/auth/turnstile-widget'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage
} from '@/components/ui/form'
import { signIn } from '@/lib/actions/auth'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const turnstileRef = useRef<TurnstileWidgetRef>(null)

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  function onSubmit(values: LoginValues) {
    if (!captchaToken) {
      setFormError('Please complete the CAPTCHA before continuing.')
      return
    }
    setFormError(null)
    startTransition(async () => {
      const formData = new FormData()
      formData.append('email', values.email)
      formData.append('password', values.password)
      formData.append('captchaToken', captchaToken)
      const result = await signIn(formData)
      if (result?.error) {
        setFormError(result.error)
        turnstileRef.current?.reset()
        setCaptchaToken(null)
      }
    })
  }

  return (
    <>
      <GoogleOAuthButton />

      <div className="my-6 flex items-center gap-4">
        <Separator className="flex-1 bg-white/10" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">or</span>
        <Separator className="flex-1 bg-white/10" />
      </div>

      {formError && (
        <Alert variant="destructive" className="mb-6 border-red-500/50 bg-red-500/10 text-red-200">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-white/80">Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    disabled={isPending}
                    className="input-glow-strong min-h-[48px] border-white/10 bg-white/5 px-4 text-white transition-all focus-visible:bg-white/10"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-red-400" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-white/80">Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      disabled={isPending}
                      className="input-glow-strong min-h-[48px] border-white/10 bg-white/5 px-4 pr-12 text-white transition-all focus-visible:bg-white/10"
                      {...field}
                    />
                    <button
                      type="button"
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-white"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage className="text-red-400" />
              </FormItem>
            )}
          />

          <TurnstileWidget
            ref={turnstileRef}
            onToken={setCaptchaToken}
            onExpire={() => setCaptchaToken(null)}
          />

          <Button type="submit" variant="primary" size="lg" className="auth-submit-shimmer mt-2 w-full text-base font-semibold transition-transform duration-200 hover:scale-[1.015] active:scale-100" disabled={isPending || !captchaToken}>
            {isPending && <Loader2 className="mr-2 size-5 animate-spin" />}
            Sign in to Xtimator
          </Button>
        </form>
      </Form>

      <div className="mt-8 flex flex-col gap-3 text-center text-sm">
        <Link href="/reset-password" className="text-muted-foreground transition-colors hover:text-white">
          Forgot your password?
        </Link>
        <span className="text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-semibold text-secondary transition-colors hover:text-white hover:underline">
            Sign up
          </Link>
        </span>
      </div>
    </>
  )
}
