'use client'

import { useRef, useState, useTransition, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, X } from 'lucide-react'
import { AppIcon } from '@/components/ui/app-icon'
import { TurnstileWidget, type TurnstileWidgetRef } from '@/components/auth/turnstile-widget'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { signIn, signUp, resetPassword } from '@/lib/actions/auth'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const emailSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
})

const loginPasswordSchema = z.object({
  password: z.string().min(1, 'Password is required.'),
})

const signupPasswordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })

type EmailValues = z.infer<typeof emailSchema>
type LoginPasswordValues = z.infer<typeof loginPasswordSchema>
type SignupPasswordValues = z.infer<typeof signupPasswordSchema>

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mode = 'login' | 'signup' | 'reset'
type Step = 'email' | 'password'

interface AuthDialogProps {
  branding: { appName: string; logoUrl: string | null }
  initialMode?: 'login' | 'signup'
  open: boolean
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Shared input / label class constants (Xphere style)
// ---------------------------------------------------------------------------

const inputCls =
  'h-10 border border-white/10 bg-white/[0.04] text-[#FAFAFA] placeholder:text-[#3F3F46] focus-visible:ring-indigo-500/40 focus-visible:border-indigo-500/50 focus-visible:ring-1 rounded-md px-3 text-[16px] w-full outline-none transition-colors'

const labelCls = 'text-[0.8125rem] text-[#A1A1AA] font-medium'

// ---------------------------------------------------------------------------
// Google OAuth button (Xphere-styled inline version)
// ---------------------------------------------------------------------------

function XphereGoogleButton() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setError(null)
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/callback` },
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
// Divider
// ---------------------------------------------------------------------------

function OrDivider() {
  return (
    <div className="relative flex items-center">
      <div className="flex-1 border-t border-white/[0.08]" />
      <span className="mx-3 bg-[#08090A] px-1 text-xs text-[#3F3F46]">or</span>
      <div className="flex-1 border-t border-white/[0.08]" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 1 — email + Turnstile (used by all three modes)
// ---------------------------------------------------------------------------

interface Step1Props {
  mode: Mode
  initialEmail: string
  topLevelError: string | null
  isPending: boolean
  captchaToken: string | null
  setCaptchaToken: (token: string | null) => void
  turnstileRef: React.RefObject<TurnstileWidgetRef | null>
  onSubmit: (email: string) => void
}

function Step1Form({
  mode,
  initialEmail,
  topLevelError,
  isPending,
  captchaToken,
  setCaptchaToken,
  turnstileRef,
  onSubmit,
}: Step1Props) {
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

  const submitLabel =
    mode === 'reset'
      ? 'Send reset link'
      : 'Continue'

  return (
    <div className="space-y-5">
      {mode !== 'reset' && (
        <>
          <XphereGoogleButton />
          <OrDivider />
        </>
      )}

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
            ref={turnstileRef}
            onToken={(token) => {
              setCaptchaToken(token)
              setCaptchaError(null)
            }}
            onExpire={() => setCaptchaToken(null)}
          />

          <button
            type="submit"
            disabled={isPending}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitLabel}
          </button>
        </form>
      </Form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — Login (password only)
// ---------------------------------------------------------------------------

interface LoginStep2Props {
  email: string
  captchaToken: string | null
  onBack: () => void
  onForgot: () => void
  onError: (message: string) => void
}

function LoginStep2({ email, captchaToken, onBack, onForgot, onError }: LoginStep2Props) {
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<LoginPasswordValues>({
    resolver: zodResolver(loginPasswordSchema),
    defaultValues: { password: '' },
  })

  function onSubmit(values: LoginPasswordValues) {
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
        onError(result.error)
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

          <button
            type="submit"
            disabled={isPending}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
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
// Step 2 — Signup (password + confirm)
// ---------------------------------------------------------------------------

interface SignupStep2Props {
  email: string
  captchaToken: string | null
  onBack: () => void
  onError: (message: string) => void
}

function SignupStep2({ email, captchaToken, onBack, onError }: SignupStep2Props) {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<SignupPasswordValues>({
    resolver: zodResolver(signupPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  function onSubmit(values: SignupPasswordValues) {
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
      const result = await signUp(formData)
      if (result?.error) {
        onError(result.error)
      }
    })
  }

  return (
    <div className="space-y-5">
      <p className="text-center text-[0.8125rem] text-[#71717A]">
        Creating account for <span className="text-[#FAFAFA]">{email}</span>
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
                      autoComplete="new-password"
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

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem className="space-y-1.5">
                <FormLabel className={labelCls}>Confirm password</FormLabel>
                <div className="relative">
                  <FormControl>
                    <Input
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      disabled={isPending}
                      className={`${inputCls} pr-10`}
                      {...field}
                    />
                  </FormControl>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#52525B] transition-colors hover:text-[#A1A1AA]"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <FormMessage className="text-xs text-red-400" />
              </FormItem>
            )}
          />

          <button
            type="submit"
            disabled={isPending}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create account
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
// Reset-sent confirmation panel
// ---------------------------------------------------------------------------

function ResetSentPanel({ email, onBackToSignIn }: { email: string; onBackToSignIn: () => void }) {
  return (
    <div className="space-y-5 text-center">
      <div className="flex justify-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-400" aria-hidden="true" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-[1.125rem] font-semibold text-[#FAFAFA]">Check your inbox</h3>
        <p className="text-[0.875rem] text-[#A1A1AA]">
          We sent a password reset link to <span className="text-[#FAFAFA]">{email}</span>. Click it to set a new password.
        </p>
      </div>
      <button
        type="button"
        onClick={onBackToSignIn}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Back to sign in
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

export function AuthDialog({ branding, initialMode = 'login', open, onClose }: AuthDialogProps) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)
  const [topLevelError, setTopLevelError] = useState<string | null>(null)
  const [resetPending, startResetTransition] = useTransition()

  const turnstileRef = useRef<TurnstileWidgetRef>(null)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setMode(initialMode)
      setStep('email')
      setEmail('')
      setCaptchaToken(null)
      setResetSent(false)
      setTopLevelError(null)
    }
  }, [open, initialMode])

  // When initialMode changes while dialog is open, reset to Step 1 in new mode (preserve email)
  useEffect(() => {
    if (open) {
      setStep('email')
      setTopLevelError(null)
    }
  }, [initialMode, open])

  // Body scroll lock
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, handleKeyDown])

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!open || !mounted) return null

  // ----- Heading + subheading -----
  const heading =
    mode === 'login'
      ? 'Welcome back'
      : mode === 'signup'
        ? 'Create account'
        : 'Reset your password'

  const subheading =
    mode === 'login'
      ? 'Sign in to your workspace'
      : mode === 'signup'
        ? 'Get started in seconds'
        : "Enter your email and we'll send you a reset link."

  // ----- Step 1 submit handlers -----
  function handleStep1Submit(emailValue: string) {
    setEmail(emailValue)
    setTopLevelError(null)
    if (mode === 'reset') {
      // For reset, submit the server action now.
      if (!captchaToken) {
        setTopLevelError('Please complete the CAPTCHA before continuing.')
        return
      }
      startResetTransition(async () => {
        const formData = new FormData()
        formData.append('email', emailValue)
        formData.append('captchaToken', captchaToken)
        const result = await resetPassword(formData)
        if (result && 'error' in result && result.error) {
          setTopLevelError(result.error)
          turnstileRef.current?.reset()
          setCaptchaToken(null)
        } else {
          setResetSent(true)
        }
      })
    } else {
      // Login / signup: advance to Step 2 (captcha token will be reused).
      setStep('password')
    }
  }

  // ----- Step 2 error handler — reset Turnstile and return to Step 1 with banner -----
  function handleStep2Error(message: string) {
    turnstileRef.current?.reset()
    setCaptchaToken(null)
    setTopLevelError(message)
    setStep('email')
  }

  // ----- Mode switchers -----
  function switchMode(newMode: Mode, resetStep: boolean = true) {
    setMode(newMode)
    if (resetStep) setStep('email')
    setTopLevelError(null)
    setResetSent(false)
  }

  // ----- Render the step body -----
  const stepBody = (() => {
    if (mode === 'reset' && resetSent) {
      return (
        <ResetSentPanel
          email={email}
          onBackToSignIn={() => {
            setMode('login')
            setStep('email')
            setResetSent(false)
            setTopLevelError(null)
          }}
        />
      )
    }

    if (step === 'email') {
      return (
        <Step1Form
          key={`${mode}-step1-${resetSent ? 'sent' : 'form'}`}
          mode={mode}
          initialEmail={email}
          topLevelError={topLevelError}
          isPending={resetPending}
          captchaToken={captchaToken}
          setCaptchaToken={setCaptchaToken}
          turnstileRef={turnstileRef}
          onSubmit={handleStep1Submit}
        />
      )
    }

    // step === 'password'
    if (mode === 'login') {
      return (
        <LoginStep2
          email={email}
          captchaToken={captchaToken}
          onBack={() => {
            setStep('email')
            setTopLevelError(null)
          }}
          onForgot={() => {
            setMode('reset')
            setStep('email')
            setTopLevelError(null)
          }}
          onError={handleStep2Error}
        />
      )
    }
    if (mode === 'signup') {
      return (
        <SignupStep2
          email={email}
          captchaToken={captchaToken}
          onBack={() => {
            setStep('email')
            setTopLevelError(null)
          }}
          onError={handleStep2Error}
        />
      )
    }
    return null
  })()

  // ----- Render the footer (outside the card) -----
  const footer = (() => {
    if (mode === 'reset') {
      if (resetSent) return null
      return (
        <p className="text-[#71717A]">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className="font-medium text-[#FAFAFA] transition-colors hover:underline"
          >
            Back to sign in
          </button>
        </p>
      )
    }

    if (mode === 'signup') {
      return (
        <p className="text-[#71717A]">
          Already have an account?{' '}
          <button
            type="button"
            onClick={() => switchMode('login')}
            className="font-medium text-[#FAFAFA] transition-colors hover:underline"
          >
            Sign in
          </button>
        </p>
      )
    }

    // mode === 'login'
    if (step === 'email') {
      return (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => switchMode('reset')}
            className="block w-full text-[#71717A] transition-colors hover:text-[#A1A1AA]"
          >
            Forgot your password?
          </button>
          <p className="text-[#71717A]">
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className="font-medium text-[#FAFAFA] transition-colors hover:underline"
            >
              Sign up
            </button>
          </p>
        </div>
      )
    }

    // login + password step
    return (
      <p className="text-[#71717A]">
        Don&apos;t have an account?{' '}
        <button
          type="button"
          onClick={() => switchMode('signup')}
          className="font-medium text-[#FAFAFA] transition-colors hover:underline"
        >
          Sign up
        </button>
      </p>
    )
  })()

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label={heading}
    >
      <div
        className="flex w-full max-w-[400px] flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Card */}
        <div className="relative rounded-2xl border border-white/10 bg-[#08090A] p-8 shadow-2xl">
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-md p-1 text-[#52525B] transition-colors hover:text-[#A1A1AA]"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Brand */}
          <Link
            href="/"
            onClick={onClose}
            aria-label={`Go to ${branding.appName} homepage`}
            className="mb-6 flex items-center justify-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <AppIcon logoUrl={branding.logoUrl} appName={branding.appName} className="h-6 w-6" />
            <span className="text-lg font-bold tracking-tight text-[#FAFAFA]">{branding.appName}</span>
          </Link>

          {/* Heading */}
          <div className="mb-6 text-center">
            <h2 className="text-[1.5rem] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
              {heading}
            </h2>
            <p className="mt-1 text-[0.875rem] text-[#71717A]">{subheading}</p>
          </div>

          {stepBody}
        </div>

        {/* Footer — outside the card */}
        {footer && (
          <div className="space-y-1.5 text-center text-[0.8125rem]">{footer}</div>
        )}
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
