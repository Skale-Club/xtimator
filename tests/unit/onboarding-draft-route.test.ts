// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({save:vi.fn()}))
vi.mock('@/lib/actions/onboarding-draft',()=>({saveOnboardingDraft:mocks.save}))
import { POST } from '@/app/api/onboarding/draft/route'
beforeEach(()=>{vi.clearAllMocks();mocks.save.mockResolvedValue({savedAt:'2026-11-06T16:00:00Z',revision:1})})
function request(origin='http://localhost:9634',body='{}',length?:string){return new Request('http://localhost:9634/api/onboarding/draft',{method:'POST',headers:{origin,'Content-Type':'application/json',...(length?{'content-length':length}:{})},body})}
describe('onboarding close-page save endpoint',()=>{
 it('refuses cross-origin requests before accessing the draft',async()=>{expect((await POST(request('https://other.test'))).status).toBe(403);expect(mocks.save).not.toHaveBeenCalled()})
 it('refuses oversized declared requests',async()=>{expect((await POST(request(undefined,'{}','70000'))).status).toBe(413);expect(mocks.save).not.toHaveBeenCalled()})
 it('delegates same-origin saves to the same authenticated action and disables caching',async()=>{const r=await POST(request());expect(r.status).toBe(200);expect(r.headers.get('Cache-Control')).toContain('no-store');expect(mocks.save).toHaveBeenCalledWith({})})
 it('returns failure rather than a false save confirmation',async()=>{mocks.save.mockResolvedValue({error:'Authentication required'});expect((await POST(request(undefined,'bad json'))).status).toBe(400);expect(mocks.save).toHaveBeenCalledWith(null)})
})
