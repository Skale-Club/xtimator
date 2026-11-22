// lib/estimate/document/units.ts
//
// Client-facing display of a line item's unit in the estimate's language. The
// stored unit stays whatever the estimator/owner typed (canonical English keys
// from lib/ai/units.ts, or free text); only the RENDER on the editor document,
// the public share page and both PDF templates goes through displayUnit().
// English is returned exactly as stored. Unknown / free-text units stay as typed.

import { normalizeUnit } from '@/lib/ai/units'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

type Forms = readonly [singular: string, plural: string]

interface UnitLabel {
  pt: Forms
  es: Forms
}

const UNIT_LABELS: Record<string, UnitLabel> = {
  each: { pt: ['unidade', 'unidades'], es: ['unidad', 'unidades'] },
  hour: { pt: ['hora', 'horas'], es: ['hora', 'horas'] },
  day: { pt: ['dia', 'dias'], es: ['día', 'días'] },
  'sq ft': { pt: ['pé²', 'pés²'], es: ['pie²', 'pies²'] },
  'linear ft': { pt: ['pé linear', 'pés lineares'], es: ['pie lineal', 'pies lineales'] },
  'cu yd': { pt: ['jarda³', 'jardas³'], es: ['yarda³', 'yardas³'] },
  job: { pt: ['serviço', 'serviços'], es: ['servicio', 'servicios'] },
  visit: { pt: ['visita', 'visitas'], es: ['visita', 'visitas'] },
  room: { pt: ['cômodo', 'cômodos'], es: ['habitación', 'habitaciones'] },
  gallon: { pt: ['galão', 'galões'], es: ['galón', 'galones'] },
  lb: { pt: ['lb', 'lb'], es: ['lb', 'lb'] },
  ton: { pt: ['tonelada', 'toneladas'], es: ['tonelada', 'toneladas'] },
  lot: { pt: ['lote', 'lotes'], es: ['lote', 'lotes'] },
  set: { pt: ['conjunto', 'conjuntos'], es: ['juego', 'juegos'] },
  step: { pt: ['etapa', 'etapas'], es: ['paso', 'pasos'] },
  window: { pt: ['janela', 'janelas'], es: ['ventana', 'ventanas'] },
  door: { pt: ['porta', 'portas'], es: ['puerta', 'puertas'] },
}

// Units the closed list in lib/ai/units.ts does not know, and the stored
// pt/es spellings the editor's own pickers write ("lote", "litro").
const EXTRA_SYNONYMS: Record<string, string> = {
  visit: 'visit', visits: 'visit', visita: 'visit', visitas: 'visit',
  room: 'room', rooms: 'room', 'cômodo': 'room', comodo: 'room', 'cômodos': 'room', comodos: 'room',
  'habitación': 'room', habitacion: 'room', habitaciones: 'room',
  gallon: 'gallon', gallons: 'gallon', gal: 'gallon', 'galão': 'gallon', galao: 'gallon', 'galões': 'gallon', 'galón': 'gallon', galon: 'gallon', galones: 'gallon',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  ton: 'ton', tons: 'ton', tonelada: 'ton', toneladas: 'ton',
  lot: 'lot', lote: 'lot', lotes: 'lot',
  set: 'set', sets: 'set', conjunto: 'set', conjuntos: 'set', juego: 'set', juegos: 'set',
  step: 'step', steps: 'step', etapa: 'step', etapas: 'step', paso: 'step', pasos: 'step',
  window: 'window', windows: 'window', janela: 'window', janelas: 'window', ventana: 'window', ventanas: 'window',
  door: 'door', doors: 'door', porta: 'door', portas: 'door', puerta: 'door', puertas: 'door',
  unit: 'each', units: 'each',
}

function foldKey(raw: string): string {
  return raw.toLowerCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(per\s+|\/\s*)/, '').trim()
}

/** Canonical key for a known unit, or null when the text is free-form. */
function canonicalUnitKey(raw: string): string | null {
  const extra = EXTRA_SYNONYMS[foldKey(raw)]
  if (extra) return extra
  const canonical = normalizeUnit(raw)
  return UNIT_LABELS[canonical] ? canonical : null
}

/**
 * The unit as the client should read it. English (and any unknown/free-text
 * unit, in any language) is returned as stored. Pass the quantity to get the
 * plural form ("2 horas"); without it the singular is used.
 */
export function displayUnit(
  unit: string | null | undefined,
  lang: EstimateLanguage | null | undefined,
  quantity?: number | null,
): string {
  if (!unit) return ''
  if (lang !== 'pt' && lang !== 'es') return unit
  const key = canonicalUnitKey(unit)
  if (!key) return unit
  const [singular, plural] = UNIT_LABELS[key][lang]
  return quantity != null && quantity !== 1 ? plural : singular
}
