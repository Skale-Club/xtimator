'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { Loader2, MessageSquare, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  requestWhatsAppVerification,
  confirmWhatsAppVerification,
  disconnectWhatsApp,
  updateDeliveryFormat,
} from '@/lib/actions/whatsapp-settings'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

const connectSchema = z.object({
  phoneNumber: z
    .string()
    .regex(/^\+\d{7,15}$/, 'Must be E.164 format, e.g. +15551234567'),
  phoneNumberId: z.string().min(1, 'Required'),
  wabaId: z.string().min(1, 'Required'),
})

type ConnectFormValues = z.infer<typeof connectSchema>

export type WhatsAppStatus = {
  phoneNumber: string
  phoneNumberId: string
  wabaId: string
  status: string
  deliveryFormat: 'share_link' | 'formatted_text' | 'pdf_attachment'
} | null

interface WhatsAppConnectCardProps {
  initial: WhatsAppStatus
}

export function WhatsAppConnectCard({ initial }: WhatsAppConnectCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [current, setCurrent] = useState(initial)

  const form = useForm<ConnectFormValues>({
    resolver: zodResolver(connectSchema),
    defaultValues: {
      phoneNumber: '',
      phoneNumberId: '',
      wabaId: '',
    },
  })

  const [verificationCode, setVerificationCode] = useState('')

  function onConnect(values: ConnectFormValues) {
    startTransition(async () => {
      const result = await requestWhatsAppVerification(values)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setCurrent({
        phoneNumber: values.phoneNumber,
        phoneNumberId: values.phoneNumberId,
        wabaId: values.wabaId,
        status: 'pending',
        deliveryFormat: 'share_link',
      })
      toast.success(`Verification code sent to ${values.phoneNumber} via WhatsApp.`)
      router.refresh()
    })
  }

  function onVerifyCode() {
    const code = verificationCode.trim()
    if (code.length !== 6) {
      toast.error('Please enter the 6-digit code.')
      return
    }
    startTransition(async () => {
      const result = await confirmWhatsAppVerification(code)
      if (!result.ok) {
        toast.error(result.error)
        // If the action wiped the row (too many attempts / expired), reset UI
        if (
          result.error.includes('start over') ||
          result.error.includes('Too many') ||
          result.error.includes('expired')
        ) {
          setCurrent(null)
          setVerificationCode('')
        }
        return
      }
      if (current) {
        setCurrent({ ...current, status: 'active' })
      }
      setVerificationCode('')
      toast.success('WhatsApp number verified and active.')
      router.refresh()
    })
  }

  function onDisconnect() {
    startTransition(async () => {
      const result = await disconnectWhatsApp()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setCurrent(null)
      form.reset()
      toast.success('WhatsApp number disconnected.')
      router.refresh()
    })
  }

  function onFormatChange(value: string) {
    const format = value as 'share_link' | 'formatted_text' | 'pdf_attachment'
    startTransition(async () => {
      const result = await updateDeliveryFormat(format)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (current) setCurrent({ ...current, deliveryFormat: format })
      toast.success('Delivery format updated.')
    })
  }

  return (
    <Card className="w-full rounded-[var(--radius-md)]">
      <CardHeader className="border-b border-border">
        <div className="flex items-start gap-3">
          <MessageSquare className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle>WhatsApp</CardTitle>
            <CardDescription>
              Connect a WhatsApp Business number so clients can send voice notes and
              photos and receive estimates via WhatsApp.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="py-6 space-y-6">
        {current && current.status === 'pending' ? (
          <div className="space-y-4">
            <div className="text-sm">
              <p className="font-medium">
                Verification code sent to <strong>{current.phoneNumber}</strong>
              </p>
              <p className="text-muted-foreground mt-1">
                Check WhatsApp on that number and enter the 6-digit code below.
                The code expires in 10 minutes.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="verification-code">
                Verification code
              </label>
              <Input
                id="verification-code"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="123456"
                className="w-40 text-center tracking-widest text-lg"
                value={verificationCode}
                onChange={(e) =>
                  setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                disabled={isPending}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={onVerifyCode}
                disabled={isPending || verificationCode.length !== 6}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify
              </Button>
              <Button
                variant="outline"
                onClick={onDisconnect}
                disabled={isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : current ? (
          <>
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                Connected: <strong>{current.phoneNumber}</strong>{' '}
                <span className="text-muted-foreground">({current.status})</span>
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Estimate delivery format</label>
              <Select
                value={current.deliveryFormat}
                onValueChange={onFormatChange}
                disabled={isPending}
              >
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="share_link">Share link (recommended)</SelectItem>
                  <SelectItem value="formatted_text">Formatted text (inline)</SelectItem>
                  <SelectItem value="pdf_attachment">PDF attachment</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Share link sends a URL to the estimate page. Formatted text sends the
                full breakdown inline. PDF attachment sends a branded PDF document —
                falls back to share link if generation fails.
              </p>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isPending}>
                  Disconnect
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect WhatsApp?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Inbound WhatsApp messages will no longer create estimates.
                    This action can be reversed by reconnecting.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDisconnect}>Disconnect</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onConnect)} className="space-y-4">
              <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone number</FormLabel>
                    <FormControl>
                      <Input placeholder="+15551234567" {...field} />
                    </FormControl>
                    <FormDescription>E.164 format including country code.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phoneNumberId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number ID</FormLabel>
                    <FormControl>
                      <Input placeholder="123456789012345" {...field} />
                    </FormControl>
                    <FormDescription>
                      Found in Meta Business Suite → WhatsApp → API Setup.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="wabaId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp Business Account ID</FormLabel>
                    <FormControl>
                      <Input placeholder="123456789012345" {...field} />
                    </FormControl>
                    <FormDescription>
                      Your WABA ID from Meta Business Suite.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={isPending} className="min-w-40">
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send verification code
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  )
}
