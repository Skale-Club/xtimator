'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Building2, Camera, Loader2 } from 'lucide-react'
import { INDUSTRIES } from '@/lib/industries'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { createAdminCompany } from '@/lib/actions/admin-company'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface AdminCreateCompanyModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MAX_LOGO_SIZE = 2 * 1024 * 1024
const ACCEPTED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg']

export function AdminCreateCompanyModal({
  open,
  onOpenChange,
}: AdminCreateCompanyModalProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [companyName, setCompanyName] = useState('')
  const [industry, setIndustry] = useState('')
  const [brandColor, setBrandColor] = useState<string>(SYSTEM_COLORS.primary)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      toast.error('Please upload a PNG or JPG file.')
      return
    }
    if (file.size > MAX_LOGO_SIZE) {
      toast.error('Logo must be under 2MB.')
      return
    }

    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  function resetForm() {
    setCompanyName('')
    setIndustry('')
    setBrandColor(SYSTEM_COLORS.primary)
    setLogoFile(null)
    setLogoPreview(null)
  }

  function handleOpenChange(value: boolean) {
    if (!value) resetForm()
    onOpenChange(value)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!companyName.trim()) {
      toast.error('Company name is required.')
      return
    }

    const fd = new FormData()
    fd.append('companyName', companyName.trim())
    if (industry) fd.append('industry', industry)
    fd.append('brandPrimaryColor', brandColor)
    if (logoFile) fd.append('logo', logoFile)

    startTransition(async () => {
      const result = await createAdminCompany(fd)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(`${companyName} created!`)
      handleOpenChange(false)
      router.push('/dashboard')
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md glass-strong border border-[var(--glass-border)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            New demo company
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Company name */}
          <div className="space-y-1.5">
            <Label htmlFor="admin-company-name">Company name *</Label>
            <Input
              id="admin-company-name"
              placeholder="Acme Landscaping"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={isPending}
              autoFocus
            />
          </div>

          {/* Industry */}
          <div className="space-y-1.5">
            <Label htmlFor="admin-industry">Industry</Label>
            <Select value={industry} onValueChange={setIndustry} disabled={isPending}>
              <SelectTrigger id="admin-industry">
                <SelectValue placeholder="Select industry…" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((ind) => (
                  <SelectItem key={ind.id} value={ind.id}>
                    {ind.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Logo */}
          <div className="space-y-1.5">
            <Label>Logo (optional)</Label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={isPending}
                className="h-16 w-16 shrink-0 flex items-center justify-center rounded-lg border border-dashed border-border hover:border-muted-foreground transition-colors cursor-pointer overflow-hidden"
              >
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="h-full w-full object-contain p-1"
                  />
                ) : (
                  <Camera className="h-5 w-5 text-muted-foreground" />
                )}
              </button>
              <div className="text-sm text-muted-foreground">
                {logoPreview ? (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => { setLogoFile(null); setLogoPreview(null) }}
                    disabled={isPending}
                  >
                    Remove
                  </button>
                ) : (
                  <span>PNG or JPG, max 2MB</span>
                )}
              </div>
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept=".png,.jpg,.jpeg"
              className="hidden"
              onChange={handleLogoChange}
            />
          </div>

          {/* Brand color */}
          <div className="space-y-1.5">
            <Label htmlFor="admin-brand-color">Brand color (optional)</Label>
            <div className="flex items-center gap-3">
              <input
                id="admin-brand-color"
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                disabled={isPending}
                className="h-9 w-14 cursor-pointer rounded-md border border-input bg-transparent p-1"
              />
              <span className="text-sm text-muted-foreground font-mono">{brandColor}</span>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !companyName.trim()}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating…
                </>
              ) : (
                'Create company'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
