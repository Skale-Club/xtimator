import { redirect } from 'next/navigation'

/**
 * /projects/new is now a modal. Any direct link or bookmark to this URL
 * is redirected to the projects list with the new-project modal open.
 */
export default function NewProjectPage() {
  redirect('/projects?modal=new-project')
}
