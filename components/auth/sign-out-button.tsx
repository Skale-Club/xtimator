'use client'

import { Button } from '@/components/ui/button'
import { signOut } from '@/lib/actions/auth'
import { Loader2, LogOut } from 'lucide-react'
import { useTransition } from 'react'

export function SignOutButton() {
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      variant="outline"
      onClick={() => startTransition(() => signOut())}
      disabled={isPending}
      className="min-h-[44px]"
      aria-label="Sign out"
    >
      {isPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <LogOut className="mr-2 h-4 w-4" />
      )}
      Sign out
    </Button>
  )
}
