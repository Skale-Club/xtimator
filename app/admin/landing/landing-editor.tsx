'use client'

import { useTransition } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import { landingContentSchema, type LandingContentInput } from '@/lib/schemas/admin'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

import { saveLandingContent } from './actions'

interface LandingEditorProps {
  initial: LandingContentInput
}

export function LandingEditor({ initial }: LandingEditorProps) {
  const [isPending, startTransition] = useTransition()

  const form = useForm<LandingContentInput>({
    resolver: zodResolver(landingContentSchema) as never,
    defaultValues: initial,
  })

  const stepsArray = useFieldArray({ control: form.control, name: 'howItWorksSteps' })
  const featuresArray = useFieldArray({ control: form.control, name: 'features' })

  function onSubmit(values: LandingContentInput) {
    startTransition(async () => {
      const result = await saveLandingContent(values)
      if (result.ok) {
        toast.success('Landing page updated.')
      } else {
        toast.error(result.message)
      }
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">

        {/* Hero section */}
        <details open className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-semibold">Hero</summary>
          <div className="mt-4 flex flex-col gap-4">
            <FormField
              control={form.control}
              name="heroHeadline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Headline</FormLabel>
                  <FormControl>
                    <Input placeholder="Professional estimates in 5 minutes." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="heroSubheadline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subheadline</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Record a site walkthrough..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ctaLabel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CTA Button Label</FormLabel>
                  <FormControl>
                    <Input placeholder="Start free" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </details>

        {/* How It Works section */}
        <details open className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-semibold">How It Works</summary>
          <div className="mt-4 flex flex-col gap-6">
            {stepsArray.fields.map((field, index) => (
              <div key={field.id} className="rounded-md border border-border/50 p-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Step {index + 1}</p>
                <div className="flex flex-col gap-3">
                  <FormField
                    control={form.control}
                    name={`howItWorksSteps.${index}.eyebrow`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel>Eyebrow</FormLabel>
                        <FormControl>
                          <Input placeholder={`Step ${index + 1}`} {...f} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`howItWorksSteps.${index}.title`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input placeholder="Step title" {...f} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`howItWorksSteps.${index}.description`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea rows={2} placeholder="Step description" {...f} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            ))}
          </div>
        </details>

        {/* Features section */}
        <details open className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-semibold">Features</summary>
          <div className="mt-4 flex flex-col gap-6">
            {featuresArray.fields.map((field, index) => (
              <div key={field.id} className="rounded-md border border-border/50 p-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Feature {index + 1}</p>
                <div className="flex flex-col gap-3">
                  <FormField
                    control={form.control}
                    name={`features.${index}.icon`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel>Icon</FormLabel>
                        <FormControl>
                          <Input readOnly disabled {...f} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`features.${index}.title`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input placeholder="Feature title" {...f} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`features.${index}.description`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea rows={2} placeholder="Feature description" {...f} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`features.${index}.benefit`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel>Benefit Tag</FormLabel>
                        <FormControl>
                          <Input placeholder="Benefit label" {...f} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            ))}
          </div>
        </details>

        <div>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save landing page
          </Button>
        </div>
      </form>
    </Form>
  )
}
