'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { blogPostSchema, type BlogPostInput } from '@/lib/schemas/admin'
import type { BlogPost } from '@/lib/queries/blog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SettingsSaveBar } from '@/components/settings/settings-ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslation } from '@/lib/i18n/use-translation'

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

type PostFormProps = {
  initial?: BlogPost
  onSave: (data: BlogPostInput) => Promise<void>
  isPending: boolean
}

export function PostForm({ initial, onSave, isPending }: PostFormProps) {
  const { t } = useTranslation()
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<BlogPostInput>({
    resolver: zodResolver(blogPostSchema) as never,
    defaultValues: {
      title: initial?.title ?? '',
      slug: initial?.slug ?? '',
      content: initial?.content ?? '',
      excerpt: initial?.excerpt ?? null,
      coverImageUrl: initial?.cover_image_url ?? null,
      status: initial?.status ?? 'draft',
      metaTitle: initial?.meta_title ?? null,
      metaDescription: initial?.meta_description ?? null,
    },
  })

  const status = watch('status')
  const slug = watch('slug')
  const title = watch('title')
  const content = watch('content')

  function handleTitleBlur(e: React.FocusEvent<HTMLInputElement>) {
    if (!initial && !slug) {
      setValue('slug', slugify(e.target.value), { shouldValidate: true })
    }
  }

  return (
    <form onSubmit={handleSubmit(onSave)} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">{t('Title')}</Label>
        <Input
          id="title"
          {...register('title')}
          onBlur={handleTitleBlur}
          placeholder={t('Post title')}
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="slug">{t('Slug')}</Label>
        <Input
          id="slug"
          {...register('slug')}
          className="font-mono text-sm"
          placeholder="post-slug"
        />
        {errors.slug && (
          <p className="text-sm text-destructive">{errors.slug.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="content">{t('Content')}</Label>
        <Textarea
          id="content"
          {...register('content')}
          className="min-h-[300px]"
          placeholder={t('Write in Markdown…')}
        />
        {errors.content && (
          <p className="text-sm text-destructive">{errors.content.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="excerpt">{t('Excerpt (optional)')}</Label>
        <Textarea
          id="excerpt"
          {...register('excerpt')}
          className="max-h-[120px]"
          placeholder={t('Short summary of the post')}
        />
        {errors.excerpt && (
          <p className="text-sm text-destructive">{errors.excerpt.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="coverImageUrl">{t('Cover image URL (optional)')}</Label>
        <Input
          id="coverImageUrl"
          {...register('coverImageUrl')}
          placeholder="https://…"
        />
        {errors.coverImageUrl && (
          <p className="text-sm text-destructive">{errors.coverImageUrl.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="status">{t('Status')}</Label>
        <Select
          value={status}
          onValueChange={(val) => setValue('status', val as 'draft' | 'published', { shouldDirty: true })}
        >
          <SelectTrigger id="status">
            <SelectValue placeholder={t('Select status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">{t('Draft')}</SelectItem>
            <SelectItem value="published">{t('Published')}</SelectItem>
          </SelectContent>
        </Select>
        {errors.status && (
          <p className="text-sm text-destructive">{errors.status.message}</p>
        )}
      </div>

      <details>
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
          {t('SEO (optional)')}
        </summary>
        <div className="mt-4 flex flex-col gap-4 pl-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="metaTitle">{t('Meta title')}</Label>
            <Input
              id="metaTitle"
              {...register('metaTitle')}
              placeholder={t('Override page title for search engines')}
            />
            {errors.metaTitle && (
              <p className="text-sm text-destructive">{errors.metaTitle.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="metaDescription">{t('Meta description')}</Label>
            <Textarea
              id="metaDescription"
              {...register('metaDescription')}
              placeholder={t('Search engine description (max 300 chars)')}
            />
            {errors.metaDescription && (
              <p className="text-sm text-destructive">{errors.metaDescription.message}</p>
            )}
          </div>
        </div>
      </details>

      {initial ? (
        <SettingsSaveBar
          dirty={isDirty}
          pending={isPending}
          onDiscard={() => reset()}
          saveLabel={status === 'published' ? t('Publish') : t('Save draft')}
        />
      ) : (
        <Button
          type="submit"
          disabled={isPending || !title?.trim() || !slug?.trim() || !content?.trim()}
          className="self-start"
        >
          {status === 'published' ? t('Publish') : t('Save draft')}
        </Button>
      )}
    </form>
  )
}
