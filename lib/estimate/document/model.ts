// lib/estimate/document/model.ts
//
// Canonical document-model types for the webview surfaces (Classic + Modern).
// Relocated verbatim from components/workspace/estimate/estimate-document.tsx
// (Phase 182, ENGINE-01) — estimate-document.tsx now re-exports these names
// so all existing import sites (13 files) keep working unchanged.
//
// Scope note: the two PDF files' local CompanyInfo/ClientInfo interfaces are
// intentionally NOT unified into these types this phase (see 182-01-PLAN.md
// objective for why) — deferred to Phase 183.

import type { PresentationSettings } from '@/lib/estimate/presentation-settings'

export interface DocumentCompany {
  name: string
  owner_name: string | null
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  logo_url: string | null
  brand_primary_color: string | null
}

/** R4 — company-level defaults the document compares against to surface an
 * "override vs default" indicator on inherited fields. Optional: omitted in
 * view/share/PDF mode where no edit affordances are shown. */
export interface CompanyDefaults {
  payment_terms: string | null
  warranty_terms: string | null
  tax_rate: number
}

export interface DocumentClient {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
}

export interface DocumentItem {
  id: string
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  total: number
  sort_order?: number
  price_source?: 'price_book' | 'ai_estimate' | 'researched' | null
  isManuallyEdited?: boolean
  taxable?: boolean
  tax_category?: 'labor' | 'materials' | 'other' | null
  discount?: number
  cost?: number | null
  markup_pct?: number | null
}

export interface DocumentSection {
  id: string
  title: string
  subtotal: number
  items: DocumentItem[]
}

/** PDFPAR-02 — net-new signature-display data, threaded from the widened
 *  loadLatestSignedSnapshot query (lib/queries/estimate-signature.ts).
 *  Absent/null = unsigned estimate: renderers must show NO signature block
 *  at all (no placeholder), per CONTEXT.md's locked rule. */
export interface DocumentSignature {
  signerName: string
  signedAt: string
  signatureDataUrl: string
}

/** Deliberately NOT the full lib/queries/photo.ts Photo type — the document
 * surface only needs these fields. `url`, when present, is a pre-resolved
 * signed URL (view/share/PDF mode); when absent (edit mode), the consumer
 * resolves one client-side. */
export interface DocumentPhoto {
  id: string
  storage_path: string
  caption: string | null
  url?: string
}

export interface EstimateDocumentData {
  summary: string | null
  notes: string | null
  timeline: string | null
  payment_terms: string | null
  warranty_terms: string | null
  discount_type: string | null
  discount_value: number
  discount_amount: number
  tax_rate: number
  tax_amount: number
  subtotal: number
  total: number
  deposit_type: string
  deposit_value: number | null
  deposit: number
  balance_due: number
  currency_code: string
  sections: DocumentSection[]
  estimate_date: string | null
  estimate_number: string | null
  attachedPhotos?: DocumentPhoto[]
  signature?: DocumentSignature | null
  presentation_settings: PresentationSettings | null
}
