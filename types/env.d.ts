declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // Public — safe in browser bundle
      NEXT_PUBLIC_SUPABASE_URL: string
      NEXT_PUBLIC_SUPABASE_ANON_KEY: string
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string
      // Private — NEVER prefix with NEXT_PUBLIC_; server-side only (SEC-03)
      SUPABASE_SERVICE_ROLE_KEY: string
      SUPABASE_SECRET_KEY?: string
    }
  }
}
export {}
