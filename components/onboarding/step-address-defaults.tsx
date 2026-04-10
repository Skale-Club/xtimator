'use client'

import type { UseFormReturn } from 'react-hook-form'
import type { OnboardingValues } from '@/lib/schemas/onboarding'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

interface StepAddressDefaultsProps {
  form: UseFormReturn<OnboardingValues>
}

export function StepAddressDefaults({ form }: StepAddressDefaultsProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold leading-[1.2]">Address & Defaults</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add your business address and set default estimate terms.
        </p>
      </div>

      {/* Address section */}
      <FormField
        control={form.control}
        name="address"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Address</FormLabel>
            <FormControl>
              <Input
                placeholder="123 Main St"
                className="min-h-[44px]"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField
          control={form.control}
          name="city"
          render={({ field }) => (
            <FormItem>
              <FormLabel>City</FormLabel>
              <FormControl>
                <Input
                  placeholder="Springfield"
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
          name="state"
          render={({ field }) => (
            <FormItem>
              <FormLabel>State</FormLabel>
              <FormControl>
                <Input
                  placeholder="IL"
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
          name="zip"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ZIP Code</FormLabel>
              <FormControl>
                <Input
                  placeholder="62704"
                  className="min-h-[44px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="licenseNumber"
        render={({ field }) => (
          <FormItem>
            <FormLabel>License Number</FormLabel>
            <FormControl>
              <Input
                placeholder="Optional"
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
        name="insuranceInfo"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Insurance Info</FormLabel>
            <FormControl>
              <Input
                placeholder="Optional"
                className="min-h-[44px]"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <Separator />

      {/* Defaults section */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="defaultTaxRate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tax Rate (%)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
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
          name="defaultPaymentTerms"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Payment Terms</FormLabel>
              <FormControl>
                <Input
                  placeholder="Net 30"
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
          name="defaultWarrantyTerms"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Warranty Terms</FormLabel>
              <FormControl>
                <Input
                  placeholder="1 year"
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
          name="defaultValidityDays"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Validity Period (days)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  className="min-h-[44px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  )
}
