// Local browser validation only. Loads an explicit dev environment without
// passing --env-file into Next's inherited NODE_OPTIONS.
import { spawn } from 'node:child_process'
process.loadEnvFile(process.argv[2])
if (!new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.endsWith('.supabase.co')) throw Error('Development Supabase required')
process.env.NODE_ENV='development'
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--port','9649'],{stdio:'inherit',env:process.env})
child.on('exit',(code)=>process.exit(code??1))
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal))
