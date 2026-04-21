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

  const form = useForm<IntegrationKeyInput>({
    resolver: zodResolver(integrationKeySchema),
    defaultValues: { provider, apiKey: '' },
  })

  const isConfigured = initial.configured
  const last4 = isConfigured ? initial.last4 : null

  function onSubmit(values: IntegrationKeyInput) {
    setSaveError(null)
    startSaving(async () => {
      const result = await saveIntegrationKey(values)
      if (!result.ok) {
        setSaveError(result.message)
        toast.error(`Couldn't save ${title} key.`)
        return
      }
      toast.success(`${title} key saved.`)
      form.reset({ provider, apiKey: '' })
    })
  }

  function onDelete() {
    startDeleting(async () => {
      const result = await deleteIntegrationKey({ provider })
      if (!result.ok) {
        toast.error(`Couldn't remove ${title} key.`)
        return
      }
      toast.success(`${title} key removed.`)
      setConfirmOpen(false)
    })
  }

  return (
    <Card className="max-w-[560px]">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant={isConfigured ? 'default' : 'secondary'}>
            {isConfigured ? 'Connected' : 'Not configured'}
          </Badge>
        </div>
        <CardDescription>{description}</CardDescription>
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
                  <FormLabel>API key</FormLabel>
                  <FormControl>
                    <MaskedKeyInput
                      placeholder={`Paste your ${title} API key`}
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
                {isSaving ? 'Saving\u2026' : 'Save key'}
              </Button>
              <TestButton
                disabled={!isConfigured}
                onRun={() => testIntegrationKey({ provider })}
              />
            </div>
          </form>
        </Form>
      </CardContent>
      {isConfigured && (
        <CardFooter className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Last updated by{' '}
            <span className="text-foreground">
              {initial.updatedByEmail || 'unknown'}
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
                <Trash2 className="h-3 w-3" /> Delete key
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {title} key?</AlertDialogTitle>
                <AlertDialogDescription>
                  Features that use this provider will stop working immediately.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>
                  Cancel
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
                  Delete key
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      )}
    </Card>
  )
}
