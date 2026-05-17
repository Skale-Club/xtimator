'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Send, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { markAsSentAction } from '@/lib/actions/estimate'

const sendSchema = z.object({
  to: z.string().email('Valid email required'),
  subject: z.string().min(1, 'Subject required'),
  body: z.string().min(1, 'Message required'),
  attachPdf: z.boolean(),
})

type SendFormValues = z.infer<typeof sendSchema>

interface SendFormProps {
  estimateId: string
  clientEmail: string | null
  companyName: string
  projectName: string
  shareToken: string
}

export function SendForm({
  estimateId,
  clientEmail,
  companyName,
  projectName,
  shareToken,
}: SendFormProps) {
  const [sending, setSending] = useState(false)
  const [marking, setMarking] = useState(false)

  const shareLink = typeof window !== 'undefined'
    ? `${window.location.origin}/estimate/${shareToken}`
    : `/estimate/${shareToken}`

  const form = useForm<SendFormValues>({
    resolver: zodResolver(sendSchema) as any,
    defaultValues: {
      to: clientEmail ?? '',
      subject: `Estimate from ${companyName} - ${projectName}`,
      body: `Hi,\n\nPlease find attached the estimate for ${projectName}.\n\nYou can view the full estimate online here:\n${shareLink}\n\nIf you have any questions, please don't hesitate to reach out.\n\nBest regards,\n${companyName}`,
      attachPdf: true,
    },
  })

  async function onSubmit(values: SendFormValues) {
    setSending(true)
    try {
      const response = await fetch(`/api/estimates/${estimateId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error ?? 'Failed to send email')
        return
      }

      toast.success('Estimate sent successfully!')
    } catch {
      toast.error('Failed to send email. Please try again.')
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
      toast.success('Estimate marked as sent')
    } catch {
      toast.error('Failed to mark as sent')
    } finally {
      setMarking(false)
    }
  }

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="text-lg">Send Estimate</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="to"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>To</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="client@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <FormControl>
                    <Input placeholder="Email subject" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={6}
                      placeholder="Write your message..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="attachPdf"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="text-sm font-normal">
                    Attach PDF to email
                  </FormLabel>
                </FormItem>
              )}
            />

            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={sending}>
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {sending ? 'Sending...' : 'Send Email'}
            </Button>
          </form>
        </Form>

        <Separator className="my-4" />

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Delivering in person? Mark the estimate as sent without emailing.
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={handleMarkAsSent}
            disabled={marking}
          >
            {marking ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            {marking ? 'Updating...' : 'Mark as Sent'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
