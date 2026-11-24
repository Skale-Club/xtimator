import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isSupportedLanguage, type EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

export interface SignedDocumentIdentity {
  company: {
    name: string
    owner_name: string | null
    phone: string | null
    email: string | null
    website: string | null
    address: string | null
    city: string | null
    state: string | null
    zip: string | null
  }
  project: { name: string; project_type: string | null }
  client: {
    id?: string
    name: string
    email: string | null
    phone: string | null
    address: string | null
    city: string | null
    state: string | null
    zip: string | null
  } | null
  preparedBy: string | null
  language: EstimateLanguage
}

type CompanySource = Pick<SignedDocumentIdentity['company'], 'name'> & Partial<SignedDocumentIdentity['company']>
type ClientSource = Pick<NonNullable<SignedDocumentIdentity['client']>, 'name'> & Partial<NonNullable<SignedDocumentIdentity['client']>>
type ProjectSource = {
  name: string
  project_type?: string | null
  client?: ClientSource | ClientSource[] | null
}

export const SIGNING_COMPANY_COLUMNS = 'name, owner_name, phone, email, website, address, city, state, zip'
export const SIGNING_PROJECT_COLUMNS = 'name, project_type, client:clients(id, name, email, phone, address, city, state, zip)'

export function buildSigningIdentity(
  company: CompanySource,
  project: ProjectSource,
  preparedBy: string | null,
  language: unknown,
): SignedDocumentIdentity {
  const client = Array.isArray(project.client) ? project.client[0] : project.client
  return {
    company: {
      name: company.name,
      owner_name: company.owner_name ?? null,
      phone: company.phone ?? null,
      email: company.email ?? null,
      website: company.website ?? null,
      address: company.address ?? null,
      city: company.city ?? null,
      state: company.state ?? null,
      zip: company.zip ?? null,
    },
    project: { name: project.name, project_type: project.project_type ?? null },
    client: client ? {
      ...(client.id ? { id: client.id } : {}),
      name: client.name,
      email: client.email ?? null,
      phone: client.phone ?? null,
      address: client.address ?? null,
      city: client.city ?? null,
      state: client.state ?? null,
      zip: client.zip ?? null,
    } : null,
    preparedBy,
    language: isSupportedLanguage(language) ? language : 'en',
  }
}

export async function loadSigningPreparedBy(
  supabase: SupabaseClient,
  companyId: string,
  creatorId: string | null | undefined,
  ownerName: string | null,
): Promise<string | null> {
  if (!creatorId) return ownerName
  const { data, error } = await supabase
    .from('company_members')
    .select('display_name')
    .eq('user_id', creatorId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (error) throw new Error('Could not load the document preparer', { cause: error })
  return data?.display_name || ownerName
}

export async function loadSigningIdentity(
  supabase: SupabaseClient,
  estimate: { company_id: string; project_id: string; created_by_user_id?: string | null; language?: string | null },
): Promise<SignedDocumentIdentity> {
  const [company, project] = await Promise.all([
    supabase.from('companies').select(SIGNING_COMPANY_COLUMNS).eq('id', estimate.company_id).single(),
    supabase.from('projects').select(SIGNING_PROJECT_COLUMNS).eq('id', estimate.project_id).single(),
  ])
  if (company.error || !company.data) {
    throw new Error('Could not load the document contractor', { cause: company.error })
  }
  if (project.error || !project.data) {
    throw new Error('Could not load the document project', { cause: project.error })
  }
  const preparedBy = await loadSigningPreparedBy(supabase, estimate.company_id, estimate.created_by_user_id, company.data.owner_name)
  return buildSigningIdentity(company.data, project.data, preparedBy, estimate.language)
}
