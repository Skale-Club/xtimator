'use client'

import { useRef, useState, useTransition } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { updateProfile, saveWhatsAppNumber } from '@/lib/actions/settings'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface ProfileSectionProps {
  profile: {
    fullName: string
    phone: string
    avatarUrl: string | null
    email: string
    whatsappPhone: string  // current value from company_whatsapp for this user
  }
}

export function ProfileSection({ profile }: ProfileSectionProps) {
  const [isPending, startTransition] = useTransition()
  const [isWhatsAppPending, startWhatsAppTransition] = useTransition()
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [whatsappValue, setWhatsappValue] = useState(profile.whatsappPhone)
  const [phone, setPhone] = useState(profile.phone)
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
                  <AvatarFallback className="text-2xl bg-primary text-white font-semibold">{initial}</AvatarFallback>
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
              <h3 className="text-sm font-medium">Account Name</h3>
              <p className="mt-1 text-sm text-muted-foreground">Your name on this Xtimator account.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fullName">Account name</Label>
              <Input
                id="fullName"
                name="fullName"
                defaultValue={profile.fullName}
                placeholder="Jane Smith"
                autoComplete="name"
              />
            </div>
          </div>

          {/* Profile phone (account / recovery) — NOT the WhatsApp routing number.
              The WhatsApp number is the dedicated per-user field below. */}
          <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
            <div>
              <h3 className="text-sm font-medium">Phone</h3>
              <p className="mt-1 text-sm text-muted-foreground">Your contact phone for your account (and recovery). To use the Xtimator WhatsApp assistant, set your WhatsApp number below.</p>
            </div>
            <div>
              {/* PhoneInput is controlled; the country dropdown holds the dial code and the
                  field masks to (XXX) XXX-XXXX as you type. We surface the full emitted value
                  ("+1 (XXX) XXX-XXXX") via a hidden input so the plain FormData submit captures
                  it — the PhoneInput's own input is intentionally name-less. */}
              <PhoneInput id="phone" value={phone} onChange={setPhone} />
              <input type="hidden" name="phone" value={phone} />
            </div>
          </div>

          <Button type="submit" disabled={isPending} className="min-w-40">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </form>

        {/* WhatsApp Number — separate from the profile form; has its own Save button */}
        <div className="mt-8 space-y-8 border-t pt-8">
          <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
            <div>
              <h3 className="text-sm font-medium">WhatsApp Number</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Your personal WhatsApp number for receiving job requests. It&apos;s also used to
                deliver owner WhatsApp and SMS notifications when you opt in to those channels.
                Must match the number you use on WhatsApp. Leave blank if you don&apos;t use WhatsApp.
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                id="whatsappPhone"
                name="whatsappPhone"
                type="tel"
                value={whatsappValue}
                onChange={(e) => setWhatsappValue(e.target.value)}
                placeholder="+1 (555) 000-0000"
                autoComplete="tel"
              />
              <Button
                type="button"
                variant="outline"
                disabled={isWhatsAppPending}
                onClick={() => {
                  startWhatsAppTransition(async () => {
                    const result = await saveWhatsAppNumber(whatsappValue.trim() || null)
                    if ('error' in result) {
                      toast.error(result.error as string)
                    } else {
                      toast.success('WhatsApp number saved.')
                    }
                  })
                }}
              >
                {isWhatsAppPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
