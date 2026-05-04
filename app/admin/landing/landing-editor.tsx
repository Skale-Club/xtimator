'use client'

import { useTransition, useState } from 'react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

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
  const [activeStep, setActiveStep] = useState(0)
  const [activeFeature, setActiveFeature] = useState(0)

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
        <Tabs defaultValue="hero" className="w-full gap-5">
          <div className="border-b border-border">
            <TabsList variant="line" className="w-auto h-auto bg-transparent p-0 gap-0 rounded-none justify-start">
              {(['hero', 'how-it-works', 'features'] as const).map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-4 py-3 gap-2 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:border-primary dark:data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:bg-transparent dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-foreground after:hidden transition-colors"
                >
                  {{ hero: 'Hero', 'how-it-works': 'How It Works', features: 'Features' }[tab]}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Hero */}
          <TabsContent value="hero" className="mt-0 flex flex-col gap-4">
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
                    <Textarea rows={4} placeholder="Record a site walkthrough..." {...field} />
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
          </TabsContent>

          {/* How It Works */}
          <TabsContent value="how-it-works" className="mt-0 flex flex-col gap-4">
            <div className="flex gap-1">
              {stepsArray.fields.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setActiveStep(index)}
                  className={`h-7 w-7 rounded-md border text-xs font-semibold transition-colors ${
                    activeStep === index
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
            {stepsArray.fields.map((field, index) => (
              index === activeStep && (
                <div key={field.id} className="flex flex-col gap-4">
                  <FormField control={form.control} name={`howItWorksSteps.${index}.eyebrow`}
                    render={({ field: f }) => (
                      <FormItem><FormLabel>Eyebrow</FormLabel><FormControl><Input placeholder={`Step ${index + 1}`} {...f} /></FormControl><FormMessage /></FormItem>
                    )} />
                  <FormField control={form.control} name={`howItWorksSteps.${index}.title`}
                    render={({ field: f }) => (
                      <FormItem><FormLabel>Title</FormLabel><FormControl><Input placeholder="Step title" {...f} /></FormControl><FormMessage /></FormItem>
                    )} />
                  <FormField control={form.control} name={`howItWorksSteps.${index}.description`}
                    render={({ field: f }) => (
                      <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea rows={3} placeholder="Step description" {...f} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
              )
            ))}
          </TabsContent>

          {/* Features */}
          <TabsContent value="features" className="mt-0 flex flex-col gap-4">
            <div className="flex gap-1">
              {featuresArray.fields.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setActiveFeature(index)}
                  className={`h-7 w-7 rounded-md border text-xs font-semibold transition-colors ${
                    activeFeature === index
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
            {featuresArray.fields.map((field, index) => (
              index === activeFeature && (
                <div key={field.id} className="flex flex-col gap-4">
                  <FormField control={form.control} name={`features.${index}.title`}
                    render={({ field: f }) => (
                      <FormItem><FormLabel>Title</FormLabel><FormControl><Input placeholder="Feature title" {...f} /></FormControl><FormMessage /></FormItem>
                    )} />
                  <FormField control={form.control} name={`features.${index}.description`}
                    render={({ field: f }) => (
                      <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea rows={3} placeholder="Feature description" {...f} /></FormControl><FormMessage /></FormItem>
                    )} />
                  <FormField control={form.control} name={`features.${index}.benefit`}
                    render={({ field: f }) => (
                      <FormItem><FormLabel>Benefit Tag</FormLabel><FormControl><Input placeholder="Benefit label" {...f} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
              )
            ))}
          </TabsContent>
        </Tabs>

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
