// lib/estimate/document/labels.ts
//
// ENGINE-01 — ONE label record for all 4 renderers. Superset union (Pattern 2):
// contains every key any of the 4 current per-surface label maps use. Each
// consumer destructures only the keys it renders — unused keys are zero-cost.
// Do NOT trim this per-consumer (see estimate-document-modern.tsx's own
// comment on why the trimmed-subset approach was tried once and abandoned).

import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

export interface DocumentLabels {
  estimate: string
  project: string
  billTo: string
  summary: string
  description: string
  qty: string
  unit: string
  unitPrice: string
  lineDiscount: string
  taxable: string
  total: string
  sectionSubtotal: string
  subtotal: string
  discount: string
  discountNone: string
  discountPct: string
  discountFixed: string
  deposit: string
  depositNone: string
  depositPct: string
  depositAmount: string
  balanceDue: string
  tax: string
  grandTotal: string
  paymentTerms: string
  timeline: string
  warranty: string
  notes: string
  date: string
  estimateNum: string
  noClient: string
  addItem: string
  addSection: string
  addDetails: string
  summaryPlaceholder: string
  termsPlaceholder: string
  searchPriceBook: string
  noMatches: string
  customized: string
  usingDefault: string
  resetToDefault: string
  photos: string
  /** PDF-only (from PDF_LABELS) — used by the footer "Page N of M" render. */
  page: string
  of: string
  /** PDF-only (from PDF_LABELS) — the "Prepared by" block. */
  preparedBy: string
  /** PDFPAR-02 — signature block: signer name label ("Signed by"). */
  signedBy: string
  /** Phase 185 (PGMODE-02/03) — the company-level "Estimate Terms" card title. */
  estimateTerms: string
}

export const LABELS: Record<EstimateLanguage, DocumentLabels> = {
  en: {
    estimate: 'ESTIMATE', project: 'Project', billTo: 'Bill To', summary: 'Summary',
    description: 'Description', qty: 'Qty', unit: 'Unit', unitPrice: 'Unit Price',
    lineDiscount: 'Disc.', taxable: 'Tax', total: 'Total', sectionSubtotal: 'Section Subtotal',
    subtotal: 'Subtotal', discount: 'Discount', discountNone: 'None', discountPct: '% off',
    discountFixed: 'Fixed', deposit: 'Deposit', depositNone: 'None', depositPct: '%',
    depositAmount: 'Amount', balanceDue: 'Balance Due', tax: 'Tax', grandTotal: 'Total',
    paymentTerms: 'Payment Terms', timeline: 'Timeline', warranty: 'Warranty', notes: 'Notes',
    date: 'Date', estimateNum: 'Estimate #', noClient: 'No client linked', addItem: 'Add item',
    addSection: 'Add section', addDetails: 'Add details', summaryPlaceholder: 'Estimate summary…',
    termsPlaceholder: 'Enter details…', searchPriceBook: 'Search price book…', noMatches: 'No matches',
    customized: 'Customized', usingDefault: 'Default', resetToDefault: 'Reset to default',
    photos: 'Photos', page: 'Page', of: 'of', preparedBy: 'Prepared by',
    signedBy: 'Signed by', estimateTerms: 'Estimate Terms',
  },
  pt: {
    estimate: 'ORÇAMENTO', project: 'Projeto', billTo: 'Faturar Para', summary: 'Resumo',
    description: 'Descrição', qty: 'Qtd', unit: 'Unidade', unitPrice: 'Preço Unitário',
    lineDiscount: 'Desc.', taxable: 'Imposto', total: 'Total', sectionSubtotal: 'Subtotal da Seção',
    subtotal: 'Subtotal', discount: 'Desconto', discountNone: 'Nenhum', discountPct: '% off',
    discountFixed: 'Fixo', deposit: 'Entrada', depositNone: 'Nenhum', depositPct: '%',
    depositAmount: 'Valor', balanceDue: 'Saldo Devedor', tax: 'Imposto', grandTotal: 'Total',
    paymentTerms: 'Condições de Pagamento', timeline: 'Prazo', warranty: 'Garantia', notes: 'Observações',
    date: 'Data', estimateNum: 'Orçamento Nº', noClient: 'Nenhum cliente vinculado', addItem: 'Adicionar item',
    addSection: 'Adicionar seção', addDetails: 'Adicionar detalhes', summaryPlaceholder: 'Resumo do orçamento…',
    termsPlaceholder: 'Insira os detalhes…', searchPriceBook: 'Buscar no catálogo…', noMatches: 'Sem resultados',
    customized: 'Personalizado', usingDefault: 'Padrão', resetToDefault: 'Restaurar padrão',
    photos: 'Fotos', page: 'Página', of: 'de', preparedBy: 'Preparado por',
    signedBy: 'Assinado por', estimateTerms: 'Termos do Orçamento',
  },
  es: {
    estimate: 'PRESUPUESTO', project: 'Proyecto', billTo: 'Facturar A', summary: 'Resumen',
    description: 'Descripción', qty: 'Cant', unit: 'Unidad', unitPrice: 'Precio Unitario',
    lineDiscount: 'Desc.', taxable: 'Impuesto', total: 'Total', sectionSubtotal: 'Subtotal de Sección',
    subtotal: 'Subtotal', discount: 'Descuento', discountNone: 'Ninguno', discountPct: '% off',
    discountFixed: 'Fijo', deposit: 'Depósito', depositNone: 'Ninguno', depositPct: '%',
    depositAmount: 'Monto', balanceDue: 'Saldo Pendiente', tax: 'Impuesto', grandTotal: 'Total',
    paymentTerms: 'Términos de Pago', timeline: 'Plazo', warranty: 'Garantía', notes: 'Notas',
    date: 'Fecha', estimateNum: 'Presupuesto Nº', noClient: 'Sin cliente vinculado', addItem: 'Agregar ítem',
    addSection: 'Agregar sección', addDetails: 'Agregar detalles', summaryPlaceholder: 'Resumen del presupuesto…',
    termsPlaceholder: 'Ingrese los detalles…', searchPriceBook: 'Buscar en catálogo…', noMatches: 'Sin resultados',
    customized: 'Personalizado', usingDefault: 'Predeterminado', resetToDefault: 'Restablecer',
    photos: 'Fotos', page: 'Página', of: 'de', preparedBy: 'Preparado por',
    signedBy: 'Firmado por', estimateTerms: 'Términos del Presupuesto',
  },
}

/** Text-based language indicator for the PDF header chip (SVG flags not
 * supported by @react-pdf/renderer). Today lives only in the two PDF files —
 * moved here so any future consumer (e.g. a paginated web preview) can share it. */
export const LANG_INDICATOR: Record<EstimateLanguage, string> = {
  en: 'EN',
  pt: 'PT',
  es: 'ES',
}
