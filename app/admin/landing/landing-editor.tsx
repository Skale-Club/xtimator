'use client'

import { useTransition, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2 } from 'lucide-react'

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
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { saveLandingContent } from './actions'
import { useTranslation } from '@/lib/i18n/use-translation'
import { HeroImageUploader } from '@/components/admin/hero-image-uploader'
import { StepImageUploader } from '@/components/admin/step-image-uploader'
import { FeatureImageUploader } from '@/components/admin/feature-image-uploader'
import { ImagePositionEditor } from '@/components/admin/image-position-editor'

interface LandingEditorProps {
  initial: LandingContentInput
}

const MIN_STEPS = 3
const MAX_STEPS = 6
const MIN_FEATURES = 1
const MAX_FEATURES = 6

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

  // Background image/video upload state — same lifted-file pattern as hero
  // image. Both URLs are tracked independently so switching heroBackgroundType
  // back and forth in the UI doesn't lose whichever asset isn't currently active.
  const [bgImagePreview, setBgImagePreview] = useState<string | null>(
    initial.heroBackgroundImageUrl ?? null
  )
  const [bgImageFile, setBgImageFile] = useState<File | null>(null)
  const [bgImageRemoved, setBgImageRemoved] = useState(false)
  const [bgVideoPreview, setBgVideoPreview] = useState<string | null>(
    initial.heroBackgroundVideoUrl ?? null
  )
  const [bgVideoFile, setBgVideoFile] = useState<File | null>(null)
  const [bgVideoRemoved, setBgVideoRemoved] = useState(false)

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

  // Per-feature image state (one per feature card)
  const [featureImages, setFeatureImages] = useState<Array<{ file: File | null; removed: boolean }>>(
    () => (initial.features ?? []).map(() => ({ file: null, removed: false }))
  )
  const [currentFeatureUrls, setCurrentFeatureUrls] = useState<Array<string | null>>(
    () => (initial.features ?? []).map(f => f.imageUrl ?? null)
  )
  const [featureUploaderKey, setFeatureUploaderKey] = useState(0)

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

  function handleBgImageSelect(file: File, preview: string) {
    setBgImageFile(file)
    setBgImagePreview(preview)
    setBgImageRemoved(false)
  }

  function handleBgImageRemove() {
    setBgImageFile(null)
    setBgImagePreview(null)
    setBgImageRemoved(true)
  }

  const MAX_BG_VIDEO_SIZE = 20 * 1024 * 1024
  const ACCEPTED_BG_VIDEO_TYPES = ['video/mp4', 'video/webm']

  function handleBgVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (!ACCEPTED_BG_VIDEO_TYPES.includes(file.type)) {
      toast.error(t('Unsupported format. Please upload MP4 or WebM.'))
      return
    }
    if (file.size > MAX_BG_VIDEO_SIZE) {
      toast.error(t('Video must be under 20MB.'))
      return
    }
    setBgVideoFile(file)
    setBgVideoPreview(URL.createObjectURL(file))
    setBgVideoRemoved(false)
  }

  function handleBgVideoRemove() {
    setBgVideoFile(null)
    setBgVideoPreview(null)
    setBgVideoRemoved(true)
  }

  function handleStepImageSelect(index: number, file: File) {
    setStepImages(prev => prev.map((s, i) => i === index ? { file, removed: false } : s))
  }

  function handleStepImageRemove(index: number) {
    setStepImages(prev => prev.map((s, i) => i === index ? { file: null, removed: true } : s))
    setCurrentStepUrls(prev => prev.map((url, i) => i === index ? null : url))
  }

  function handleFeatureImageSelect(index: number, file: File) {
    setFeatureImages(prev => prev.map((s, i) => i === index ? { file, removed: false } : s))
  }

  function handleFeatureImageRemove(index: number) {
    setFeatureImages(prev => prev.map((s, i) => i === index ? { file: null, removed: true } : s))
    setCurrentFeatureUrls(prev => prev.map((url, i) => i === index ? null : url))
  }

  function handleAddStep() {
    if (stepsArray.fields.length >= MAX_STEPS) return
    const newIndex = stepsArray.fields.length
    stepsArray.append({ eyebrow: '', title: '', description: '', imageUrl: null, imagePosition: null })
    setStepImages(prev => [...prev, { file: null, removed: false }])
    setCurrentStepUrls(prev => [...prev, null])
    setStepUploaderKey(k => k + 1)
    setActiveStep(newIndex)
  }

  function handleRemoveStep(index: number) {
    if (stepsArray.fields.length <= MIN_STEPS) return
    stepsArray.remove(index)
    setStepImages(prev => prev.filter((_, i) => i !== index))
    setCurrentStepUrls(prev => prev.filter((_, i) => i !== index))
    setStepUploaderKey(k => k + 1)
    setActiveStep(prev => Math.min(prev, stepsArray.fields.length - 2))
  }

  function handleAddFeature() {
    if (featuresArray.fields.length >= MAX_FEATURES) return
    const newIndex = featuresArray.fields.length
    featuresArray.append({ icon: 'BrainCircuit', title: '', description: '', benefit: '', imageUrl: null, imagePosition: null })
    setFeatureImages(prev => [...prev, { file: null, removed: false }])
    setCurrentFeatureUrls(prev => [...prev, null])
    setFeatureUploaderKey(k => k + 1)
    setActiveFeature(newIndex)
  }

  function handleRemoveFeature(index: number) {
    if (featuresArray.fields.length <= MIN_FEATURES) return
    featuresArray.remove(index)
    setFeatureImages(prev => prev.filter((_, i) => i !== index))
    setCurrentFeatureUrls(prev => prev.filter((_, i) => i !== index))
    setFeatureUploaderKey(k => k + 1)
    setActiveFeature(prev => Math.min(prev, featuresArray.fields.length - 2))
  }

  function onSubmit(values: LandingContentInput) {
    startTransition(async () => {
      const fd = new FormData()
      // Preserve current URL when no upload/removal is happening so the
      // server-side schema receives a stable value.
      const payload: LandingContentInput = {
        ...values,
        heroImageUrl: heroImageRemoved ? null : values.heroImageUrl ?? null,
        heroBackgroundImageUrl: bgImageRemoved ? null : values.heroBackgroundImageUrl ?? null,
        heroBackgroundVideoUrl: bgVideoRemoved ? null : values.heroBackgroundVideoUrl ?? null,
        // Always send CDN URLs (never blob: URLs) so the server's "no change"
        // branch preserves real URLs rather than overwriting with null.
        howItWorksSteps: values.howItWorksSteps.map((step, i) => ({
          ...step,
          imageUrl: stepImages[i]?.removed ? null : currentStepUrls[i] ?? null,
        })),
        features: values.features.map((f, i) => ({
          ...f,
          imageUrl: featureImages[i]?.removed ? null : currentFeatureUrls[i] ?? null,
        })),
      }
      fd.set('content', JSON.stringify(payload))
      if (heroImageFile) fd.set('heroImageFile', heroImageFile)
      fd.set('heroImageRemoved', String(heroImageRemoved))
      if (bgImageFile) fd.set('heroBackgroundImageFile', bgImageFile)
      fd.set('heroBackgroundImageRemoved', String(bgImageRemoved))
      if (bgVideoFile) fd.set('heroBackgroundVideoFile', bgVideoFile)
      fd.set('heroBackgroundVideoRemoved', String(bgVideoRemoved))
      stepImages.forEach((s, i) => {
        if (s.file) fd.set(`stepImageFile_${i}`, s.file)
        fd.set(`stepImageRemoved_${i}`, String(s.removed))
      })
      featureImages.forEach((s, i) => {
        if (s.file) fd.set(`featureImageFile_${i}`, s.file)
        fd.set(`featureImageRemoved_${i}`, String(s.removed))
      })

      const result = await saveLandingContent(fd)
      if (result.ok) {
        toast.success(t('Landing page updated.'))
        setHeroImageFile(null)
        setHeroImageRemoved(false)
        setBgImageFile(null)
        setBgImageRemoved(false)
        setBgVideoFile(null)
        setBgVideoRemoved(false)
        setCurrentStepUrls(result.stepImageUrls)
        setStepImages(prev => prev.map(() => ({ file: null, removed: false })))
        setStepUploaderKey(k => k + 1)
        setCurrentFeatureUrls(result.featureImageUrls)
        setFeatureImages(prev => prev.map(() => ({ file: null, removed: false })))
        setFeatureUploaderKey(k => k + 1)
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

            {heroImagePreview && (
              <FormItem>
                <FormLabel>{t('Position')}</FormLabel>
                <FormControl>
                  <ImagePositionEditor
                    src={heroImagePreview}
                    alt={t('Hero image position preview')}
                    aspectRatio={1}
                    fit="contain"
                    containAnchor="bottom"
                    value={form.watch('heroImagePosition') ?? null}
                    onChange={(pos) => form.setValue('heroImagePosition', pos, { shouldDirty: true })}
                  />
                </FormControl>
                <FormMessage>{t('Drag to reposition, use the slider to zoom.')}</FormMessage>
              </FormItem>
            )}

            {/* Background — full-bleed backdrop behind the WHOLE hero section (text,
                pill, buttons, and the hero image above all sit on top of it), distinct
                from the hero image itself. 'none' keeps the existing decorative
                gradient/dot mesh. */}
            <FormItem className="border-t border-border pt-4">
              <FormLabel>{t('Background')}</FormLabel>
              <FormMessage className="text-muted-foreground">
                {t('Optional full-bleed backdrop behind the entire hero section. When set to None, the default gradient/dot pattern shows instead.')}
              </FormMessage>
              <FormControl>
                <div className="flex gap-1">
                  {(['none', 'image', 'video'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => form.setValue('heroBackgroundType', type, { shouldDirty: true })}
                      className={`h-8 rounded-md border px-3 text-xs font-semibold transition-colors ${
                        form.watch('heroBackgroundType') === type
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted text-muted-foreground border-border hover:text-foreground'
                      }`}
                    >
                      {t({ none: 'None', image: 'Image', video: 'Video' }[type])}
                    </button>
                  ))}
                </div>
              </FormControl>
            </FormItem>

            {form.watch('heroBackgroundType') === 'image' && (
              <>
                <FormItem>
                  <FormLabel>{t('Background image')}</FormLabel>
                  <FormControl>
                    <HeroImageUploader
                      currentUrl={bgImagePreview}
                      onFileSelect={handleBgImageSelect}
                      onRemove={handleBgImageRemove}
                    />
                  </FormControl>
                  <FormMessage>
                    {t('Wide landscape works best. Automatically converted to WebP on save.')}
                  </FormMessage>
                </FormItem>
                {bgImagePreview && (
                  <FormItem>
                    <FormLabel>{t('Position')}</FormLabel>
                    <FormControl>
                      <ImagePositionEditor
                        src={bgImagePreview}
                        alt={t('Background image position preview')}
                        aspectRatio={16 / 9}
                        fit="cover"
                        value={form.watch('heroBackgroundPosition') ?? null}
                        onChange={(pos) => form.setValue('heroBackgroundPosition', pos, { shouldDirty: true })}
                      />
                    </FormControl>
                    <FormMessage>{t('Drag to reposition, use the slider to zoom.')}</FormMessage>
                  </FormItem>
                )}
              </>
            )}

            {form.watch('heroBackgroundType') === 'video' && (
              <FormItem>
                <FormLabel>{t('Background video')}</FormLabel>
                <FormControl>
                  <div className="flex flex-col gap-2">
                    {bgVideoPreview ? (
                      <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-border">
                        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                        <video src={bgVideoPreview} controls muted className="w-full" />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleBgVideoRemove}
                          className="absolute right-2 top-2"
                        >
                          {t('Remove')}
                        </Button>
                      </div>
                    ) : (
                      <label className="flex h-32 w-full max-w-md cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground">
                        <span className="text-sm">{t('Upload background video')}</span>
                        <span className="text-xs opacity-70">{t('MP4 or WebM, under 20MB')}</span>
                        <input
                          type="file"
                          accept="video/mp4,video/webm"
                          className="hidden"
                          onChange={handleBgVideoSelect}
                        />
                      </label>
                    )}
                  </div>
                </FormControl>
                <FormMessage>
                  {t('Plays automatically, muted, looping. Not converted — uploaded as-is.')}
                </FormMessage>
              </FormItem>
            )}
          </TabsContent>

          {/* How It Works */}
          <TabsContent value="how-it-works" className="mt-0 flex flex-col gap-4">
            <FormField
              control={form.control}
              name="howItWorksAnimations"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border border-border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>{t('Card background animations')}</FormLabel>
                    <FormMessage className="text-muted-foreground">
                      {t('Show the animated waveform, typing dots, and camera behind each card image. When off, cards keep the halo glow only.')}
                    </FormMessage>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="flex items-center gap-1">
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
              <button
                type="button"
                onClick={handleAddStep}
                disabled={stepsArray.fields.length >= MAX_STEPS}
                aria-label={t('Add step')}
                title={stepsArray.fields.length >= MAX_STEPS ? t(`Maximum ${MAX_STEPS} steps`) : t('Add step')}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {stepsArray.fields.map((field, index) => (
              index === activeStep && (
                <div key={field.id} className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">{t('Step')} {index + 1}</span>
                    {stepsArray.fields.length > MIN_STEPS && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveStep(index)} className="h-7 gap-1.5 text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                        {t('Remove step')}
                      </Button>
                    )}
                  </div>
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

                  {currentStepUrls[index] && (
                    <FormItem>
                      <FormLabel>{t('Position')}</FormLabel>
                      <FormControl>
                        <ImagePositionEditor
                          src={currentStepUrls[index]!}
                          alt={t('Step image position preview')}
                          aspectRatio={280 / 176}
                          fit="contain"
                          containAnchor="top"
                          value={form.watch(`howItWorksSteps.${index}.imagePosition`) ?? null}
                          onChange={(pos) => form.setValue(`howItWorksSteps.${index}.imagePosition`, pos, { shouldDirty: true })}
                        />
                      </FormControl>
                      <FormMessage>{t('Drag to reposition, use the slider to zoom.')}</FormMessage>
                    </FormItem>
                  )}
                </div>
              )
            ))}
          </TabsContent>

          {/* Features */}
          <TabsContent value="features" className="mt-0 flex flex-col gap-4">
            <div className="flex items-center gap-1">
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
              <button
                type="button"
                onClick={handleAddFeature}
                disabled={featuresArray.fields.length >= MAX_FEATURES}
                aria-label={t('Add feature')}
                title={featuresArray.fields.length >= MAX_FEATURES ? t(`Maximum ${MAX_FEATURES} features`) : t('Add feature')}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {featuresArray.fields.map((field, index) => (
              index === activeFeature && (
                <div key={field.id} className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">{t('Feature')} {index + 1}</span>
                    {featuresArray.fields.length > MIN_FEATURES && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveFeature(index)} className="h-7 gap-1.5 text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                        {t('Remove feature')}
                      </Button>
                    )}
                  </div>
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
                  <FormItem>
                    <FormLabel>{t('Card image')}</FormLabel>
                    <FormControl>
                      <FeatureImageUploader
                        key={`${featureUploaderKey}-${index}`}
                        currentUrl={currentFeatureUrls[index] ?? null}
                        featureIndex={index}
                        onFileSelect={(file) => handleFeatureImageSelect(index, file)}
                        onRemove={() => handleFeatureImageRemove(index)}
                      />
                    </FormControl>
                  </FormItem>

                  {currentFeatureUrls[index] && (
                    <FormItem>
                      <FormLabel>{t('Position')}</FormLabel>
                      <FormControl>
                        <ImagePositionEditor
                          src={currentFeatureUrls[index]!}
                          alt={t('Card image position preview')}
                          aspectRatio={3}
                          fit="cover"
                          value={form.watch(`features.${index}.imagePosition`) ?? null}
                          onChange={(pos) => form.setValue(`features.${index}.imagePosition`, pos, { shouldDirty: true })}
                        />
                      </FormControl>
                      <FormMessage>{t('Drag to reposition, use the slider to zoom.')}</FormMessage>
                    </FormItem>
                  )}
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
