'use client'

import { useRef, useState, useTransition, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, X } from 'lucide-react'
import { AppIcon } from '@/components/ui/app-icon'
import { TurnstileWidget, type TurnstileWidgetRef } from '@/components/auth/turnstile-widget'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { signIn, signUp } from '@/lib/actions/auth'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
})

const signupSchema = z
  .object({
    email: z.string().email('Please enter a valid email address.'),
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })

type LoginValues = z.infer<typeof loginSchema>
type SignupValues = z.infer<typeof signupSchema>

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

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
  'h-10 border border-white/10 bg-white/[0.04] text-[#FAFAFA] placeholder:text-[#3F3F46] focus-visible:ring-indigo-500/40 focus-visible:border-indigo-500/50 focus-visible:ring-1 rounded-md px-3 text-sm w-full outline-none transition-colors'

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
// Login form
// ---------------------------------------------------------------------------

function LoginForm({
  onSwitchMode,
  onClose,
}: {
  onSwitchMode: () => void
  onClose: () => void
}) {
  const router = useRouter()
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
    <div className="space-y-5">
      <XphereGoogleButton />
      <OrDivider />

      {formError && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/[0.08] p-3 text-sm text-red-400">
          {formError}
        </p>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

          <TurnstileWidget
            ref={turnstileRef}
            onToken={setCaptchaToken}
            onExpire={() => setCaptchaToken(null)}
          />

          <button
            type="submit"
            disabled={isPending || !captchaToken}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-indigo-600 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:pointer-events-none disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </button>
        </form>
      </Form>

      <div className="space-y-2 text-center text-[0.8125rem]">
        <button
          type="button"
          onClick={() => {
            onClose()
            router.push('/reset-password')
          }}
          className="block w-full text-[#71717A] transition-colors hover:text-[#A1A1AA]"
        >
          Forgot password?
        </button>
        <p className="text-[#71717A]">
          Don&apos;t have an account?{' '}
          <button
            type="button"
            onClick={onSwitchMode}
            className="font-medium text-[#FAFAFA] transition-colors hover:text-white hover:underline"
          >
            Sign up
          </button>
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Signup form
// ---------------------------------------------------------------------------

function SignupForm({ onSwitchMode }: { onSwitchMode: () => void }) {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const turnstileRef = useRef<TurnstileWidgetRef>(null)

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  })

  function onSubmit(values: SignupValues) {
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
      const result = await signUp(formData)
      if (result?.error) {
        setFormError(result.error)
        turnstileRef.current?.reset()
        setCaptchaToken(null)
      }
    })
  }

  return (
    <div className="space-y-5">
      <XphereGoogleButton />
      <OrDivider />

      {formError && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/[0.08] p-3 text-sm text-red-400">
          {formError}
        </p>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

          <TurnstileWidget
            ref={turnstileRef}
            onToken={setCaptchaToken}
            onExpire={() => setCaptchaToken(null)}
          />

          <button
            type="submit"
            disabled={isPending || !captchaToken}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-indigo-600 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:pointer-events-none disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create account
          </button>
        </form>
      </Form>

      <p className="text-center text-[0.8125rem] text-[#71717A]">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitchMode}
          className="font-medium text-[#FAFAFA] transition-colors hover:text-white hover:underline"
        >
          Sign in
        </button>
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

export function AuthDialog({ branding, initialMode = 'login', open, onClose }: AuthDialogProps) {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode)

  // Sync mode when initialMode changes (e.g. user clicks "Log in" then "Start free")
  useEffect(() => {
    if (open) setMode(initialMode)
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

  // Escape key to close
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

  if (!open) return null

  const isLogin = mode === 'login'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label={isLogin ? 'Sign in' : 'Create account'}
    >
      {/* Card — stop propagation so clicks inside don't close the modal */}
      <div
        className="relative w-full max-w-[400px] rounded-2xl border border-white/10 bg-[#08090A] p-8 shadow-2xl transition-all duration-200"
        onClick={(e) => e.stopPropagation()}
      >
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
        <div className="mb-6 flex items-center gap-2">
          <AppIcon logoUrl={branding.logoUrl} appName={branding.appName} className="h-6 w-6" />
          <span className="text-sm font-semibold text-[#FAFAFA]">{branding.appName}</span>
        </div>

        {/* Heading */}
        <div className="mb-6">
          <h2 className="text-[1.5rem] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
            {isLogin ? 'Welcome back' : 'Create account'}
          </h2>
          <p className="mt-1 text-[0.875rem] text-[#71717A]">
            {isLogin ? 'Sign in to your workspace' : 'Start your free trial'}
          </p>
        </div>

        {/* Forms — key forces TurnstileWidget remount on mode switch */}
        {isLogin ? (
          <LoginForm
            key={open ? 'login-active' : 'login-inactive'}
            onSwitchMode={() => setMode('signup')}
            onClose={onClose}
          />
        ) : (
          <SignupForm
            key={open ? 'signup-active' : 'signup-inactive'}
            onSwitchMode={() => setMode('login')}
          />
        )}
      </div>
    </div>
  )
}
