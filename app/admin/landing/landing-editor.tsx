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
import { useTranslation } from '@/lib/i18n/use-translation'
import { HeroImageUploader } from '@/components/admin/hero-image-uploader'
import { StepImageUploader } from '@/components/admin/step-image-uploader'

interface LandingEditorProps {
  initial: LandingContentInput
}

export function LandingEditor({ initial }: LandingEditorProps) {
  const [isPending, startTransition] = useTransition()
  const { t } = useTranslation()

  const form = useForm<LandingContentInput>({
    resolver: zodResolver(landingContentSchema) as never,
    defaultValues: initial,
  })

  const stepsArray = useFieldArray({ control: form.control, name: 'howItWorksSteps' })
  const featuresArray = useFieldArray({ control: form.control, name: 'features' })
  const [activeStep, setActiveStep] = useState(0)
  const [activeFeature, setActiveFeature] = useState(0)

  // Hero image upload state — file is sent as FormData on submit; the
  // persisted URL only updates after the server completes the upload.
  const [heroImagePreview, setHeroImagePreview] = useState<string | null>(
    initial.heroImageUrl ?? null
  )
  const [heroImageFile, setHeroImageFile] = useState<File | null>(null)
  const [heroImageRemoved, setHeroImageRemoved] = useState(false)

  // Per-step image state (3 steps)
  const [stepImages, setStepImages] = useState<Array<{ file: File | null; removed: boolean }>>(
    () => (initial.howItWorksSteps ?? []).map(() => ({ file: null, removed: false }))
  )
  // CDN URLs for each step — the only source of truth for what's actually saved.
  // Never holds blob: URLs so the payload is always clean.
  const [currentStepUrls, setCurrentStepUrls] = useState<Array<string | null>>(
    () => (initial.howItWorksSteps ?? []).map(s => s.imageUrl ?? null)
  )
  // Incrementing key forces StepImageUploader remount after save, clearing local blob previews.
  const [stepUploaderKey, setStepUploaderKey] = useState(0)

  function handleHeroImageSelect(file: File, preview: string) {
    setHeroImageFile(file)
    setHeroImagePreview(preview)
    setHeroImageRemoved(false)
  }

  function handleHeroImageRemove() {
    setHeroImageFile(null)
    setHeroImagePreview(null)
    setHeroImageRemoved(true)
  }

  function handleStepImageSelect(index: number, file: File) {
    setStepImages(prev => prev.map((s, i) => i === index ? { file, removed: false } : s))
  }

  function handleStepImageRemove(index: number) {
    setStepImages(prev => prev.map((s, i) => i === index ? { file: null, removed: true } : s))
    setCurrentStepUrls(prev => prev.map((url, i) => i === index ? null : url))
  }

  function onSubmit(values: LandingContentInput) {
    startTransition(async () => {
      const fd = new FormData()
      // Preserve current URL when no upload/removal is happening so the
      // server-side schema receives a stable value.
      const payload: LandingContentInput = {
        ...values,
        heroImageUrl: heroImageRemoved ? null : values.heroImageUrl ?? null,
        // Always send the CDN URL (never a blob: URL) so the server's "no change"
        // branch preserves the real URL rather than overwriting with null.
        howItWorksSteps: values.howItWorksSteps.map((step, i) => ({
          ...step,
          imageUrl: stepImages[i]?.removed ? null : currentStepUrls[i] ?? null,
        })),
      }
      fd.set('content', JSON.stringify(payload))
      if (heroImageFile) fd.set('heroImageFile', heroImageFile)
      fd.set('heroImageRemoved', String(heroImageRemoved))
      stepImages.forEach((s, i) => {
        if (s.file) fd.set(`stepImageFile_${i}`, s.file)
        fd.set(`stepImageRemoved_${i}`, String(s.removed))
      })

      const result = await saveLandingContent(fd)
      if (result.ok) {
        toast.success(t('Landing page updated.'))
        setHeroImageFile(null)
        setHeroImageRemoved(false)
        setCurrentStepUrls(result.stepImageUrls)
        setStepImages(prev => prev.map(() => ({ file: null, removed: false })))
        setStepUploaderKey(k => k + 1)
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
                  {t({ hero: 'Hero', 'how-it-works': 'How It Works', features: 'Features' }[tab])}
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
                  <FormLabel>{t('Headline')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('Professional estimates in 5 minutes.')} {...field} />
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
                  <FormLabel>{t('Subheadline')}</FormLabel>
                  <FormControl>
                    <Textarea rows={4} placeholder={t('Record a site walkthrough...')} {...field} />
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
                  <FormLabel>{t('CTA Button Label')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('Start free')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormItem>
              <FormLabel>{t('Hero image')}</FormLabel>
              <FormControl>
                <HeroImageUploader
                  currentUrl={heroImagePreview}
                  onFileSelect={handleHeroImageSelect}
                  onRemove={handleHeroImageRemove}
                />
              </FormControl>
              <FormMessage>
                {t('Optional. Displayed on the right side of the hero (1:1). When empty, the hero collapses to a single column.')}
              </FormMessage>
            </FormItem>
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
                      <FormItem><FormLabel>{t('Eyebrow')}</FormLabel><FormControl><Input placeholder={`${t('Step')} ${index + 1}`} {...f} /></FormControl><FormMessage /></FormItem>
                    )} />
                  <FormField control={form.control} name={`howItWorksSteps.${index}.title`}
                    render={({ field: f }) => (
                      <FormItem><FormLabel>{t('Title')}</FormLabel><FormControl><Input placeholder={t('Step title')} {...f} /></FormControl><FormMessage /></FormItem>
                    )} />
                  <FormField control={form.control} name={`howItWorksSteps.${index}.description`}
                    render={({ field: f }) => (
                      <FormItem><FormLabel>{t('Description')}</FormLabel><FormControl><Textarea rows={3} placeholder={t('Step description')} {...f} /></FormControl><FormMessage /></FormItem>
                    )} />
                  <FormItem>
                    <FormLabel>{t('Step image')}</FormLabel>
                    <FormControl>
                      <StepImageUploader
                        key={`${stepUploaderKey}-${index}`}
                        currentUrl={currentStepUrls[index] ?? null}
                        stepIndex={index}
                        onFileSelect={(file) => handleStepImageSelect(index, file)}
                        onRemove={() => handleStepImageRemove(index)}
                      />
                    </FormControl>
                  </FormItem>
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
                      <FormItem><FormLabel>{t('Title')}</FormLabel><FormControl><Input placeholder={t('Feature title')} {...f} /></FormControl><FormMessage /></FormItem>
                    )} />
                  <FormField control={form.control} name={`features.${index}.description`}
                    render={({ field: f }) => (
                      <FormItem><FormLabel>{t('Description')}</FormLabel><FormControl><Textarea rows={3} placeholder={t('Feature description')} {...f} /></FormControl><FormMessage /></FormItem>
                    )} />
                  <FormField control={form.control} name={`features.${index}.benefit`}
                    render={({ field: f }) => (
                      <FormItem><FormLabel>{t('Benefit Tag')}</FormLabel><FormControl><Input placeholder={t('Benefit label')} {...f} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
              )
            ))}
          </TabsContent>
        </Tabs>

        <div>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('Save landing page')}
          </Button>
        </div>
      </form>
    </Form>
  )
}
