// lib/pdf/count-pdf-pages.ts
//
// Counts the pages of a generated PDF by its `/Type /Page` objects (`/Type /Pages`,
// the page-tree node, is excluded by the trailing `[^s]`). Pure and dependency-free;
// the ONE counter shared by the runtime page-count guard
// (lib/pdf/render-with-page-guard.ts) and scripts/pagination-render-calibration.ts,
// so "real page count" means the same thing in production and in calibration.
export function countPdfPages(pdf: Buffer | Uint8Array): number {
  const text = Buffer.isBuffer(pdf) ? pdf.toString('latin1') : Buffer.from(pdf).toString('latin1')
  return (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length
}
