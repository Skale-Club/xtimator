'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { Loader2, MessageSquare, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  connectWhatsApp,
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
  deliveryFormat: 'share_link' | 'formatted_text'
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

  function onConnect(values: ConnectFormValues) {
    startTransition(async () => {
      const result = await connectWhatsApp(values)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setCurrent({
        phoneNumber: values.phoneNumber,
        phoneNumberId: values.phoneNumberId,
        wabaId: values.wabaId,
        status: 'active',
        deliveryFormat: 'share_link',
      })
      toast.success('WhatsApp number connected.')
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
    const format = value as 'share_link' | 'formatted_text'
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
        {current ? (
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
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Share link sends a URL to the estimate page. Formatted text sends the
                full breakdown inline in the WhatsApp message.
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
                Connect
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  )
}
