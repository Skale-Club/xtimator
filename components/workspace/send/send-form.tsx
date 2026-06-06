'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Send, CheckCircle2, Loader2, MessageSquare, MessageCircle, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { markAsSentAction } from '@/lib/actions/estimate'
import { buildShareLink } from '@/lib/utils/share-link'
import { useTranslation } from '@/lib/i18n/use-translation'

const sendEmailSchema = z.object({
  to: z.string().email('Valid email required'),
  subject: z.string().min(1, 'Subject required'),
  body: z.string().min(1, 'Message required'),
  attachPdf: z.boolean(),
})

const sendSmsSchema = z.object({
  to: z.string().regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format (e.g. +15551234567)'),
  message: z.string().optional(),
})

const sendWhatsAppSchema = z.object({
  to: z.string().regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format (e.g. +15551234567)'),
  message: z.string().optional(),
})

type SendEmailValues = z.infer<typeof sendEmailSchema>
type SendSmsValues = z.infer<typeof sendSmsSchema>
type SendWhatsAppValues = z.infer<typeof sendWhatsAppSchema>

interface SendFormProps {
  estimateId: string
  clientEmail: string | null
  clientPhone: string | null
  companyName: string
  projectName: string
  shareToken: string
  smsDeliveryEnabled: boolean
  whatsappSendEnabled?: boolean
  /** SEED-028 Phase D: disable all send/PDF actions when the estimate is a draft. */
  disabled?: boolean
}

export function SendForm({
  estimateId,
  clientEmail,
  clientPhone,
  companyName,
  projectName,
  shareToken,
  smsDeliveryEnabled,
  whatsappSendEnabled = false,
  disabled,
}: SendFormProps) {
  const { t } = useTranslation()
  const [sending, setSending] = useState(false)
  const [marking, setMarking] = useState(false)

  const shareLink = buildShareLink(shareToken)

  const channelCount = 1 + (smsDeliveryEnabled ? 1 : 0) + (whatsappSendEnabled ? 1 : 0)

  const emailForm = useForm<SendEmailValues>({
    resolver: zodResolver(sendEmailSchema) as any,
    defaultValues: {
      to: clientEmail ?? '',
      subject: `Estimate from ${companyName} - ${projectName}`,
      body: `Hi,\n\nPlease find attached the estimate for ${projectName}.\n\nYou can view the full estimate online here:\n${shareLink}\n\nIf you have any questions, please don't hesitate to reach out.\n\nBest regards,\n${companyName}`,
      attachPdf: true,
    },
  })

  const smsForm = useForm<SendSmsValues>({
    resolver: zodResolver(sendSmsSchema) as any,
    defaultValues: {
      to: clientPhone ?? '',
      message: '',
    },
  })

  const whatsappForm = useForm<SendWhatsAppValues>({
    resolver: zodResolver(sendWhatsAppSchema) as any,
    defaultValues: {
      to: clientPhone ?? '',
      message: '',
    },
  })

  async function onEmailSubmit(values: SendEmailValues) {
    setSending(true)
    try {
      const response = await fetch(`/api/estimates/${estimateId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await response.json()
      if (!response.ok) {
        toast.error(data.error ?? t('Failed to send email'))
        return
      }
      toast.success(t('Estimate sent successfully!'))
    } catch {
      toast.error(t('Failed to send email. Please try again.'))
    } finally {
      setSending(false)
    }
  }

  async function onSmsSubmit(values: SendSmsValues) {
    setSending(true)
    try {
      const response = await fetch(`/api/estimates/${estimateId}/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: values.to, message: values.message }),
      })
      const data = await response.json()
      if (!response.ok) {
        toast.error(data.error ?? 'Failed to send SMS')
        return
      }
      toast.success('Estimate sent via SMS!')
    } catch {
      toast.error('Failed to send SMS. Please try again.')
    } finally {
      setSending(false)
    }
  }

  async function onWhatsAppSubmit(values: SendWhatsAppValues) {
    setSending(true)
    try {
      const response = await fetch(`/api/estimates/${estimateId}/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: values.to, message: values.message }),
      })
      const data = await response.json()
      if (!response.ok) {
        toast.error(data.error ?? 'Failed to send via WhatsApp')
        return
      }
      toast.success(
        data.fallback === 'share_link'
          ? 'PDF unavailable — sent the share link instead.'
          : 'Estimate sent via WhatsApp!',
      )
    } catch {
      toast.error('Failed to send via WhatsApp. Please try again.')
    } finally {
      setSending(false)
    }
  }

  async function handleMarkAsSent() {
    setMarking(true)
    try {
      const result = await markAsSentAction(estimateId)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(t('Estimate marked as sent'))
    } catch {
      toast.error(t('Failed to mark as sent'))
    } finally {
      setMarking(false)
    }
  }

  return (
    <Card variant="glass">
      <CardContent className="pt-6">
        <Tabs defaultValue="email">
          <TabsList
            className="grid w-full"
            style={{ gridTemplateColumns: `repeat(${channelCount}, minmax(0, 1fr))` }}
          >
            <TabsTrigger value="email" className="gap-2">
              <Mail className="h-4 w-4" />
              Email
            </TabsTrigger>
            {smsDeliveryEnabled && (
              <TabsTrigger value="sms" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                SMS
              </TabsTrigger>
            )}
            {whatsappSendEnabled && (
              <TabsTrigger value="whatsapp" className="gap-2">
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="email" className="mt-4">
            <Form {...emailForm}>
              <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
                <FormField
                  control={emailForm.control}
                  name="to"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('To')}</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="client@example.com" autoComplete="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={emailForm.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Subject')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('Email subject')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={emailForm.control}
                  name="body"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Message')}</FormLabel>
                      <FormControl>
                        <Textarea rows={6} placeholder={t('Write your message...')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={emailForm.control}
                  name="attachPdf"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="text-sm font-normal">
                        {t('Attach PDF to email')}
                      </FormLabel>
                    </FormItem>
                  )}
                />
                <Button type="submit" variant="primary" size="lg" className="w-full" disabled={sending || disabled}>
                  {sending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {sending ? t('Sending...') : t('Send Email')}
                </Button>
              </form>
            </Form>
          </TabsContent>

          {smsDeliveryEnabled && (
            <TabsContent value="sms" className="mt-4">
              <Form {...smsForm}>
                <form onSubmit={smsForm.handleSubmit(onSmsSubmit)} className="space-y-4">
                  <FormField
                    control={smsForm.control}
                    name="to"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone number</FormLabel>
                        <FormControl>
                          <PhoneInput
                            value={field.value ?? ''}
                            onChange={(formatted) => {
                              // Schema requires E.164 — strip mask chars before storing
                              field.onChange(formatted.replace(/[^\d+]/g, ''))
                            }}
                            placeholder="+15551234567"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={smsForm.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custom message (optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            rows={3}
                            placeholder={`${companyName} sent you an estimate. Review and approve it here: ${shareLink}`}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" variant="primary" size="lg" className="w-full" disabled={sending || disabled}>
                    {sending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <MessageSquare className="mr-2 h-4 w-4" />
                    )}
                    {sending ? 'Sending...' : 'Send SMS'}
                  </Button>
                </form>
              </Form>
            </TabsContent>
          )}

          {whatsappSendEnabled && (
            <TabsContent value="whatsapp" className="mt-4">
              <Form {...whatsappForm}>
                <form onSubmit={whatsappForm.handleSubmit(onWhatsAppSubmit)} className="space-y-4">
                  <FormField
                    control={whatsappForm.control}
                    name="to"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone number</FormLabel>
                        <FormControl>
                          <PhoneInput
                            value={field.value ?? ''}
                            onChange={(formatted) => {
                              field.onChange(formatted.replace(/[^\d+]/g, ''))
                            }}
                            placeholder="+15551234567"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={whatsappForm.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custom message (optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            rows={3}
                            placeholder={`${companyName} sent you an estimate. Review and approve it here: ${shareLink}`}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    Delivery format (share link, formatted text, or PDF) follows your WhatsApp
                    setting in Settings → Integrations.
                  </p>
                  <Button type="submit" variant="primary" size="lg" className="w-full" disabled={sending || disabled}>
                    {sending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <MessageCircle className="mr-2 h-4 w-4" />
                    )}
                    {sending ? 'Sending...' : 'Send WhatsApp'}
                  </Button>
                </form>
              </Form>
            </TabsContent>
          )}
        </Tabs>

        <Separator className="my-4" />

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {t('Delivering in person? Mark the estimate as sent without emailing.')}
          </p>
          <Button variant="outline" className="w-full" onClick={handleMarkAsSent} disabled={marking || disabled}>
            {marking ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            {marking ? t('Updating...') : t('Mark as Sent')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
