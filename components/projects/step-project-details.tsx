'use client'

import { useEffect, useRef } from 'react'
import type { UseFormReturn } from 'react-hook-form'

import type { ProjectFormValues } from '@/lib/schemas/project'

import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface StepProjectDetailsProps {
  form: UseFormReturn<ProjectFormValues>
  projectTypes: string[]
}

export function StepProjectDetails({ form, projectTypes }: StepProjectDetailsProps) {
  const nameManuallyEdited = useRef(false)
  const lastAutoSuggestion = useRef('')

  const clientName = form.watch('clientName')
  const projectType = form.watch('projectType')
  const customProjectType = form.watch('customProjectType')

  // Auto-suggest project name based on client + type
  useEffect(() => {
    if (nameManuallyEdited.current) return

    const effectiveType =
      projectType === 'Custom' && customProjectType
        ? customProjectType
        : projectType

    if (!clientName && !effectiveType) return

    const parts = [clientName, effectiveType].filter(Boolean)
    const suggestion = parts.join(' - ')

    if (suggestion) {
      form.setValue('name', suggestion)
      lastAutoSuggestion.current = suggestion
    }
  }, [clientName, projectType, customProjectType, form])

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    if (value !== lastAutoSuggestion.current) {
      nameManuallyEdited.current = true
    }
    // When user clears the field, allow auto-suggestion again
    if (value === '' || value === lastAutoSuggestion.current) {
      nameManuallyEdited.current = false
    }
    form.setValue('name', value, { shouldValidate: true })
  }

  function handleTypeChange(value: string) {
    form.setValue('projectType', value, { shouldValidate: true })
    if (value !== 'Custom') {
      form.setValue('customProjectType', '')
    }
    // Reset auto-suggestion tracking when type changes
    if (!nameManuallyEdited.current || form.getValues('name') === lastAutoSuggestion.current) {
      nameManuallyEdited.current = false
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Project Details</h2>

      {/* Project Name */}
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Project Name</FormLabel>
            <FormControl>
              <Input
                {...field}
                onChange={handleNameChange}
                placeholder="e.g., Smith Residence - Interior Painting"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Project Type */}
      <FormField
        control={form.control}
        name="projectType"
        render={() => (
          <FormItem>
            <FormLabel>Project Type</FormLabel>
            <Select
              value={form.watch('projectType')}
              onValueChange={handleTypeChange}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select project type" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {projectTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
                <SelectItem value="Custom">Custom...</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Custom Project Type (conditional) */}
      {form.watch('projectType') === 'Custom' && (
        <FormField
          control={form.control}
          name="customProjectType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Custom Project Type</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Enter custom project type" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Target Budget */}
      <FormField
        control={form.control}
        name="targetBudget"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Target Budget</FormLabel>
            <FormControl>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  {...field}
                  type="text"
                  inputMode="decimal"
                  placeholder="Optional (e.g., 5000)"
                  className="pl-7"
                />
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}
