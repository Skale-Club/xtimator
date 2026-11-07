import { dataApiOptions, forwardDataApi } from '@/lib/supabase/data-proxy'

// SEED-059: same-origin Data API proxy. All logic lives in lib/supabase/data-proxy.ts.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = (request: Request) => forwardDataApi(request)
export const HEAD = (request: Request) => forwardDataApi(request)
export const POST = (request: Request) => forwardDataApi(request)
export const PATCH = (request: Request) => forwardDataApi(request)
export const PUT = (request: Request) => forwardDataApi(request)
export const DELETE = (request: Request) => forwardDataApi(request)
export const OPTIONS = () => dataApiOptions()
