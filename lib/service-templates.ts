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
    name: 'Cleaning',
    icon: 'sparkles',
    description: 'Residential and commercial cleaning services',
    categories: [
      { name: 'Residential Cleaning', description: 'Houses and apartments', order: 0 },
      { name: 'Commercial Cleaning', description: 'Offices and stores', order: 1 },
      { name: 'Specialized Cleaning', description: 'Post-construction, windows, etc', order: 2 },
    ],
    services: [
      { categoryIndex: 0, name: 'Basic Cleaning', basePrice: 150, unit: 'job', unitLabel: 'visit', isActive: true },
      { categoryIndex: 0, name: 'Deep Cleaning', basePrice: 250, unit: 'job', unitLabel: 'visit', isActive: true },
      { categoryIndex: 0, name: 'Cleaning per sqm', basePrice: 8, unit: 'sqm', unitLabel: 'sqm', isActive: true },
      { categoryIndex: 1, name: 'Office Cleaning', basePrice: 12, unit: 'sqm', unitLabel: 'sqm', isActive: true },
      { categoryIndex: 1, name: 'Store Cleaning', basePrice: 10, unit: 'sqm', unitLabel: 'sqm', isActive: true },
      { categoryIndex: 2, name: 'Post-Construction Cleaning', basePrice: 25, unit: 'sqm', unitLabel: 'sqm', isActive: true },
      { categoryIndex: 2, name: 'Window Cleaning', basePrice: 15, unit: 'sqm', unitLabel: 'sqm', isActive: true },
    ],
  },
  {
    id: 'painting',
    name: 'Painting',
    icon: 'paintbrush',
    description: 'Residential and commercial painting services',
    categories: [
      { name: 'Interior Painting', description: 'Interior walls and ceilings', order: 0 },
      { name: 'Exterior Painting', description: 'Facades and walls', order: 1 },
      { name: 'Special Painting', description: 'Textures and effects', order: 2 },
    ],
    services: [
      { categoryIndex: 0, name: 'Smooth Wall Painting', basePrice: 25, unit: 'sqm', unitLabel: 'sqm', isActive: true },
      { categoryIndex: 0, name: 'Ceiling Painting', basePrice: 30, unit: 'sqm', unitLabel: 'sqm', isActive: true },
      { categoryIndex: 0, name: 'Door Painting', basePrice: 80, unit: 'unit', unitLabel: 'door', isActive: true },
      { categoryIndex: 1, name: 'Facade Painting', basePrice: 35, unit: 'sqm', unitLabel: 'sqm', isActive: true },
      { categoryIndex: 1, name: 'Wall Painting', basePrice: 28, unit: 'sqm', unitLabel: 'sqm', isActive: true },
      { categoryIndex: 2, name: 'Textured Finish', basePrice: 45, unit: 'sqm', unitLabel: 'sqm', isActive: true },
      { categoryIndex: 2, name: 'Marble Effect', basePrice: 120, unit: 'sqm', unitLabel: 'sqm', isActive: true },
    ],
  },
  {
    id: 'landscaping',
    name: 'Landscaping',
    icon: 'tree',
    description: 'Landscaping and gardening services',
    categories: [
      { name: 'Maintenance', description: 'Regular mowing and pruning', order: 0 },
      { name: 'Landscaping', description: 'Design and implementation', order: 1 },
      { name: 'Irrigation', description: 'Irrigation systems', order: 2 },
    ],
    services: [
      { categoryIndex: 0, name: 'Lawn Mowing', basePrice: 3, unit: 'sqm', unitLabel: 'sqm', isActive: true },
      { categoryIndex: 0, name: 'Tree Pruning', basePrice: 150, unit: 'unit', unitLabel: 'tree', isActive: true },
      { categoryIndex: 0, name: 'Hedge Trimming', basePrice: 25, unit: 'linear_m', unitLabel: 'linear m', isActive: true },
      { categoryIndex: 1, name: 'Landscape Design', basePrice: 50, unit: 'sqm', unitLabel: 'sqm', isActive: true },
      { categoryIndex: 1, name: 'Lawn Installation', basePrice: 35, unit: 'sqm', unitLabel: 'sqm', isActive: true },
      { categoryIndex: 2, name: 'Irrigation Installation', basePrice: 80, unit: 'sqm', unitLabel: 'sqm', isActive: true },
    ],
  },
  {
    id: 'electrical',
    name: 'Electrical',
    icon: 'zap',
    description: 'Residential and commercial electrical services',
    categories: [
      { name: 'Installations', description: 'Outlets and circuits', order: 0 },
      { name: 'Maintenance', description: 'Repairs and replacement', order: 1 },
      { name: 'Projects', description: 'Electrical projects', order: 2 },
    ],
    services: [
      { categoryIndex: 0, name: 'Light Fixture Installation', basePrice: 120, unit: 'unit', unitLabel: 'point', isActive: true },
      { categoryIndex: 0, name: 'Outlet Installation', basePrice: 100, unit: 'unit', unitLabel: 'point', isActive: true },
      { categoryIndex: 0, name: 'Breaker Installation', basePrice: 150, unit: 'unit', unitLabel: 'unit', isActive: true },
      { categoryIndex: 1, name: 'Wiring Replacement', basePrice: 15, unit: 'linear_m', unitLabel: 'linear m', isActive: true },
      { categoryIndex: 1, name: 'Short Circuit Repair', basePrice: 200, unit: 'job', unitLabel: 'service', isActive: true },
      { categoryIndex: 2, name: 'Electrical Project', basePrice: 800, unit: 'job', unitLabel: 'project', isActive: true },
    ],
  },
  {
    id: 'plumbing',
    name: 'Plumbing',
    icon: 'droplets',
    description: 'Plumbing and piping services',
    categories: [
      { name: 'Installations', description: 'Points and pipes', order: 0 },
      { name: 'Maintenance', description: 'Repairs and unclogging', order: 1 },
      { name: 'Equipment', description: 'Equipment installation', order: 2 },
    ],
    services: [
      { categoryIndex: 0, name: 'Water Point Installation', basePrice: 180, unit: 'unit', unitLabel: 'point', isActive: true },
      { categoryIndex: 0, name: 'Drain Point Installation', basePrice: 200, unit: 'unit', unitLabel: 'point', isActive: true },
      { categoryIndex: 1, name: 'Sink Unclogging', basePrice: 150, unit: 'job', unitLabel: 'service', isActive: true },
      { categoryIndex: 1, name: 'Toilet Unclogging', basePrice: 180, unit: 'job', unitLabel: 'service', isActive: true },
      { categoryIndex: 1, name: 'Leak Repair', basePrice: 200, unit: 'job', unitLabel: 'service', isActive: true },
      { categoryIndex: 2, name: 'Shower Installation', basePrice: 120, unit: 'unit', unitLabel: 'unit', isActive: true },
      { categoryIndex: 2, name: 'Faucet Installation', basePrice: 80, unit: 'unit', unitLabel: 'unit', isActive: true },
    ],
  },
  {
    id: 'handyman',
    name: 'Handyman',
    icon: 'wrench',
    description: 'General services and minor repairs',
    categories: [
      { name: 'Assembly', description: 'Furniture and shelves', order: 0 },
      { name: 'Repairs', description: 'Minor fixes', order: 1 },
      { name: 'Installations', description: 'TV, curtains, etc', order: 2 },
    ],
    services: [
      { categoryIndex: 0, name: 'Simple Furniture Assembly', basePrice: 80, unit: 'unit', unitLabel: 'item', isActive: true },
      { categoryIndex: 0, name: 'Complex Furniture Assembly', basePrice: 150, unit: 'unit', unitLabel: 'item', isActive: true },
      { categoryIndex: 0, name: 'Shelf Installation', basePrice: 60, unit: 'unit', unitLabel: 'shelf', isActive: true },
      { categoryIndex: 1, name: 'Door Repair', basePrice: 100, unit: 'unit', unitLabel: 'door', isActive: true },
      { categoryIndex: 1, name: 'Lock Repair', basePrice: 80, unit: 'unit', unitLabel: 'lock', isActive: true },
      { categoryIndex: 2, name: 'TV Installation', basePrice: 120, unit: 'unit', unitLabel: 'TV', isActive: true },
      { categoryIndex: 2, name: 'Curtain Installation', basePrice: 80, unit: 'unit', unitLabel: 'curtain', isActive: true },
      { categoryIndex: 2, name: 'Hourly Rate', basePrice: 80, unit: 'hour', unitLabel: 'hour', isActive: true },
    ],
  },
  {
    id: 'custom',
    name: 'Custom',
    icon: 'settings',
    description: 'Configure your own services',
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
