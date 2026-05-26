'use client'

import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { toast } from 'sonner'

import { linkProjectToClient, unlinkProjectFromClient } from '@/lib/actions/project'

export type ClientSuggestion = {
  detectedName: string
  matchedClientId: string | null
  matchedClientName: string | null
  autoLinked: boolean
}

export type GenerateEstimateResponse = {
  estimateId: string
  version: number
  clientSuggestion: ClientSuggestion | null
}

export function getClientSuggestionStorageKey(projectId: string) {
  return `xtimator:client-suggestion:${projectId}`
}

export function storeClientSuggestion(projectId: string, suggestion: ClientSuggestion | null) {
  if (!suggestion || typeof window === 'undefined') return
  window.sessionStorage.setItem(
    getClientSuggestionStorageKey(projectId),
    JSON.stringify(suggestion)
  )
}

export function popStoredClientSuggestion(projectId: string): ClientSuggestion | null {
  if (typeof window === 'undefined') return null

  const key = getClientSuggestionStorageKey(projectId)
  const raw = window.sessionStorage.getItem(key)
  if (!raw) return null

  window.sessionStorage.removeItem(key)
  try {
    const parsed = JSON.parse(raw) as ClientSuggestion
    return parsed?.detectedName ? parsed : null
  } catch {
    return null
  }
}

export function showClientSuggestionToast({
  projectId,
  router,
  suggestion,
}: {
  projectId: string
  router: AppRouterInstance
  suggestion: ClientSuggestion | null
}) {
  if (!suggestion) return

  // Auto-link succeeded server-side — show informative toast with Undo
  if (suggestion.autoLinked && suggestion.matchedClientId) {
    toast(`Client auto-linked: ${suggestion.matchedClientName ?? suggestion.detectedName}`, {
      description: `Detected from audio: "${suggestion.detectedName}"`,
      action: {
        label: 'Undo',
        onClick: async () => {
          const result = await unlinkProjectFromClient(projectId)
          if ('error' in result) {
            toast.error(result.error)
            return
          }
          toast.success('Client unlinked')
          router.refresh()
        },
      },
    })
    return
  }

  // Match exists but auto-link failed (e.g. server update errored) — fallback to manual Link
  if (suggestion.matchedClientId) {
    toast(`Detected client: ${suggestion.detectedName}`, {
      description: `Match found: ${suggestion.matchedClientName ?? suggestion.detectedName}`,
      action: {
        label: 'Link',
        onClick: async () => {
          const result = await linkProjectToClient(projectId, suggestion.matchedClientId!)
          if ('error' in result) {
            toast.error(result.error)
            return
          }
          toast.success('Client linked successfully')
          router.refresh()
        },
      },
    })
    return
  }

  // No match — review existing clients (unchanged)
  toast(`Detected client: ${suggestion.detectedName}`, {
    description: 'No existing client matched this name.',
    action: {
      label: 'Review',
      onClick: () => router.push('/clients'),
    },
  })
}
