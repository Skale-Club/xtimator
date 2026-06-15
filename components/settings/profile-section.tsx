'use client'

import { useRef, useState, useTransition } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { updateProfile } from '@/lib/actions/settings'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface ProfileSectionProps {
  profile: {
    fullName: string
    phone: string
    avatarUrl: string | null
    email: string
  }
}

export function ProfileSection({ profile }: ProfileSectionProps) {
  const [isPending, startTransition] = useTransition()
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const initial = (profile.fullName || profile.email).charAt(0).toUpperCase()
  const displayAvatar = avatarPreview ?? profile.avatarUrl

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarPreview(URL.createObjectURL(file))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await updateProfile(formData)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Profile updated.')
      }
    })
  }

  return (
    <Card className="w-full rounded-[var(--radius-md)]">
      <CardHeader className="border-b border-border">
        <CardTitle>General</CardTitle>
        <CardDescription>Your personal profile — name, phone, and the photo shown on sign-in.</CardDescription>
      </CardHeader>
      <CardContent className="py-6">
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-8">
          {/* Avatar */}
          <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
            <div>
              <h3 className="text-sm font-medium">Profile Photo</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Shown as your avatar on sign-in and in the app navbar.
              </p>
            </div>
            <div className="flex items-center gap-5">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  {displayAvatar && <AvatarImage src={displayAvatar} alt="Profile photo" className="object-cover" />}
                  <AvatarFallback className="text-2xl bg-primary/20 text-white">{initial}</AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white shadow hover:bg-primary/90 transition-colors"
                  aria-label="Change photo"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-1">
                <Button type="button" variant="outline" size="sm" onClick={() => avatarInputRef.current?.click()}>
                  Choose photo
                </Button>
                <p className="text-xs text-muted-foreground">PNG, JPG, or WebP · max 4 MB</p>
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
          </div>

          {/* Name */}
          <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
            <div>
              <h3 className="text-sm font-medium">Full Name</h3>
              <p className="mt-1 text-sm text-muted-foreground">How you'd like to be addressed.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                name="fullName"
                defaultValue={profile.fullName}
                placeholder="Jane Smith"
                autoComplete="name"
              />
            </div>
          </div>

          {/* Phone */}
          <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
            <div>
              <h3 className="text-sm font-medium">Phone Number</h3>
              <p className="mt-1 text-sm text-muted-foreground">Used for account recovery and WhatsApp notifications.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={profile.phone}
                placeholder="+1 (555) 000-0000"
                autoComplete="tel"
              />
            </div>
          </div>

          <Button type="submit" disabled={isPending} className="min-w-40">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
