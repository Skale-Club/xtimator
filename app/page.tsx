import { redirect } from "next/navigation"

export default function RootPage() {
  // Middleware handles logged-in users → /dashboard redirect
  // This page itself always redirects logged-out visitors to auth
  redirect("/auth/login")
}
