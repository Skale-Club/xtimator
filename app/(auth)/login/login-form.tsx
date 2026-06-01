'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react'
import { AppIcon } from '@/components/ui/app-icon'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { signIn, resetPassword } from '@/lib/actions/auth'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Styles (Xphere dark design system)
// ---------------------------------------------------------------------------

const inputCls =
  'h-10 border border-white/10 bg-white/[0.04] text-[#FAFAFA] placeholder:text-[#3F3F46] focus-visible:ring-indigo-500/40 focus-visible:border-indigo-500/50 focus-visible:ring-1 rounded-md px-3 text-[16px] w-full outline-none transition-colors'

const labelCls = 'text-[0.8125rem] text-[#A1A1AA] font-medium'

const primaryBtn =
  'flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const emailSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
})

const passwordSchema = z.object({
  password: z.string().min(1, 'Password is required.'),
})

type EmailValues = z.infer<typeof emailSchema>
type PasswordValues = z.infer<typeof passwordSchema>

// ---------------------------------------------------------------------------
// Google OAuth button
// ---------------------------------------------------------------------------

function GoogleButton() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setError(null)
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/callback`,
          queryParams: { prompt: 'select_account' },
        },
      })
      if (oauthError) {
        setError(oauthError.message || 'Google sign-in failed. Please try again.')
        setIsLoading(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error during Google sign-in.')
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/[0.08] p-3 text-sm text-red-400">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className="flex h-10 w-full items-center justify-center gap-2.5 rounded-md border border-white/10 bg-white/[0.04] text-sm font-medium text-[#FAFAFA] transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:pointer-events-none disabled:opacity-50"
        aria-label="Continue with Google"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
        )}
        Continue with Google
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Or divider
// ---------------------------------------------------------------------------

function OrDivider() {
  return (
    <div className="relative flex items-center">
      <div className="flex-1 border-t border-white/[0.08]" />
      <span className="mx-3 bg-[#0d0e10] px-1 text-xs text-[#3F3F46]">or</span>
      <div className="flex-1 border-t border-white/[0.08]" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 1 — email
// ---------------------------------------------------------------------------

interface Step1Props {
  initialEmail: string
  topLevelError: string | null
  isPending: boolean
  captchaToken: string | null
  setCaptchaToken: (token: string | null) => void
  onSubmit: (email: string) => void
}

function EmailStep({ initialEmail, topLevelError, isPending, captchaToken, setCaptchaToken, onSubmit }: Step1Props) {
  const [captchaError, setCaptchaError] = useState<string | null>(null)

  const form = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: initialEmail },
  })

  function handleSubmit(values: EmailValues) {
    if (!captchaToken) {
      setCaptchaError('Please complete the CAPTCHA before continuing.')
      return
    }
    setCaptchaError(null)
    onSubmit(values.email)
  }

  return (
    <div className="space-y-5">
      <GoogleButton />
      <OrDivider />

      {(topLevelError || captchaError) && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/[0.08] p-3 text-sm text-red-400">
          {topLevelError ?? captchaError}
        </p>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="space-y-1.5">
                <FormLabel className={labelCls}>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    disabled={isPending}
                    className={inputCls}
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs text-red-400" />
              </FormItem>
            )}
          />

          <TurnstileWidget
            onToken={(token) => { setCaptchaToken(token); setCaptchaError(null) }}
            onExpire={() => setCaptchaToken(null)}
          />

          <button type="submit" disabled={isPending} className={primaryBtn}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Continue
          </button>
        </form>
      </Form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — password
// ---------------------------------------------------------------------------

interface PasswordStepProps {
  email: string
  captchaToken: string | null
  onBack: () => void
  onForgot: () => void
  onError: (message: string) => void
}

function PasswordStep({ email, captchaToken, onBack, onForgot, onError }: PasswordStepProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '' },
  })

  function onSubmit(values: PasswordValues) {
    if (!captchaToken) {
      onError('Your CAPTCHA token expired. Please try again.')
      return
    }
    setFormError(null)
    startTransition(async () => {
      const formData = new FormData()
      formData.append('email', email)
      formData.append('password', values.password)
      formData.append('captchaToken', captchaToken)
      const result = await signIn(formData)
      if (result?.error) {
        setFormError(result.error)
      }
    })
  }

  return (
    <div className="space-y-5">
      <p className="text-center text-[0.8125rem] text-[#71717A]">
        Signing in as <span className="text-[#FAFAFA]">{email}</span>
      </p>

      {formError && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/[0.08] p-3 text-sm text-red-400">
          {formError}
        </p>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem className="space-y-1.5">
                <FormLabel className={labelCls}>Password</FormLabel>
                <div className="relative">
                  <FormControl>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      disabled={isPending}
                      autoFocus
                      className={`${inputCls} pr-10`}
                      {...field}
                    />
                  </FormControl>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#52525B] transition-colors hover:text-[#A1A1AA]"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <FormMessage className="text-xs text-red-400" />
              </FormItem>
            )}
          />

          <button
            type="button"
            onClick={onForgot}
            className="block text-left text-[0.8125rem] text-[#71717A] transition-colors hover:text-[#A1A1AA]"
          >
            Forgot your password?
          </button>

          <button type="submit" disabled={isPending} className={primaryBtn}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </button>

          <button
            type="button"
            onClick={onBack}
            disabled={isPending}
            className="flex w-full items-center justify-center gap-1.5 text-[0.8125rem] text-[#71717A] transition-colors hover:text-[#A1A1AA] disabled:pointer-events-none disabled:opacity-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
        </form>
      </Form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reset sent confirmation
// ---------------------------------------------------------------------------

function ResetSentPanel({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
        <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div className="space-y-1.5">
        <h3 className="text-[1.125rem] font-semibold text-[#FAFAFA]">Check your inbox</h3>
        <p className="text-[0.875rem] text-[#A1A1AA]">
          We sent a password reset link to{' '}
          <span className="text-[#FAFAFA]">{email}</span>.
        </p>
      </div>
      <button type="button" onClick={onBack} className={primaryBtn}>
        Back to sign in
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reset password step
// ---------------------------------------------------------------------------

interface ResetStepProps {
  initialEmail: string
  captchaToken: string | null
  setCaptchaToken: (token: string | null) => void
  onSent: (email: string) => void
  onBack: () => void
}

function ResetStep({ initialEmail, captchaToken, setCaptchaToken, onSent, onBack }: ResetStepProps) {
  const [captchaError, setCaptchaError] = useState<string | null>(null)
  const [topError, setTopError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: initialEmail },
  })

  function handleSubmit(values: EmailValues) {
    if (!captchaToken) {
      setCaptchaError('Please complete the CAPTCHA before continuing.')
      return
    }
    setCaptchaError(null)
    startTransition(async () => {
      const formData = new FormData()
      formData.append('email', values.email)
      formData.append('captchaToken', captchaToken)
      const result = await resetPassword(formData)
      if (result && 'error' in result && result.error) {
        setTopError(result.error)
        setCaptchaToken(null)
      } else {
        onSent(values.email)
      }
    })
  }

  return (
    <div className="space-y-5">
      {(topError || captchaError) && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/[0.08] p-3 text-sm text-red-400">
          {topError ?? captchaError}
        </p>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="space-y-1.5">
                <FormLabel className={labelCls}>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    disabled={isPending}
                    className={inputCls}
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs text-red-400" />
              </FormItem>
            )}
          />

          <TurnstileWidget
            onToken={(token) => { setCaptchaToken(token); setCaptchaError(null) }}
            onExpire={() => setCaptchaToken(null)}
          />

          <button type="submit" disabled={isPending} className={primaryBtn}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Send reset link
          </button>

          <button
            type="button"
            onClick={onBack}
            disabled={isPending}
            className="flex w-full items-center justify-center gap-1.5 text-[0.8125rem] text-[#71717A] transition-colors hover:text-[#A1A1AA] disabled:pointer-events-none disabled:opacity-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </button>
        </form>
      </Form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root login form
// ---------------------------------------------------------------------------

type View = 'login-email' | 'login-password' | 'reset' | 'reset-sent'

interface LoginFormProps {
  appName: string
  logoUrl: string | null
}

export function LoginForm({ appName, logoUrl }: LoginFormProps) {
  const [view, setView] = useState<View>('login-email')
  const [email, setEmail] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [topLevelError, setTopLevelError] = useState<string | null>(null)

  function handleEmailSubmit(emailValue: string) {
    setEmail(emailValue)
    setTopLevelError(null)
    setView('login-password')
  }

  function handleStep2Error(message: string) {
    setCaptchaToken(null)
    setTopLevelError(message)
    setView('login-email')
  }

  const heading = view === 'reset' || view === 'reset-sent' ? 'Reset your password' : 'Welcome back'
  const subheading =
    view === 'reset'
      ? "Enter your email and we'll send you a reset link."
      : view === 'reset-sent'
        ? undefined
        : 'Sign in to continue to ' + appName

  return (
    <div className="w-full max-w-[400px]">
      {/* Card */}
      <div className="rounded-2xl border border-white/10 bg-[#0d0e10] p-8 shadow-2xl">
        {/* Brand */}
        <Link
          href="/"
          aria-label={`Go to ${appName} homepage`}
          className="mb-6 flex items-center justify-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <AppIcon logoUrl={logoUrl} appName={appName} className="h-7 w-7" />
          <span className="text-lg font-bold tracking-tight text-[#FAFAFA]">{appName}</span>
        </Link>

        {/* Heading */}
        <div className="mb-6 text-center">
          <h1 className="text-[1.5rem] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
            {heading}
          </h1>
          {subheading && (
            <p className="mt-1 text-[0.875rem] text-[#71717A]">{subheading}</p>
          )}
        </div>

        {/* Step body */}
        {view === 'login-email' && (
          <EmailStep
            initialEmail={email}
            topLevelError={topLevelError}
            isPending={false}
            captchaToken={captchaToken}
            setCaptchaToken={setCaptchaToken}
            onSubmit={handleEmailSubmit}
          />
        )}
        {view === 'login-password' && (
          <PasswordStep
            email={email}
            captchaToken={captchaToken}
            onBack={() => { setTopLevelError(null); setView('login-email') }}
            onForgot={() => { setTopLevelError(null); setView('reset') }}
            onError={handleStep2Error}
          />
        )}
        {view === 'reset' && (
          <ResetStep
            initialEmail={email}
            captchaToken={captchaToken}
            setCaptchaToken={setCaptchaToken}
            onSent={(e) => { setEmail(e); setView('reset-sent') }}
            onBack={() => { setTopLevelError(null); setView('login-email') }}
          />
        )}
        {view === 'reset-sent' && (
          <ResetSentPanel
            email={email}
            onBack={() => setView('login-email')}
          />
        )}
      </div>

      {/* Footer */}
      <div className="mt-5 space-y-1.5 text-center text-[0.8125rem]">
        {(view === 'login-email' || view === 'login-password') && (
          <p className="text-[#71717A]">
            Don&apos;t have an account?{' '}
            <Link href="/?auth=signup" className="font-medium text-[#FAFAFA] transition-colors hover:underline">
              Sign up
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
