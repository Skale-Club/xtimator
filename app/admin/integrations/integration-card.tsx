'use client'

import { useState, useTransition } from 'react'
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

interface IntegrationCardProps {
  provider: IntegrationProvider
  title: string
  description: string
  initial: IntegrationCardInitial
}

export function IntegrationCard({
  provider,
  title,
  description,
  initial,
}: IntegrationCardProps) {
  const [isSaving, startSaving] = useTransition()
  const [isDeleting, startDeleting] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { t } = useTranslation()

  const form = useForm<IntegrationKeyInput>({
    resolver: zodResolver(integrationKeySchema),
    defaultValues: { provider, apiKey: '' },
  })

  const isConfigured = initial.configured
  const last4 = isConfigured ? initial.last4 : null
  const apiKeyDraft = form.watch('apiKey')?.trim() ?? ''
  const hasUnsavedKey = apiKeyDraft.length >= 10
  const canTest = isConfigured || hasUnsavedKey

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
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant={isConfigured ? 'default' : 'secondary'}>
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
            {saveError && (
              <Alert variant="destructive">
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            )}
            <div className="flex items-center gap-3">
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
