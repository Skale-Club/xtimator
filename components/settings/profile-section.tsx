'use client'

import { useRef, useState, useTransition } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { updateProfile } from '@/lib/actions/settings'
import { SettingsCard } from '@/components/settings/settings-ui'
import { useTranslation } from '@/lib/i18n/use-translation'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ImagePositionEditor, DEFAULT_IMAGE_POSITION, type ImagePosition } from '@/components/admin/image-position-editor'

interface ProfileSectionProps {
  profile: {
    fullName: string
    phone: string
    avatarUrl: string | null
    avatarPosition?: ImagePosition | null
    email: string
  }
}

export function ProfileSection({ profile }: ProfileSectionProps) {
  const { t } = useTranslation()
  const [isPending, startTransition] = useTransition()
  // The crop editor is a tool, not a second copy of the avatar: it opens when
  // a new photo is picked or when asked for, and closes after saving.
  const [adjusting, setAdjusting] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarPosition, setAvatarPosition] = useState<ImagePosition>(profile.avatarPosition ?? DEFAULT_IMAGE_POSITION)
  const [phone, setPhone] = useState(profile.phone)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const initial = (profile.fullName || profile.email).charAt(0).toUpperCase()
  const displayAvatar = avatarPreview ?? profile.avatarUrl

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarPreview(URL.createObjectURL(file))
    setAvatarPosition(DEFAULT_IMAGE_POSITION)
    setAdjusting(true)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set('avatarPosition', JSON.stringify(avatarPosition))
    startTransition(async () => {
      const result = await updateProfile(formData)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t('Profile updated.'))
        setAdjusting(false)
      }
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit}>
      <SettingsCard
        title={t('Profile')}
        description={t('Your name, photo and contact phone on this account.')}
        footer={
          <Button type="submit" size="sm" disabled={isPending} className="min-w-28">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('Save profile')}
          </Button>
        }
      >
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-5">
            <div className="relative">
              <Avatar className="h-20 w-20">
                {displayAvatar && (
                  <AvatarImage
                    src={displayAvatar}
                    alt={t('Profile photo')}
                    className="object-cover"
                    style={{
                      objectPosition: `${50 + avatarPosition.x}% ${50 + avatarPosition.y}%`,
                      transform: `scale(${avatarPosition.scale})`,
                    }}
                  />
                )}
                <AvatarFallback className="text-2xl bg-primary text-white font-semibold">{initial}</AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white shadow hover:bg-primary/90 transition-colors"
                aria-label={t('Change photo')}
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => avatarInputRef.current?.click()}>
                  {t('Choose photo')}
                </Button>
                {displayAvatar && !adjusting && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setAdjusting(true)}>
                    {t('Adjust')}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">PNG, JPG, WebP · max 4 MB</p>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              name="avatar"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          {displayAvatar && adjusting && (
            <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--glass-border)] p-4">
              <p className="text-sm font-medium">{t('Position your photo')}</p>
              <ImagePositionEditor
                src={displayAvatar}
                alt={t('Profile photo position preview')}
                aspectRatio={1}
                shape="circle"
                fit="cover"
                value={avatarPosition}
                onChange={setAvatarPosition}
                className="max-w-[200px]"
              />
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fullName">{t('Your name')}</Label>
              <Input
                id="fullName"
                name="fullName"
                defaultValue={profile.fullName}
                placeholder="Jane Smith"
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{t('Phone')}</Label>
              {/* PhoneInput is controlled and name-less; the hidden input carries
                  its full value ("+1 (XXX) XXX-XXXX") into the FormData submit. */}
              <PhoneInput id="phone" value={phone} onChange={setPhone} />
              <input type="hidden" name="phone" value={phone} />
              <p className="text-xs text-muted-foreground">{t('For your account and recovery. Not shown to clients.')}</p>
            </div>
          </div>
        </div>
      </SettingsCard>
    </form>
  )
}
