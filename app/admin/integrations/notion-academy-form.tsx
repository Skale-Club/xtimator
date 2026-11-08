'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { saveNotionAcademyConfig } from './actions'

interface NotionAcademyFormProps {
  currentCoursesDb: string
  currentLessonsDb: string
}

export function NotionAcademyForm({ currentCoursesDb, currentLessonsDb }: NotionAcademyFormProps) {
  const [coursesDb, setCoursesDb] = useState(currentCoursesDb)
  const [lessonsDb, setLessonsDb] = useState(currentLessonsDb)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const result = await saveNotionAcademyConfig({ coursesDb, lessonsDb })
      if (!result.ok) {
        toast.error(result.message)
      } else {
        toast.success('Academy databases saved. Changes appear within a few minutes.')
      }
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 md:p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Academy databases</h3>
        <p className="text-sm text-muted-foreground mt-1">
          The ids of the <strong>Academy Courses</strong> and <strong>Academy Lessons</strong> Notion
          databases (the 32-character id in the database URL). The Academy menu entry appears only
          once at least one course is published for Xtimator and has a published lesson.
        </p>
      </div>
      <div className="grid gap-4 max-w-xl">
        <div className="space-y-1">
          <Label htmlFor="notion-courses-db">Courses database id</Label>
          <Input
            id="notion-courses-db"
            value={coursesDb}
            onChange={(e) => setCoursesDb(e.target.value)}
            placeholder="0123456789abcdef0123456789abcdef"
            disabled={isPending}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="notion-lessons-db">Lessons database id</Label>
          <Input
            id="notion-lessons-db"
            value={lessonsDb}
            onChange={(e) => setLessonsDb(e.target.value)}
            placeholder="0123456789abcdef0123456789abcdef"
            disabled={isPending}
            autoComplete="off"
          />
        </div>
        <div>
          <Button onClick={handleSave} disabled={isPending} className="min-h-[44px]">
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
