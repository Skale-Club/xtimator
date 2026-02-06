import type { ServiceCategory, ServiceItem } from './types'
import { generateId } from './store'

export interface BusinessTemplate {
  id: string
  name: string
  icon: string
  description: string
  categories: Omit<ServiceCategory, 'id'>[]
  services: (Omit<ServiceItem, 'id' | 'categoryId'> & { categoryIndex: number })[]
}

export const businessTemplates: BusinessTemplate[] = [
  {
    id: 'cleaning',
    name: 'Limpeza',
    icon: 'sparkles',
    description: 'Serviços de limpeza residencial e comercial',
    categories: [
      { name: 'Limpeza Residencial', description: 'Casas e apartamentos', order: 0 },
      { name: 'Limpeza Comercial', description: 'Escritórios e lojas', order: 1 },
      { name: 'Limpeza Especializada', description: 'Pós-obra, vidros, etc', order: 2 },
    ],
    services: [
      { categoryIndex: 0, name: 'Limpeza Simples', basePrice: 150, unit: 'job', unitLabel: 'visita', isActive: true },
      { categoryIndex: 0, name: 'Limpeza Completa', basePrice: 250, unit: 'job', unitLabel: 'visita', isActive: true },
      { categoryIndex: 0, name: 'Limpeza por m²', basePrice: 8, unit: 'sqm', unitLabel: 'm²', isActive: true },
      { categoryIndex: 1, name: 'Limpeza Escritório', basePrice: 12, unit: 'sqm', unitLabel: 'm²', isActive: true },
      { categoryIndex: 1, name: 'Limpeza Loja', basePrice: 10, unit: 'sqm', unitLabel: 'm²', isActive: true },
      { categoryIndex: 2, name: 'Limpeza Pós-Obra', basePrice: 25, unit: 'sqm', unitLabel: 'm²', isActive: true },
      { categoryIndex: 2, name: 'Limpeza de Vidros', basePrice: 15, unit: 'sqm', unitLabel: 'm²', isActive: true },
    ],
  },
  {
    id: 'painting',
    name: 'Pintura',
    icon: 'paintbrush',
    description: 'Serviços de pintura residencial e comercial',
    categories: [
      { name: 'Pintura Interna', description: 'Paredes e tetos internos', order: 0 },
      { name: 'Pintura Externa', description: 'Fachadas e muros', order: 1 },
      { name: 'Pintura Especial', description: 'Texturas e efeitos', order: 2 },
    ],
    services: [
      { categoryIndex: 0, name: 'Pintura Parede Lisa', basePrice: 25, unit: 'sqm', unitLabel: 'm²', isActive: true },
      { categoryIndex: 0, name: 'Pintura Teto', basePrice: 30, unit: 'sqm', unitLabel: 'm²', isActive: true },
      { categoryIndex: 0, name: 'Pintura Porta', basePrice: 80, unit: 'unit', unitLabel: 'porta', isActive: true },
      { categoryIndex: 1, name: 'Pintura Fachada', basePrice: 35, unit: 'sqm', unitLabel: 'm²', isActive: true },
      { categoryIndex: 1, name: 'Pintura Muro', basePrice: 28, unit: 'sqm', unitLabel: 'm²', isActive: true },
      { categoryIndex: 2, name: 'Textura Grafiato', basePrice: 45, unit: 'sqm', unitLabel: 'm²', isActive: true },
      { categoryIndex: 2, name: 'Marmorizado', basePrice: 120, unit: 'sqm', unitLabel: 'm²', isActive: true },
    ],
  },
  {
    id: 'landscaping',
    name: 'Jardinagem',
    icon: 'tree',
    description: 'Serviços de paisagismo e jardinagem',
    categories: [
      { name: 'Manutenção', description: 'Corte e poda regular', order: 0 },
      { name: 'Paisagismo', description: 'Projetos e implantação', order: 1 },
      { name: 'Irrigação', description: 'Sistemas de irrigação', order: 2 },
    ],
    services: [
      { categoryIndex: 0, name: 'Corte de Grama', basePrice: 3, unit: 'sqm', unitLabel: 'm²', isActive: true },
      { categoryIndex: 0, name: 'Poda de Árvore', basePrice: 150, unit: 'unit', unitLabel: 'árvore', isActive: true },
      { categoryIndex: 0, name: 'Poda de Cerca Viva', basePrice: 25, unit: 'linear_m', unitLabel: 'm linear', isActive: true },
      { categoryIndex: 1, name: 'Projeto Paisagístico', basePrice: 50, unit: 'sqm', unitLabel: 'm²', isActive: true },
      { categoryIndex: 1, name: 'Plantio de Grama', basePrice: 35, unit: 'sqm', unitLabel: 'm²', isActive: true },
      { categoryIndex: 2, name: 'Instalação Irrigação', basePrice: 80, unit: 'sqm', unitLabel: 'm²', isActive: true },
    ],
  },
  {
    id: 'electrical',
    name: 'Elétrica',
    icon: 'zap',
    description: 'Serviços elétricos residenciais e comerciais',
    categories: [
      { name: 'Instalações', description: 'Pontos e circuitos', order: 0 },
      { name: 'Manutenção', description: 'Reparos e troca', order: 1 },
      { name: 'Projetos', description: 'Projetos elétricos', order: 2 },
    ],
    services: [
      { categoryIndex: 0, name: 'Ponto de Luz', basePrice: 120, unit: 'unit', unitLabel: 'ponto', isActive: true },
      { categoryIndex: 0, name: 'Ponto de Tomada', basePrice: 100, unit: 'unit', unitLabel: 'ponto', isActive: true },
      { categoryIndex: 0, name: 'Instalação Disjuntor', basePrice: 150, unit: 'unit', unitLabel: 'unidade', isActive: true },
      { categoryIndex: 1, name: 'Troca de Fiação', basePrice: 15, unit: 'linear_m', unitLabel: 'm linear', isActive: true },
      { categoryIndex: 1, name: 'Reparo Curto-Circuito', basePrice: 200, unit: 'job', unitLabel: 'serviço', isActive: true },
      { categoryIndex: 2, name: 'Projeto Elétrico', basePrice: 800, unit: 'job', unitLabel: 'projeto', isActive: true },
    ],
  },
  {
    id: 'plumbing',
    name: 'Hidráulica',
    icon: 'droplets',
    description: 'Serviços hidráulicos e encanamento',
    categories: [
      { name: 'Instalações', description: 'Pontos e tubulações', order: 0 },
      { name: 'Manutenção', description: 'Reparos e desentupimento', order: 1 },
      { name: 'Equipamentos', description: 'Instalação de equipamentos', order: 2 },
    ],
    services: [
      { categoryIndex: 0, name: 'Ponto de Água', basePrice: 180, unit: 'unit', unitLabel: 'ponto', isActive: true },
      { categoryIndex: 0, name: 'Ponto de Esgoto', basePrice: 200, unit: 'unit', unitLabel: 'ponto', isActive: true },
      { categoryIndex: 1, name: 'Desentupimento Pia', basePrice: 150, unit: 'job', unitLabel: 'serviço', isActive: true },
      { categoryIndex: 1, name: 'Desentupimento Vaso', basePrice: 180, unit: 'job', unitLabel: 'serviço', isActive: true },
      { categoryIndex: 1, name: 'Reparo Vazamento', basePrice: 200, unit: 'job', unitLabel: 'serviço', isActive: true },
      { categoryIndex: 2, name: 'Instalação Chuveiro', basePrice: 120, unit: 'unit', unitLabel: 'unidade', isActive: true },
      { categoryIndex: 2, name: 'Instalação Torneira', basePrice: 80, unit: 'unit', unitLabel: 'unidade', isActive: true },
    ],
  },
  {
    id: 'handyman',
    name: 'Marido de Aluguel',
    icon: 'wrench',
    description: 'Serviços gerais e pequenos reparos',
    categories: [
      { name: 'Montagem', description: 'Móveis e prateleiras', order: 0 },
      { name: 'Reparos', description: 'Pequenos consertos', order: 1 },
      { name: 'Instalações', description: 'TV, cortinas, etc', order: 2 },
    ],
    services: [
      { categoryIndex: 0, name: 'Montagem Móvel Simples', basePrice: 80, unit: 'unit', unitLabel: 'móvel', isActive: true },
      { categoryIndex: 0, name: 'Montagem Móvel Complexo', basePrice: 150, unit: 'unit', unitLabel: 'móvel', isActive: true },
      { categoryIndex: 0, name: 'Instalação Prateleira', basePrice: 60, unit: 'unit', unitLabel: 'prateleira', isActive: true },
      { categoryIndex: 1, name: 'Reparo Porta', basePrice: 100, unit: 'unit', unitLabel: 'porta', isActive: true },
      { categoryIndex: 1, name: 'Reparo Fechadura', basePrice: 80, unit: 'unit', unitLabel: 'fechadura', isActive: true },
      { categoryIndex: 2, name: 'Instalação TV', basePrice: 120, unit: 'unit', unitLabel: 'TV', isActive: true },
      { categoryIndex: 2, name: 'Instalação Cortina', basePrice: 80, unit: 'unit', unitLabel: 'cortina', isActive: true },
      { categoryIndex: 2, name: 'Hora Técnica', basePrice: 80, unit: 'hour', unitLabel: 'hora', isActive: true },
    ],
  },
  {
    id: 'custom',
    name: 'Personalizado',
    icon: 'settings',
    description: 'Configure seus próprios serviços',
    categories: [],
    services: [],
  },
]

export function generateServicesFromTemplate(template: BusinessTemplate): {
  categories: ServiceCategory[]
  services: ServiceItem[]
} {
  const categories: ServiceCategory[] = template.categories.map((cat, index) => ({
    ...cat,
    id: generateId(),
  }))

  const services: ServiceItem[] = template.services.map((service) => ({
    ...service,
    id: generateId(),
    categoryId: categories[service.categoryIndex]?.id || '',
  }))

  return { categories, services }
}
