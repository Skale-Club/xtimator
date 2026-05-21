'use client'

import { useRouter } from 'next/navigation'
import { useTransition, useEffect, useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { createProjectWithClientAction } from '@/lib/actions/project'
import { Button } from '@/components/ui/button'

function useIsOffline(): boolean {
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    setOffline(!navigator.onLine)
    const onOnline  = () => setOffline(false)
    const onOffline = () => setOffline(true)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])
  return offline
}

interface ClientNewProjectButtonProps {
  clientId: string
  clientName: string
}

export function ClientNewProjectButton({ clientId, clientName }: ClientNewProjectButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const offline = useIsOffline()

  function handleNewProject() {
    startTransition(async () => {
      const result = await createProjectWithClientAction(clientId)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      router.push(`/projects/${result.data.id}/capture`)
    })
  }

  return (
    <Button
      variant="primary"
      size="sm"
      onClick={handleNewProject}
      disabled={isPending || offline}
      title={offline ? 'Requires internet connection' : undefined}
    >
      {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
      New Project
    </Button>
  )
}