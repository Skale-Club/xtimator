'use client'

import type { UseFormReturn } from 'react-hook-form'
import type { OnboardingValues } from '@/lib/schemas/onboarding'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

interface StepBusinessInfoProps {
  form: UseFormReturn<OnboardingValues>
}

export function StepBusinessInfo({ form }: StepBusinessInfoProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold leading-[1.2]">Business Information</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell us about your business. Only the company name is required.
        </p>
      </div>

      <FormField
        control={form.control}
        name="companyName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Company Name *</FormLabel>
            <FormControl>
              <Input
                placeholder="e.g. Smith Painting LLC"
                className="min-h-[44px]"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="ownerName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Owner Name</FormLabel>
            <FormControl>
              <Input
                placeholder="e.g. John Smith"
                className="min-h-[44px]"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="phone"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Phone</FormLabel>
            <FormControl>
              <PhoneInput
                value={field.value ?? ''}
                onChange={field.onChange}
                placeholder="(555) 123-4567"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input
                type="email"
                placeholder="john@smithpainting.com"
                className="min-h-[44px]"
                autoComplete="email"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="website"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Website</FormLabel>
            <FormControl>
              <Input
                type="url"
                placeholder="https://smithpainting.com"
                className="min-h-[44px]"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}
