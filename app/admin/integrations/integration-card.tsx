'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

import {
  integrationKeySchema,
  type IntegrationKeyInput,
} from '@/lib/schemas/admin'
import type { IntegrationProvider } from '@/lib/platform-config'

import { Input } from '@/components/ui/input'
import { MaskedKeyInput } from './masked-key-input'
import { TestButton } from './test-button'
import {
  saveIntegrationKey,
  deleteIntegrationKey,
  testIntegrationKey,
} from './actions'
import { useTranslation } from '@/lib/i18n/use-translation'

export type IntegrationCardInitial =
  | { configured: false }
  | {
      configured: true
      last4: string
      updatedAt: string
      updatedByEmail: string
    }

/**
 * One input of a COMPOSITE key. Some providers' credential is really two values
 * the admin copies from two different places (Twilio: Account SID + Auth Token).
 * Cramming them into one box and asking the admin to type the ':' themselves is
 * a paste error waiting to happen — it produced a real "Key must be in
 * AccountSid:AuthToken format" failure during a live credential rotation.
 *
 * This ONLY splits the input. The parts are joined with KEY_PART_SEPARATOR into
 * the same single string that was always stored, so the server action, the
 * encrypted storage format and getTwilioConfig() are all untouched.
 */
export interface IntegrationKeyPart {
  /** Stable id — React key + test hook. */
  id: string
  label: string
  placeholder?: string
  /** Masked input + last4 hint (the actual secret half). Plain input otherwise. */
  secret?: boolean
  helpText?: string
}

/** The stored key joins its parts with this. Matches actions.ts's `key.split(':')`. */
const KEY_PART_SEPARATOR = ':'

interface IntegrationCardProps {
  provider: IntegrationProvider
  title: string
  description: string
  initial: IntegrationCardInitial
  /**
   * When present, the single API-key box is replaced by one input per part.
   * Omit (every other provider) → single-field behavior is unchanged.
   */
  keyParts?: ReadonlyArray<IntegrationKeyPart>
}

export function IntegrationCard({
  provider,
  title,
  description,
  initial,
  keyParts,
}: IntegrationCardProps) {
  const [isSaving, startSaving] = useTransition()
  const [isDeleting, startDeleting] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { t } = useTranslation()
  const router = useRouter()

  const form = useForm<IntegrationKeyInput>({
    resolver: zodResolver(integrationKeySchema),
    defaultValues: { provider, apiKey: '' },
  })

  const isConfigured = initial.configured
  const last4 = isConfigured ? initial.last4 : null
  const apiKeyDraft = form.watch('apiKey')?.trim() ?? ''
  const hasUnsavedKey = apiKeyDraft.length >= 10
  const canTest = isConfigured || hasUnsavedKey

  // Composite-key drafts. `apiKey` stays the single source of truth for submit
  // and Test — these only feed it.
  const [parts, setParts] = useState<string[]>(() => (keyParts ?? []).map(() => ''))

  function updatePart(index: number, value: string) {
    const next = [...parts]
    next[index] = value
    setParts(next)
    // All-blank stays blank so "leave blank to keep the existing key" survives.
    // A partially-filled pair still joins, so the server's own
    // "Key must be in AccountSid:AuthToken format" check reports it verbatim.
    const joined = next.some((p) => p.trim())
      ? next.map((p) => p.trim()).join(KEY_PART_SEPARATOR)
      : ''
    // NOT shouldValidate: validating on every keystroke fired "API key is
    // required" the instant a field was cleared, and the inserted message
    // shifted Save/Test down mid-click. handleSubmit validates on submit —
    // same as the single-field branch has always behaved.
    form.setValue('apiKey', joined, { shouldDirty: true })
  }

  function onSubmit(values: IntegrationKeyInput) {
    setSaveError(null)
    startSaving(async () => {
      const result = await saveIntegrationKey(values)
      if (!result.ok) {
        setSaveError(result.message)
        toast.error(`${t("Couldn't save")} ${title} ${t('key.')}`)
        return
      }
      toast.success(`${title} ${t('key saved.')}`)
      form.reset({ provider, apiKey: '' })
      setParts((prev) => prev.map(() => ''))
      // The "Connected" badge and the filled-dots placeholder both derive from
      // the `initial` prop passed down from the server component. revalidatePath
      // (inside saveIntegrationKey) only marks that data stale for the NEXT
      // request — an already-mounted client component won't pick it up without
      // this refresh, so right after saving the badge stayed gray and the input
      // fell back to the plain "Paste your..." placeholder instead of showing
      // the saved key as configured.
      router.refresh()
    })
  }

  function onDelete() {
    startDeleting(async () => {
      const result = await deleteIntegrationKey({ provider })
      if (!result.ok) {
        toast.error(`${t("Couldn't remove")} ${title} ${t('key.')}`)
        return
      }
      toast.success(`${title} ${t('key removed.')}`)
      setConfirmOpen(false)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge
            variant="outline"
            className={
              isConfigured
                ? 'border-[hsl(var(--success)/0.35)] bg-[hsl(var(--success)/0.14)] text-[hsl(var(--success))]'
                : 'border-border bg-muted/50 text-muted-foreground'
            }
          >
            {isConfigured ? t('Connected') : t('Not configured')}
          </Badge>
        </div>
        <CardDescription>{t(description)}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            {keyParts?.length ? (
              <div className="flex flex-col gap-4">
                {keyParts.map((part, index) => (
                  <FormItem key={part.id}>
                    <FormLabel>{t(part.label)}</FormLabel>
                    <FormControl>
                      {part.secret ? (
                        // last4 belongs to the secret half — it's the tail of the
                        // stored ':'-joined key.
                        //
                        // autoComplete="new-password", NOT "off": MaskedKeyInput
                        // renders type="password", and a text input followed by a
                        // password input is the exact shape Chrome reads as a login
                        // form — it ignored "off" and autofilled the saved account
                        // email into Account SID plus a saved password here, which
                        // Twilio then rejected with "20003 invalid username".
                        // "new-password" marks it as a set-a-new-secret field, which
                        // Chrome does not fill from saved credentials.
                        <MaskedKeyInput
                          name={`${provider}-${part.id}`}
                          placeholder={part.placeholder ?? ''}
                          initialLast4={last4}
                          autoComplete="new-password"
                          spellCheck={false}
                          disabled={isSaving}
                          data-1p-ignore
                          data-lpignore="true"
                          value={parts[index] ?? ''}
                          onChange={(e) => updatePart(index, e.target.value)}
                        />
                      ) : (
                        <Input
                          name={`${provider}-${part.id}`}
                          placeholder={part.placeholder ?? ''}
                          autoComplete="off"
                          spellCheck={false}
                          disabled={isSaving}
                          className="min-h-[44px]"
                          data-1p-ignore
                          data-lpignore="true"
                          value={parts[index] ?? ''}
                          onChange={(e) => updatePart(index, e.target.value)}
                        />
                      )}
                    </FormControl>
                    {part.helpText && (
                      <p className="text-xs text-muted-foreground">{t(part.helpText)}</p>
                    )}
                  </FormItem>
                ))}
                {/* The joined value is what actually validates/submits. */}
                <FormField
                  control={form.control}
                  name="apiKey"
                  render={() => <FormMessage />}
                />
              </div>
            ) : (
              <FormField
                control={form.control}
                name="apiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('API key')}</FormLabel>
                    <FormControl>
                      <MaskedKeyInput
                        placeholder={`${t('Paste your')} ${title} ${t('API key')}`}
                        initialLast4={last4}
                        autoComplete="off"
                        spellCheck={false}
                        disabled={isSaving}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {saveError && (
              <Alert variant="destructive">
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            )}
            {/* items-start (not items-center): when the Test result Alert appears
                below the Test button, the column grows — items-center would
                re-center and SHIFT the buttons. Top-anchoring keeps Save/Test put. */}
            <div className="flex items-start gap-3">
              <Button
                type="submit"
                disabled={isSaving}
                className="min-h-[44px]"
              >
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {isSaving ? t('Saving\u2026') : t('Save key')}
              </Button>
              <TestButton
                disabled={!canTest}
                onRun={() =>
                  testIntegrationKey({
                    provider,
                    ...(hasUnsavedKey ? { key: apiKeyDraft } : {}),
                  })
                }
              />
            </div>
          </form>
        </Form>
      </CardContent>
      {isConfigured && (
        <CardFooter className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {t('Last updated by')}{' '}
            <span className="text-foreground">
              {initial.updatedByEmail || t('unknown')}
            </span>
            ,{' '}
            {(() => {
              try {
                return formatDistanceToNow(new Date(initial.updatedAt), {
                  addSuffix: true,
                })
              } catch {
                return initial.updatedAt
              }
            })()}
          </span>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-destructive hover:underline disabled:opacity-50"
                disabled={isDeleting}
              >
                <Trash2 className="h-3 w-3" /> {t('Delete key')}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('Delete')} {title} {t('key?')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('Features that use this provider will stop working immediately.')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>
                  {t('Cancel')}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault()
                    onDelete()
                  }}
                  disabled={isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t('Delete key')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      )}
    </Card>
  )
}
